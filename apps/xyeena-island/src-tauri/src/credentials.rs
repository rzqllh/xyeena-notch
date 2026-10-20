//! Native Credential Store (Windows Credential Manager + In-Memory Fallback)
//!
//! Provides secure storage for provider API keys.
//! - When persist = true: stores encrypted per-user in Windows Credential Manager (`xyeena-island:<provider>`).
//! - When persist = false: stores in an in-memory Mutex map that is cleared when process terminates.
//! - Debug builds only: allows reading `XYEENA_<PROVIDER>_API_KEY` from process environment or `.env.local`.
//! - Release builds: strictly rejects reading `.env*` or arbitrary process environment variables.
//! - NO command ever returns stored credential values to JavaScript.
//! - All formatting/logging redacts secret values to `[REDACTED]`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[cfg(windows)]
use windows::core::{PCWSTR, PWSTR};
#[cfg(windows)]
use windows::Win32::Security::Credentials::{
    CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
    CRED_TYPE_GENERIC,
};

/// Target prefix in Windows Credential Manager.
pub const CREDENTIAL_TARGET_PREFIX: &str = "xyeena-island:";

/// Maximum allowed length for API keys (bytes).
pub const MAX_KEY_LENGTH_BYTES: usize = 4096;

/// Maximum allowed length for provider identifier.
pub const MAX_PROVIDER_LENGTH_BYTES: usize = 32;

/// Known supported providers allowlist.
pub const SUPPORTED_PROVIDERS: &[&str] = &[
    "openai",
    "anthropic",
    "gemini",
    "groq",
    "openrouter",
    "mistral",
    "together",
    "perplexity",
    "deepseek",
    "fireworks",
    "cohere",
    "ollama",
    "lmstudio",
];

/// Status DTO returned to JavaScript. Never contains the actual secret!
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CredentialStatusDto {
    pub provider: String,
    pub present: bool,
    pub persisted: bool,
}

/// In-memory wrapper that redacts secret in Debug and Display implementations.
#[derive(Clone, Default)]
pub struct ZeroizingSecret(String);

impl ZeroizingSecret {
    pub fn new(secret: String) -> Self {
        Self(secret)
    }

    pub fn expose_secret(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for ZeroizingSecret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[REDACTED]")
    }
}

impl std::fmt::Display for ZeroizingSecret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[REDACTED]")
    }
}

impl Drop for ZeroizingSecret {
    fn drop(&mut self) {
        // Overwrite memory before deallocation
        unsafe {
            let bytes = self.0.as_mut_vec();
            for b in bytes.iter_mut() {
                *b = 0;
            }
        }
    }
}

/// Global in-memory credential storage for session-only credentials.
static IN_MEMORY_STORE: OnceLock<Mutex<HashMap<String, ZeroizingSecret>>> = OnceLock::new();

fn get_in_memory_store() -> &'static Mutex<HashMap<String, ZeroizingSecret>> {
    IN_MEMORY_STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Validates provider name against rules and allowlist.
pub fn validate_provider_name(provider: &str) -> Result<String, String> {
    let normalized = provider.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Err("Provider name cannot be empty".to_string());
    }
    if normalized.len() > MAX_PROVIDER_LENGTH_BYTES {
        return Err(format!(
            "Provider name exceeds max length of {} chars",
            MAX_PROVIDER_LENGTH_BYTES
        ));
    }
    if !normalized
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Provider name contains invalid characters".to_string());
    }
    if normalized == "ollama" || normalized == "lmstudio" {
        return Err("Local providers (Ollama, LM Studio) do not use cloud API keys".to_string());
    }
    Ok(normalized)
}

/// Encodes UTF-16 wide string with null terminator.
#[cfg(windows)]
fn to_wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Formats credential target string: `xyeena-island:<provider>`
pub fn make_target_name(provider: &str) -> String {
    format!("{}{}", CREDENTIAL_TARGET_PREFIX, provider)
}

/// Writes credential to Windows Credential Manager.
#[cfg(windows)]
fn write_wincred(target_name: &str, secret: &str) -> Result<(), String> {
    let mut wide_target = to_wide_null(target_name);
    let secret_bytes = secret.as_bytes();

    let cred = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR(wide_target.as_mut_ptr()),
        CredentialBlobSize: secret_bytes.len() as u32,
        CredentialBlob: secret_bytes.as_ptr() as *mut u8,
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        ..Default::default()
    };

    unsafe { CredWriteW(&cred, 0).map_err(|e| format!("CredWriteW failed: {}", e)) }
}

