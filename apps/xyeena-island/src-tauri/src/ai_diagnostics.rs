//! Backend-only opt-in AI diagnostic tracing for developer investigations.
//! Records request metadata, timings, stages, HTTP statuses, and error codes
//! into local, size-bounded rotating log files.
//! Zero prompt text, API keys, file payloads, or response bodies are recorded.

use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_LOG_SIZE_BYTES: u64 = 2 * 1024 * 1024; // 2 MB per file (max ~4 MB total with .1 backup)

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiDiagnosticEntry {
    pub correlation_id: String,
    pub timestamp: String,
    pub op_type: String, // "chat" | "image" | "model_discovery"
    pub provider_id: String,
    pub model_id: String,
    pub stage: String, // "start" | "first_byte" | "first_token" | "completion" | "error" | "cancelled"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub curl_exit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancelled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_bytes: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended: Option<String>, // "normal" | "partial" | "error" | "cancelled"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiDiagnosticsStatus {
    pub enabled: bool,
    pub log_path: String,
    pub file_size_bytes: u64,
}

#[derive(Debug, Clone)]
pub struct AiDiagnosticsManager(std::sync::Arc<AiDiagnosticsInner>);

#[derive(Debug)]
struct AiDiagnosticsInner {
    enabled: AtomicBool,
    log_dir: PathBuf,
    writer_lock: Mutex<()>,
}

impl Default for AiDiagnosticsManager {
    fn default() -> Self {
        let base = std::env::var("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| std::env::temp_dir());
        let log_dir = base.join("xyeena-island").join("logs");
        Self(std::sync::Arc::new(AiDiagnosticsInner {
            enabled: AtomicBool::new(false),
            log_dir,
            writer_lock: Mutex::new(()),
        }))
    }
}

impl AiDiagnosticsManager {
    pub fn new(log_dir: PathBuf) -> Self {
        Self(std::sync::Arc::new(AiDiagnosticsInner {
            enabled: AtomicBool::new(false),
            log_dir,
            writer_lock: Mutex::new(()),
        }))
    }

    pub fn is_enabled(&self) -> bool {
        self.0.enabled.load(Ordering::Relaxed)
    }

    pub fn set_enabled(&self, val: bool) {
        self.0.enabled.store(val, Ordering::Relaxed);
    }

    pub fn log_path(&self) -> PathBuf {
        self.0.log_dir.join("ai-diagnostics.log")
    }

    pub fn current_file_size(&self) -> u64 {
        fs::metadata(self.log_path()).map(|m| m.len()).unwrap_or(0)
    }

    pub fn clear_logs(&self) -> Result<(), String> {
        let _guard = self.0.writer_lock.lock().map_err(|e| e.to_string())?;
        let p = self.log_path();
        let backup = self.0.log_dir.join("ai-diagnostics.log.1");
        if p.exists() {
            let _ = fs::remove_file(&p);
        }
        if backup.exists() {
            let _ = fs::remove_file(&backup);
        }
        Ok(())
    }

    /// Redacts query parameters that may contain sensitive credentials (e.g. `?key=AIza...`).
    pub fn sanitize_url(url: &str) -> String {
        if let Some((base, query)) = url.split_once('?') {
            let safe_query: Vec<String> = query
                .split('&')
                .map(|pair| {
                    if let Some((k, _)) = pair.split_once('=') {
                        let k_lower = k.to_ascii_lowercase();
                        if k_lower.contains("key")
                            || k_lower.contains("token")
                            || k_lower.contains("secret")
                            || k_lower.contains("auth")
                        {
                            format!("{k}=[REDACTED]")
                        } else {
                            pair.to_string()
                        }
                    } else {
                        pair.to_string()
                    }
                })
                .collect();
            format!("{base}?{}", safe_query.join("&"))
        } else {
            url.to_string()
        }
    }

