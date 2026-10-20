//! Authoritative Versioned Settings Store
//!
//! Manages persistent user preferences (session aliases, focus pin, window preferences).
//! Guarantees:
//! - Atomic writes via `.tmp` file and rename.
//! - Strict schema versioning and forward/backward migration safety.
//! - NO secrets stored in JSON settings file.
//! - String sanitization on session aliases (length caps, no paths/prompts).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

pub const CURRENT_SCHEMA_VERSION: u32 = 1;
pub const MAX_ALIAS_LENGTH_CHARS: usize = 64;

/// Serialized settings document.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SettingsData {
    pub schema_version: u32,
    pub session_aliases: HashMap<String, String>,
    pub focused_session_id: Option<String>,
    #[serde(default)]
    pub pinned_session_ids: Vec<String>,
    #[serde(default)]
    pub developer_details_enabled: bool,
    #[serde(default)]
    pub custom_preferences: serde_json::Value,
}

impl Default for SettingsData {
    fn default() -> Self {
        Self {
            schema_version: CURRENT_SCHEMA_VERSION,
            session_aliases: HashMap::new(),
            focused_session_id: None,
            pinned_session_ids: Vec::new(),
            developer_details_enabled: false,
            custom_preferences: serde_json::json!({}),
        }
    }
}

/// Sanitizes a user-provided alias string:
/// - Strips whitespace
/// - Caps at MAX_ALIAS_LENGTH_CHARS
/// - Strips control characters, newlines, and path separators
pub fn sanitize_alias(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    // Remove control chars, path separators, backslashes
    let sanitized: String = trimmed
        .chars()
        .filter(|c| !c.is_control() && *c != '/' && *c != '\\' && *c != '\0')
        .take(MAX_ALIAS_LENGTH_CHARS)
        .collect();

    let clean = sanitized.trim();
    if clean.is_empty() {
        None
    } else {
        Some(clean.to_string())
    }
}

/// Thread-safe wrapper around persistent settings.
#[derive(Clone)]
pub struct SettingsStore {
    data: Arc<Mutex<SettingsData>>,
    file_path: PathBuf,
}

impl SettingsStore {
    /// Initializes store from a given file path. Loads existing or initializes default.
    pub fn new(file_path: PathBuf) -> Result<Self, String> {
        let data = if file_path.exists() {
            Self::load_file(&file_path).unwrap_or_else(|e| {
                eprintln!("[settings_store] Warning: failed to load existing settings, initializing default: {}", e);
                SettingsData::default()
            })
        } else {
            let initial = SettingsData::default();
            // Ensure parent directory exists
            if let Some(parent) = file_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            initial
        };

        let store = Self {
            data: Arc::new(Mutex::new(data)),
            file_path,
        };

        // If file didn't exist, write default
        if !store.file_path.exists() {
            let _ = store.save();
        }

        Ok(store)
    }

    /// Loads and migrates settings from disk.
    fn load_file(path: &Path) -> Result<SettingsData, String> {
        let content =
            fs::read_to_string(path).map_err(|e| format!("Failed to read settings file: {}", e))?;

        let mut raw_val: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Malformed JSON in settings file: {}", e))?;

        // Migration logic
        let version = raw_val
            .get("schema_version")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;

        if version < CURRENT_SCHEMA_VERSION {
            raw_val = Self::migrate(raw_val, version, CURRENT_SCHEMA_VERSION)?;
        }

        let parsed: SettingsData = serde_json::from_value(raw_val)
            .map_err(|e| format!("Failed to deserialize migrated settings: {}", e))?;

        Ok(parsed)
    }

    /// Schema migration pipeline.
    fn migrate(
        mut val: serde_json::Value,
        from_ver: u32,
        to_ver: u32,
    ) -> Result<serde_json::Value, String> {
        if from_ver == 0 {
            // Unversioned or initial format
            if let Some(obj) = val.as_object_mut() {
                obj.insert(
                    "schema_version".to_string(),
                    serde_json::json!(CURRENT_SCHEMA_VERSION),
                );
                if !obj.contains_key("session_aliases") {
                    obj.insert("session_aliases".to_string(), serde_json::json!({}));
                }
            }
        }
        if let Some(obj) = val.as_object_mut() {
            obj.insert("schema_version".to_string(), serde_json::json!(to_ver));
        }
        Ok(val)
    }

    /// Atomically persists settings to disk using a temporary file and rename.
    pub fn save(&self) -> Result<(), String> {
        let snapshot = {
            let lock = self
                .data
                .lock()
                .map_err(|e| format!("Mutex poisoned: {}", e))?;
            lock.clone()
        };

        let serialized = serde_json::to_string_pretty(&snapshot)
            .map_err(|e| format!("Serialization error: {}", e))?;

        if let Some(parent) = self.file_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create settings directory: {}", e))?;
        }