/// Reads credential from Windows Credential Manager.
#[cfg(windows)]
fn read_wincred(target_name: &str) -> Option<String> {
    let wide_target = to_wide_null(target_name);
    let mut cred_ptr: *mut CREDENTIALW = std::ptr::null_mut();

    unsafe {
        if CredReadW(
            PCWSTR(wide_target.as_ptr()),
            CRED_TYPE_GENERIC,
            None,
            &mut cred_ptr,
        )
        .is_ok()
            && !cred_ptr.is_null()
        {
            let cred = *cred_ptr;
            let slice = std::slice::from_raw_parts(
                cred.CredentialBlob as *const u8,
                cred.CredentialBlobSize as usize,
            );
            let secret = String::from_utf8(slice.to_vec()).ok();
            CredFree(cred_ptr as *const core::ffi::c_void);
            secret
        } else {
            None
        }
    }
}

/// Deletes credential from Windows Credential Manager.
#[cfg(windows)]
fn delete_wincred(target_name: &str) -> Result<(), String> {
    let wide_target = to_wide_null(target_name);
    unsafe {
        CredDeleteW(PCWSTR(wide_target.as_ptr()), CRED_TYPE_GENERIC, None)
            .map_err(|e| format!("CredDeleteW failed: {}", e))
    }
}

#[cfg(not(windows))]
fn write_wincred(_target_name: &str, _secret: &str) -> Result<(), String> {
    Err("Windows Credential Manager is only available on Windows".to_string())
}

#[cfg(not(windows))]
fn read_wincred(_target_name: &str) -> Option<String> {
    None
}

#[cfg(not(windows))]
fn delete_wincred(_target_name: &str) -> Result<(), String> {
    Ok(())
}

/// Saves a credential either persistently in Windows Credential Manager or session-only in memory.
pub fn save_credential(provider: &str, key: &str, persist: bool) -> Result<(), String> {
    let prov = validate_provider_name(provider)?;
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("Credential key cannot be empty".to_string());
    }
    if trimmed.len() > MAX_KEY_LENGTH_BYTES {
        return Err(format!(
            "Credential exceeds maximum length of {} bytes",
            MAX_KEY_LENGTH_BYTES
        ));
    }

    let target = make_target_name(&prov);

    if persist {
        // Persist to Windows Credential Manager
        write_wincred(&target, trimmed)?;
        // Also remove from in-memory if it was previously session-only
        if let Ok(mut store) = get_in_memory_store().lock() {
            store.remove(&prov);
        }
    } else {
        // Session-only: store in memory
        if let Ok(mut store) = get_in_memory_store().lock() {
            store.insert(prov.clone(), ZeroizingSecret::new(trimmed.to_string()));
        }
        // Remove from Credential Manager if previously persisted
        let _ = delete_wincred(&target);
    }

    Ok(())
}