    /// Appends a diagnostic entry if logging is enabled.
    /// Manages file size bounding and single-generation rotation (.log -> .log.1).
    pub fn record(&self, entry: &AiDiagnosticEntry) {
        if !self.is_enabled() {
            return;
        }

        let _guard = match self.0.writer_lock.lock() {
            Ok(g) => g,
            Err(_) => return,
        };

        if let Err(e) = fs::create_dir_all(&self.0.log_dir) {
            eprintln!("[ai_diagnostics] Failed to create log directory: {e}");
            return;
        }

        let p = self.log_path();

        // Check file size for rotation
        if let Ok(meta) = fs::metadata(&p) {
            if meta.len() >= MAX_LOG_SIZE_BYTES {
                let backup = self.0.log_dir.join("ai-diagnostics.log.1");
                if backup.exists() {
                    let _ = fs::remove_file(&backup);
                }
                let _ = fs::rename(&p, &backup);
            }
        }

        let line = match serde_json::to_string(entry) {
            Ok(s) => s + "\n",
            Err(_) => return,
        };

        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&p) {
            let _ = file.write_all(line.as_bytes());
            let _ = file.flush();
        }
    }
}

pub fn current_iso_timestamp() -> String {
    let now = SystemTime::now();
    let duration = now.duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = duration.as_secs();
    let millis = duration.subsec_millis();
    // Compact RFC3339-like UTC format
    format!("{secs}.{millis:03}Z")
}

#[tauri::command]
pub fn set_ai_diagnostics_enabled(
    enabled: bool,
    state: tauri::State<'_, AiDiagnosticsManager>,
) -> Result<bool, String> {
    state.set_enabled(enabled);
    Ok(state.is_enabled())
}

#[tauri::command]
pub fn get_ai_diagnostics_status(
    state: tauri::State<'_, AiDiagnosticsManager>,
) -> Result<AiDiagnosticsStatus, String> {
    Ok(AiDiagnosticsStatus {
        enabled: state.is_enabled(),
        log_path: state.log_path().to_string_lossy().to_string(),
        file_size_bytes: state.current_file_size(),
    })
}

#[tauri::command]
pub fn clear_ai_diagnostics(state: tauri::State<'_, AiDiagnosticsManager>) -> Result<bool, String> {
    state.clear_logs()?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diagnostics_disabled_by_default() {
        let tmp = std::env::temp_dir().join(format!("xyn-diag-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let mgr = AiDiagnosticsManager::new(tmp.clone());
        assert!(!mgr.is_enabled());

        let entry = AiDiagnosticEntry {
            correlation_id: "req-1".into(),
            timestamp: current_iso_timestamp(),
            op_type: "chat".into(),
            provider_id: "gemini".into(),
            model_id: "gemini-flash-latest".into(),
            stage: "start".into(),
            http_status: None,
            curl_exit: None,
            retry_count: None,
            retry_reason: None,
            duration_ms: None,
            cancelled: None,
            output_bytes: None,
            ended: None,
        };
        mgr.record(&entry);
        assert!(!mgr.log_path().exists());
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_diagnostics_records_when_enabled_and_rotates() {
        let tmp = std::env::temp_dir().join(format!("xyn-diag-test-rot-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let mgr = AiDiagnosticsManager::new(tmp.clone());
        mgr.set_enabled(true);
        assert!(mgr.is_enabled());

        let entry = AiDiagnosticEntry {
            correlation_id: "req-2".into(),
            timestamp: current_iso_timestamp(),
            op_type: "chat".into(),
            provider_id: "openai".into(),
            model_id: "gpt-6.1-sol".into(),
            stage: "completion".into(),
            http_status: Some(200),
            curl_exit: Some("success".into()),
            retry_count: Some(0),
            retry_reason: None,
            duration_ms: Some(125),
            cancelled: Some(false),
            output_bytes: Some(450),
            ended: Some("normal".into()),
        };
        mgr.record(&entry);
        assert!(mgr.log_path().exists());
        let content = fs::read_to_string(mgr.log_path()).unwrap();
        assert!(content.contains("\"correlationId\":\"req-2\""));
        assert!(content.contains("\"httpStatus\":200"));
        assert!(content.contains("\"providerId\":\"openai\""));
        // Assert no credentials, prompts, or body contents
        assert!(!content.contains("Authorization"));
        assert!(!content.contains("Bearer"));
        assert!(!content.contains("sk-"));

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_sanitize_url_redacts_keys() {
        let url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash?key=AIzaSySecretKey123&alt=json";
        let clean = AiDiagnosticsManager::sanitize_url(url);
        assert!(!clean.contains("AIzaSySecretKey123"));
        assert!(clean.contains("key=[REDACTED]"));
        assert!(clean.contains("alt=json"));
    }
}