        let tmp_path = self.file_path.with_extension("tmp");
        fs::write(&tmp_path, serialized.as_bytes())
            .map_err(|e| format!("Failed to write tmp settings: {}", e))?;

        fs::rename(&tmp_path, &self.file_path)
            .map_err(|e| format!("Atomic rename failed: {}", e))?;

        Ok(())
    }

    pub fn set_alias(&self, session_id: &str, raw_alias: &str) -> Result<Option<String>, String> {
        let sanitized = sanitize_alias(raw_alias);
        {
            let mut lock = self
                .data
                .lock()
                .map_err(|e| format!("Mutex poisoned: {}", e))?;
            if let Some(ref alias) = sanitized {
                lock.session_aliases
                    .insert(session_id.to_string(), alias.clone());
            } else {
                lock.session_aliases.remove(session_id);
            }
        }
        self.save()?;
        Ok(sanitized)
    }

    pub fn get_alias(&self, session_id: &str) -> Option<String> {
        let lock = self.data.lock().ok()?;
        lock.session_aliases.get(session_id).cloned()
    }

    pub fn remove_alias(&self, session_id: &str) -> Result<(), String> {
        {
            let mut lock = self
                .data
                .lock()
                .map_err(|e| format!("Mutex poisoned: {}", e))?;
            lock.session_aliases.remove(session_id);
        }
        self.save()
    }

    pub fn set_focused_session(&self, session_id: Option<String>) -> Result<(), String> {
        {
            let mut lock = self
                .data
                .lock()
                .map_err(|e| format!("Mutex poisoned: {}", e))?;
            lock.focused_session_id = session_id;
        }
        self.save()
    }

    pub fn get_focused_session(&self) -> Option<String> {
        let lock = self.data.lock().ok()?;
        lock.focused_session_id.clone()
    }

    pub fn set_developer_details_enabled(&self, enabled: bool) -> Result<(), String> {
        {
            let mut lock = self
                .data
                .lock()
                .map_err(|e| format!("Mutex poisoned: {}", e))?;
            lock.developer_details_enabled = enabled;
        }
        self.save()
    }

    pub fn is_developer_details_enabled(&self) -> bool {
        let lock = self.data.lock().ok();
        lock.map(|l| l.developer_details_enabled).unwrap_or(false)
    }

    pub fn get_snapshot(&self) -> Result<SettingsData, String> {
        let lock = self
            .data
            .lock()
            .map_err(|e| format!("Mutex poisoned: {}", e))?;
        Ok(lock.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_test_temp_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("xyeena_test_settings_{}.json", nanos))
    }

    #[test]
    fn test_sanitize_alias_rules() {
        assert_eq!(
            sanitize_alias(" My Cool Session "),
            Some("My Cool Session".to_string())
        );
        assert_eq!(sanitize_alias(""), None);
        assert_eq!(sanitize_alias("   "), None);
        assert_eq!(
            sanitize_alias("path/to/script.sh"),
            Some("pathtoscript.sh".to_string())
        );
        assert_eq!(
            sanitize_alias("win\\path\\here"),
            Some("winpathhere".to_string())
        );

        let long = "a".repeat(100);
        let sanitized = sanitize_alias(&long).unwrap();
        assert_eq!(sanitized.len(), MAX_ALIAS_LENGTH_CHARS);
    }

    #[test]
    fn test_atomic_persistence_and_reload() {
        let path = make_test_temp_path();
        let store = SettingsStore::new(path.clone()).expect("init store");

        assert_eq!(store.get_focused_session(), None);
        store
            .set_alias("sess-1", "Feature Auth")
            .expect("set alias");
        store
            .set_focused_session(Some("sess-1".to_string()))
            .expect("set focus");

        assert_eq!(store.get_alias("sess-1").as_deref(), Some("Feature Auth"));
        assert_eq!(store.get_focused_session().as_deref(), Some("sess-1"));

        // Reload fresh store from disk
        let store2 = SettingsStore::new(path.clone()).expect("reload store");
        assert_eq!(store2.get_alias("sess-1").as_deref(), Some("Feature Auth"));
        assert_eq!(store2.get_focused_session().as_deref(), Some("sess-1"));

        // Cleanup
        let _ = fs::remove_file(path);
    }

    #[test]
    fn test_schema_migration_from_v0() {
        let path = make_test_temp_path();
        let v0_json = r#"{
            "session_aliases": { "old-sess": "Legacy Name" },
            "focused_session_id": "old-sess"
        }"#;
        fs::write(&path, v0_json.as_bytes()).expect("write v0");

        let store = SettingsStore::new(path.clone()).expect("load and migrate");
        let snapshot = store.get_snapshot().expect("snapshot");
        assert_eq!(snapshot.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(store.get_alias("old-sess").as_deref(), Some("Legacy Name"));

        let _ = fs::remove_file(path);
    }
}