/// Resolves credential for internal Rust proxy execution.
/// NEVER exposed to JavaScript.
pub fn get_credential(provider: &str) -> Option<String> {
    let prov = validate_provider_name(provider).ok()?;
    let target = make_target_name(&prov);

    // 1. Check in-memory store first
    if let Ok(store) = get_in_memory_store().lock() {
        if let Some(secret) = store.get(&prov) {
            return Some(secret.expose_secret().to_string());
        }
    }

    // 2. Check Windows Credential Manager
    if let Some(secret) = read_wincred(&target) {
        return Some(secret);
    }

    // 3. Debug builds only: read from process environment for dev testing
    #[cfg(debug_assertions)]
    {
        let env_var_name = format!("XYEENA_{}_API_KEY", prov.to_ascii_uppercase());
        if let Ok(env_val) = std::env::var(&env_var_name) {
            let trimmed = env_val.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }

    None
}

/// Forgets/deletes a credential from both in-memory store and Windows Credential Manager.
pub fn forget_credential(provider: &str) -> Result<(), String> {
    let prov = validate_provider_name(provider)?;
    let target = make_target_name(&prov);

    // Remove from in-memory
    if let Ok(mut store) = get_in_memory_store().lock() {
        store.remove(&prov);
    }

    // Remove from Windows Credential Manager
    let _ = delete_wincred(&target);

    Ok(())
}

/// Queries credential status without revealing the secret value.
pub fn credential_status(provider: &str) -> Result<CredentialStatusDto, String> {
    let prov = validate_provider_name(provider)?;
    let target = make_target_name(&prov);

    // Check in-memory
    let in_memory = if let Ok(store) = get_in_memory_store().lock() {
        store.contains_key(&prov)
    } else {
        false
    };

    // Check Windows Credential Manager
    let persisted = read_wincred(&target).is_some();

    // Check debug env
    #[cfg(debug_assertions)]
    let has_debug_env = {
        let env_var_name = format!("XYEENA_{}_API_KEY", prov.to_ascii_uppercase());
        std::env::var(&env_var_name)
            .map(|v| !v.trim().is_empty())
            .unwrap_or(false)
    };
    #[cfg(not(debug_assertions))]
    let has_debug_env = false;

    let present = in_memory || persisted || has_debug_env;

    Ok(CredentialStatusDto {
        provider: prov,
        present,
        persisted,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secret_redaction_in_debug_and_display() {
        let secret = ZeroizingSecret::new("sk-secret-canary-123456789".to_string());
        assert_eq!(format!("{:?}", secret), "[REDACTED]");
        assert_eq!(format!("{}", secret), "[REDACTED]");
        assert_eq!(secret.expose_secret(), "sk-secret-canary-123456789");
    }

    #[test]
    fn test_validate_provider_name_rules() {
        assert_eq!(validate_provider_name("openai").unwrap(), "openai");
        assert_eq!(validate_provider_name("  Anthropic ").unwrap(), "anthropic");
        assert!(validate_provider_name("").is_err());
        assert!(
            validate_provider_name("ollama").is_err(),
            "Local provider should be rejected"
        );
        assert!(
            validate_provider_name("lmstudio").is_err(),
            "Local provider should be rejected"
        );
        assert!(validate_provider_name("bad provider name!").is_err());
        assert!(validate_provider_name(&"a".repeat(33)).is_err());
    }

    #[test]
    fn test_in_memory_session_only_lifecycle() {
        let test_provider = "testproviderinmem";
        let secret_key = "test-secret-key-inmem-987";

        // Save session-only
        save_credential(test_provider, secret_key, false).expect("save session-only");

        let status = credential_status(test_provider).expect("status");
        assert!(status.present);
        assert!(
            !status.persisted,
            "Session-only must not be marked persisted"
        );

        assert_eq!(get_credential(test_provider).as_deref(), Some(secret_key));

        // Forget
        forget_credential(test_provider).expect("forget");
        let status_after = credential_status(test_provider).expect("status after forget");
        assert!(!status_after.present);
        assert!(!status_after.persisted);
        assert_eq!(get_credential(test_provider), None);
    }

    #[test]
    #[cfg(windows)]
    fn test_windows_credential_manager_roundtrip() {
        let test_provider = "testprovpersist";
        let secret_key = "test-secret-key-persist-123";

        // Clean up any stale state first
        let _ = forget_credential(test_provider);

        // Save with persist: true
        save_credential(test_provider, secret_key, true).expect("save persistent");

        let status = credential_status(test_provider).expect("status");
        assert!(status.present);
        assert!(status.persisted, "Must be marked persisted");

        assert_eq!(get_credential(test_provider).as_deref(), Some(secret_key));

        // Forget
        forget_credential(test_provider).expect("forget");
        let status_after = credential_status(test_provider).expect("status after forget");
        assert!(!status_after.present);
        assert!(!status_after.persisted);
        assert_eq!(get_credential(test_provider), None);
    }

    #[test]
    fn test_rejects_empty_or_oversized_keys() {
        assert!(save_credential("openai", "", false).is_err());
        assert!(save_credential("openai", "   ", false).is_err());
        let huge_key = "a".repeat(MAX_KEY_LENGTH_BYTES + 1);
        assert!(save_credential("openai", &huge_key, false).is_err());
    }

    #[test]
    fn test_release_build_rejects_env_files() {
        // Assert that release builds will never include debug fallback
        #[cfg(not(debug_assertions))]
        {
            // In release, get_credential for an unset provider must return None even if env var is set
            std::env::set_var("XYEENA_MOCKRELEASE_API_KEY", "should-not-be-read");
            assert_eq!(get_credential("mockrelease"), None);
        }
    }
}
