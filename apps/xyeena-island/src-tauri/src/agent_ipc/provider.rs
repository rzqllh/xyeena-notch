//! S03 — Provider hook installer for Xyeena Notch.
//!
//! Detects, previews, backs up, installs, repairs, and uninstalls Xyeena Notch
//! hook entries for supported CLI/IDE agent providers.
//!
//! # Safety Invariants
//!
//! - No config file is written until `install_hooks` is called with explicit
//!   approval from the user (enforced at the Tauri command layer, not here).
//! - All existing hook groups are preserved verbatim during install and repair.
//! - The Xyeena Notch hook group (`xyeena-notch`) is distinct from all other
//!   groups, including `xyeena-rig-guided`. Rig's entries are never touched.
//! - Uninstall removes only the `xyeena-notch` group; all other groups survive.
//! - Backup files are written to `<config_path>.xyeena-notch.bak` before
//!   any write. Atomic write via temp-file rename.
//! - This module never spawns background processes or persistent services.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fmt;
use std::path::{Path, PathBuf};

/// Xyeena Notch hook group ownership marker.
///
/// Used as the key under which Notch registers its own hooks. Must not collide
/// with `xyeena-rig-guided` or any third-party group name.
pub const XYEENA_NOTCH_GROUP: &str = "xyeena-notch";

/// Maximum path length accepted for relay binary paths.
pub const MAX_PATH_LEN: usize = 4096;

// ---------------------------------------------------------------------------
// Provider definitions
// ---------------------------------------------------------------------------

/// A supported provider's identity and configuration contract.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderDef {
    /// Canonical provider ID (e.g. "antigravity", "claude-code").
    pub id: String,
    /// Display name for the user.
    pub display_name: String,
    /// Hook configuration format used by this provider.
    pub hook_format: HookFormat,
    /// How to locate the binary to detect installation.
    pub detection: DetectionStrategy,
    /// Hook events supported by this provider.
    pub supported_events: Vec<String>,
}

/// The hook configuration serialization format used by a provider.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HookFormat {
    /// Antigravity / AGY: `hooks.json` with named groups, each group containing
    /// event maps with arrays of `{ type, command, timeout }` entries.
    AgyhooksJson,
    /// Claude Code: `.claude/settings.json` with a `hooks` top-level key.
    ClaudeSettingsJson,
    /// Gemini CLI / Codex: not yet verified — pending documentation review.
    Unverified,
}

/// How to check whether a provider is installed on this machine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DetectionStrategy {
    /// Verify a binary exists at the given absolute path.
    BinaryPath(String),
    /// Verify any of these binaries exist (first match wins).
    AnyBinaryPath(Vec<String>),
    /// Verify that a config directory exists.
    ConfigDir(String),
    /// Detection is not possible on this platform; always returns `NotInstalled`.
    Unavailable,
}

// ---------------------------------------------------------------------------
// Detection result
// ---------------------------------------------------------------------------

/// Result of a provider detection pass.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "status")]
pub enum DetectionResult {
    /// Provider binary/config found. `path` is the resolved binary or config path.
    Installed { path: String },
    /// Provider was not found on this machine.
    NotInstalled,
    /// Detection strategy is not applicable on this OS.
    Unavailable,
}

impl fmt::Display for DetectionResult {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Installed { path } => write!(f, "installed ({path})"),
            Self::NotInstalled => write!(f, "not installed"),
            Self::Unavailable => write!(f, "unavailable on this platform"),
        }
    }
}

// ---------------------------------------------------------------------------
// Config path resolution
// ---------------------------------------------------------------------------

/// Resolved hook config file path for a provider.
#[derive(Debug, Clone)]
pub struct ResolvedConfig {
    /// Absolute path to the provider's hooks config file.
    pub config_path: PathBuf,
    /// Scope: workspace-level or user-global.
    pub scope: ConfigScope,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConfigScope {
    Workspace,
    UserGlobal,
}

// ---------------------------------------------------------------------------
// Hook entry types
// ---------------------------------------------------------------------------

/// A single hook command entry in AGY hooks.json format.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgyHookEntry {
    #[serde(rename = "type")]
    pub hook_type: String,
    pub command: String,
    pub timeout: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matcher: Option<String>,
}

// ---------------------------------------------------------------------------
// Preview / diff
// ---------------------------------------------------------------------------

/// Preview of what `install_hooks` will change.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookInstallPreview {
    /// Provider ID.
    pub provider_id: String,
    /// Absolute path to the config file that would be written.
    pub config_path: String,
    /// Absolute path to the backup file that will be created before write.
    pub backup_path: String,
    /// Scope (workspace or user_global).
    pub scope: String,
    /// JSON representation of the hook group that will be merged in.
    pub group_to_add: Value,
    /// Whether the file already exists.
    pub file_exists: bool,
    /// Whether a `xyeena-notch` group already exists (repair scenario).
    pub existing_group_present: bool,
    /// All existing hook group names that will be preserved unchanged.
    pub preserved_groups: Vec<String>,
    /// Whether this preview is safe to approve (no destructive changes).
    pub safe: bool,
    /// Any warnings about this install (e.g. unverified provider format).
    pub warnings: Vec<String>,
}

// ---------------------------------------------------------------------------
// Install outcome
// ---------------------------------------------------------------------------

/// Result of an install, repair, or uninstall operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookInstallOutcome {
    pub provider_id: String,
    pub config_path: String,
    pub backup_path: Option<String>,
    pub action: HookAction,
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HookAction {
    Install,
    Repair,
    Uninstall,
    NoChange,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub enum ProviderError {
    /// Provider is not installed on this machine.
    NotInstalled(String),
    /// The config file could not be read or parsed.
    ConfigReadError { path: String, detail: String },
    /// The config file could not be written.
    ConfigWriteError { path: String, detail: String },
    /// Backup creation failed.
    BackupError { path: String, detail: String },
    /// The provider's hook format is unverified; install is blocked.
    UnverifiedFormat(String),
    /// Path length exceeds the safety limit.
    PathTooLong,
    /// The hook group name collides with a protected group.
    ProtectedGroupConflict(String),
    /// Command cannot be executed robustly (e.g. spaces without 8.3 and no workspace shim).
    UnexecutableCommand { path: String, detail: String },
}

impl fmt::Display for ProviderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotInstalled(id) => write!(f, "provider '{id}' is not installed"),
            Self::ConfigReadError { path, detail } => {
                write!(f, "cannot read config at '{path}': {detail}")
            }
            Self::ConfigWriteError { path, detail } => {
                write!(f, "cannot write config at '{path}': {detail}")
            }
            Self::BackupError { path, detail } => {
                write!(f, "cannot create backup at '{path}': {detail}")
            }
            Self::UnverifiedFormat(id) => {
                write!(f, "hook format for '{id}' is unverified — install blocked")
            }
            Self::PathTooLong => write!(f, "path exceeds maximum length ({MAX_PATH_LEN})"),
            Self::ProtectedGroupConflict(name) => {
                write!(
                    f,
                    "hook group '{name}' is protected and must not be overwritten"
                )
            }
            Self::UnexecutableCommand { path, detail } => {
                write!(f, "command for '{path}' cannot execute robustly: {detail}")
            }
        }
    }
}

impl std::error::Error for ProviderError {}

// ---------------------------------------------------------------------------
// Protected groups
// ---------------------------------------------------------------------------

/// Hook group names that Xyeena Notch must never overwrite or remove.
const PROTECTED_GROUPS: &[&str] = &["xyeena-rig-guided", "coucou"];

fn is_protected_group(name: &str) -> bool {
    PROTECTED_GROUPS.contains(&name)
}

// ---------------------------------------------------------------------------
// Provider catalog and path resolution
// ---------------------------------------------------------------------------

/// Standard provider definitions for known coding agents.
pub fn known_providers() -> Vec<ProviderDef> {
    let local_agy = std::env::var("LOCALAPPDATA")
        .map(|l| format!(r"{l}\agy\bin\agy.exe"))
        .unwrap_or_default();
    let npm_claude = std::env::var("APPDATA")
        .map(|a| format!(r"{a}\npm\claude.cmd"))
        .unwrap_or_default();

    vec![
        ProviderDef {
            id: "antigravity".into(),
            display_name: "Antigravity (AGY)".into(),
            hook_format: HookFormat::AgyhooksJson,
            detection: if !local_agy.is_empty() {
                DetectionStrategy::BinaryPath(local_agy)
            } else {
                DetectionStrategy::Unavailable
            },
            supported_events: vec!["PreInvocation".into(), "PostToolUse".into(), "Stop".into()],
        },
        ProviderDef {
            id: "claude-code".into(),
            display_name: "Claude Code".into(),
            hook_format: HookFormat::ClaudeSettingsJson,
            detection: if !npm_claude.is_empty() {
                DetectionStrategy::BinaryPath(npm_claude)
            } else {
                DetectionStrategy::Unavailable
            },
            supported_events: vec![
                "SessionStart".into(),
                "PreToolUse".into(),
                "PostToolUse".into(),
                "Stop".into(),
            ],
        },
        ProviderDef {
            id: "gemini-cli".into(),
            display_name: "Gemini CLI".into(),
            hook_format: HookFormat::Unverified,
            detection: DetectionStrategy::Unavailable,
            supported_events: vec![],
        },
        ProviderDef {
            id: "codex".into(),
            display_name: "Codex CLI".into(),
            hook_format: HookFormat::Unverified,
            detection: DetectionStrategy::Unavailable,
            supported_events: vec![],
        },
    ]
}

/// Resolves the absolute path to `xyeena-agent-relay.exe`.
///
/// Searches alongside the running application executable, and falls back to
/// `target/debug` during development.
pub fn resolve_relay_exe_path() -> Result<PathBuf, ProviderError> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let candidate = parent.join("xyeena-agent-relay.exe");
            if candidate.exists() {
                return Ok(candidate);
            }
        }
    }
    let fallback = PathBuf::from("target/debug/xyeena-agent-relay.exe");
    if fallback.exists() {
        return Ok(std::fs::canonicalize(fallback)
            .unwrap_or(PathBuf::from("target/debug/xyeena-agent-relay.exe")));
    }
    Err(ProviderError::ConfigReadError {
        path: "xyeena-agent-relay.exe".into(),
        detail: "Relay executable not found alongside application".into(),
    })
}

// ---------------------------------------------------------------------------
// Core logic — detection
// ---------------------------------------------------------------------------

/// Detect whether a provider is installed on this machine.
pub fn detect_provider(def: &ProviderDef) -> DetectionResult {
    #[cfg(not(windows))]
    {
        let _ = def;
        return DetectionResult::Unavailable;
    }

    #[cfg(windows)]
    match &def.detection {
        DetectionStrategy::BinaryPath(path) => {
            if path.len() > MAX_PATH_LEN {
                return DetectionResult::NotInstalled;
            }
            if std::path::Path::new(path).exists() {
                DetectionResult::Installed { path: path.clone() }
            } else {
                DetectionResult::NotInstalled
            }
        }
        DetectionStrategy::AnyBinaryPath(paths) => {
            for path in paths {
                if path.len() <= MAX_PATH_LEN && std::path::Path::new(path).exists() {
                    return DetectionResult::Installed { path: path.clone() };
                }
            }
            DetectionResult::NotInstalled
        }
        DetectionStrategy::ConfigDir(dir) => {
            if dir.len() > MAX_PATH_LEN {
                return DetectionResult::NotInstalled;
            }
            if std::path::Path::new(dir).is_dir() {
                DetectionResult::Installed { path: dir.clone() }
            } else {
                DetectionResult::NotInstalled
            }
        }
        DetectionStrategy::Unavailable => DetectionResult::Unavailable,
    }
}

// ---------------------------------------------------------------------------
// Core logic — AGY hooks.json format
// ---------------------------------------------------------------------------

#[cfg(windows)]
fn sanitize_cmd_path(path_str: &str) -> String {
    use std::ffi::OsString;
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetShortPathNameW;

    if !path_str.contains(' ') {
        return path_str.to_string();
    }
    let p = Path::new(path_str);
    let wide: Vec<u16> = p
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut buffer = [0u16; 1024];
    unsafe {
        let len = GetShortPathNameW(PCWSTR::from_raw(wide.as_ptr()), Some(&mut buffer));
        if len > 0 && (len as usize) < buffer.len() {
            let short = OsString::from_wide(&buffer[..len as usize]);
            let s = short.to_string_lossy().to_string();
            if !s.contains(' ') {
                return s;
            }
        }
    }
    path_str.to_string()
}

#[cfg(not(windows))]
fn sanitize_cmd_path(path_str: &str) -> String {
    path_str.to_string()
}

/// Compute the relative path from `base` to `target`.
pub fn diff_paths(target: &Path, base: &Path) -> Option<PathBuf> {
    let target_clean = target
        .canonicalize()
        .unwrap_or_else(|_| target.to_path_buf());
    let base_clean = base.canonicalize().unwrap_or_else(|_| base.to_path_buf());

    let target_comps: Vec<_> = target_clean.components().collect();
    let base_comps: Vec<_> = base_clean.components().collect();

    if target_comps.is_empty()
        || base_comps.is_empty()
        || target_comps.first() != base_comps.first()
    {
        return None;
    }

    let mut common = 0;
    while common < target_comps.len()
        && common < base_comps.len()
        && target_comps[common] == base_comps[common]
    {
        common += 1;
    }

    let mut result = PathBuf::new();
    for _ in common..base_comps.len() {
        result.push("..");
    }
    for comp in &target_comps[common..] {
        result.push(comp.as_os_str());
    }
    Some(result)
}

/// Resolve a robust cmd.exe-compatible command prefix for the relay executable.
///
/// Invariants:
/// - Never introduces double quotes into the command string (prevents Go os/exec \" quoting bug).
/// - If path has no spaces: uses path as-is.
/// - If path has spaces: tries 8.3 short path first.
/// - If 8.3 is unavailable and config_path is provided:
///   1. Tries relative path from config_dir (if space-free).
///   2. If relative path still has spaces or is outside workspace, writes a local `.cmd` shim in config_dir.
/// - If unable to produce an executable command without quotes, fails closed with `UnexecutableCommand`.
pub fn resolve_agy_command_prefix(
    relay_exe_path: &str,
    config_path: Option<&Path>,
    write_shim: bool,
) -> Result<String, ProviderError> {
    if relay_exe_path.len() > MAX_PATH_LEN {
        return Err(ProviderError::PathTooLong);
    }

    // Tier 1: Path has no spaces -> clean direct invocation
    if !relay_exe_path.contains(' ') {
        return Ok(relay_exe_path.to_string());
    }

    // Tier 2: 8.3 short path (works globally if enabled on volume)
    let sanitized = sanitize_cmd_path(relay_exe_path);
    if !sanitized.contains(' ') {
        return Ok(sanitized);
    }

    // Tier 3: Workspace-relative path or workspace shim
    if let Some(cfg) = config_path {
        let config_dir = cfg.parent().unwrap_or_else(|| Path::new("."));

        // In Antigravity, workspace hooks live inside .agents / .agent / _agents / _agent,
        // but hook commands are executed by the IDE with the workspace root as the CWD.
        let workspace_root = if config_dir
            .file_name()
            .map(|n| {
                let s = n.to_string_lossy();
                s.eq_ignore_ascii_case(".agents")
                    || s.eq_ignore_ascii_case(".agent")
                    || s.eq_ignore_ascii_case("_agents")
                    || s.eq_ignore_ascii_case("_agent")
            })
            .unwrap_or(false)
        {
            config_dir.parent().unwrap_or(config_dir)
        } else {
            config_dir
        };

        // 3a: Try relative path from workspace_root
        if let Some(rel) = diff_paths(Path::new(relay_exe_path), workspace_root) {
            let rel_str = rel.to_string_lossy().to_string();
            if !rel_str.contains(' ') && !rel_str.starts_with("..") {
                return Ok(rel_str);
            }
        }

        // 3b: Try relative path from config_dir
        if let Some(rel) = diff_paths(Path::new(relay_exe_path), config_dir) {
            let rel_str = rel.to_string_lossy().to_string();
            if !rel_str.contains(' ') {
                return Ok(rel_str);
            }
        }

        // 3b: Workspace shim batch script in config_dir
        let shim_name = "xyeena-agent-relay.cmd";
        let shim_path = config_dir.join(shim_name);
        if write_shim {
            // Write UTF-8 batch file with @chcp 65001 >nul for Unicode support
            let content = format!("@chcp 65001 >nul\r\n@\"{}\" %*\r\n", relay_exe_path);
            std::fs::write(&shim_path, content.as_bytes()).map_err(|e| {
                ProviderError::ConfigWriteError {
                    path: shim_path.to_string_lossy().to_string(),
                    detail: format!("failed to write relay shim: {e}"),
                }
            })?;
        }
        return Ok(shim_name.to_string());
    }

    // Tier 4: Cannot execute without quotes and no workspace directory to place shim
    Err(ProviderError::UnexecutableCommand {
        path: relay_exe_path.to_string(),
        detail: "Path contains spaces and 8.3 short names are unavailable; cmd.exe cannot execute quoted paths without a workspace shim.".to_string(),
    })
}

/// Build the Xyeena Notch hook group for AGY hooks.json format with config scoping.
pub fn build_agy_notch_group_scoped(
    relay_exe_path: &str,
    config_path: Option<&Path>,
    write_shim: bool,
) -> Result<Value, ProviderError> {
    let cmd_prefix = resolve_agy_command_prefix(relay_exe_path, config_path, write_shim)?;

    let make_entry = |event: &str, timeout: u32| -> Value {
        serde_json::json!({
            "type": "command",
            "command": format!("{} {}", cmd_prefix, event),
            "timeout": timeout
        })
    };

    let group = serde_json::json!({
        "PreInvocation": [make_entry("PreInvocation", 3)],
        "PostToolUse": [
            {
                "matcher": "*",
                "hooks": [make_entry("PostToolUse", 3)]
            }
        ],
        "Stop": [make_entry("Stop", 3)]
    });

    Ok(group)
}

/// Build the Xyeena Notch hook group for AGY hooks.json format.
pub fn build_agy_notch_group(relay_exe_path: &str) -> Result<Value, ProviderError> {
    build_agy_notch_group_scoped(relay_exe_path, None, false)
}

/// Read an AGY hooks.json file, returning the parsed object.
///
/// Returns an empty object `{}` if the file does not exist.
pub fn read_agy_hooks(config_path: &Path) -> Result<Value, ProviderError> {
    if !config_path.exists() {
        return Ok(serde_json::json!({}));
    }

    let path_str = config_path.to_string_lossy().to_string();
    let content =
        std::fs::read_to_string(config_path).map_err(|e| ProviderError::ConfigReadError {
            path: path_str.clone(),
            detail: e.to_string(),
        })?;

    serde_json::from_str::<Value>(&content).map_err(|e| ProviderError::ConfigReadError {
        path: path_str,
        detail: format!("JSON parse error: {e}"),
    })
}

/// Preview what installing Notch hooks would change in an AGY hooks.json file.
///
/// Does not write anything. Returns a preview with all preserved groups listed.
pub fn preview_agy_install(
    config_path: &Path,
    scope: ConfigScope,
    relay_exe_path: &str,
) -> Result<HookInstallPreview, ProviderError> {
    let current = read_agy_hooks(config_path)?;
    let group_to_add = build_agy_notch_group_scoped(relay_exe_path, Some(config_path), false)?;
    let path_str = config_path.to_string_lossy().to_string();
    let backup_path = format!("{path_str}.xyeena-notch.bak");

    let existing_group_present = current
        .as_object()
        .map(|o| o.contains_key(XYEENA_NOTCH_GROUP))
        .unwrap_or(false);

    let preserved_groups: Vec<String> = current
        .as_object()
        .map(|o| {
            o.keys()
                .filter(|k| k.as_str() != XYEENA_NOTCH_GROUP)
                .cloned()
                .collect()
        })
        .unwrap_or_default();

    // Warn if any preserved group is protected (double-check we won't touch them)
    let mut warnings = Vec::new();
    for group in &preserved_groups {
        if is_protected_group(group) {
            warnings.push(format!(
                "Protected group '{group}' will be preserved unchanged."
            ));
        }
    }

    Ok(HookInstallPreview {
        provider_id: "antigravity".to_string(),
        config_path: path_str,
        backup_path,
        scope: match scope {
            ConfigScope::Workspace => "workspace".to_string(),
            ConfigScope::UserGlobal => "user_global".to_string(),
        },
        group_to_add,
        file_exists: config_path.exists(),
        existing_group_present,
        preserved_groups,
        safe: true,
        warnings,
    })
}

/// Install or repair Xyeena Notch hooks in an AGY hooks.json file.
///
/// **Requires explicit prior user approval** — this function must only be
/// called from a Tauri command that has already surfaced the preview and
/// received an explicit confirmation signal.
///
/// Invariants:
/// - Backs up the existing file first (if it exists).
/// - Merges `xyeena-notch` group into the existing JSON; all other groups
///   are preserved verbatim.
/// - Write is atomic: writes to a temp file, then renames.
/// - If `XYEENA_NOTCH_GROUP` already exists, it is replaced (repair).
/// - Protected groups (e.g. `xyeena-rig-guided`, `coucou`) are never touched.
pub fn install_agy_hooks(
    config_path: &Path,
    relay_exe_path: &str,
) -> Result<HookInstallOutcome, ProviderError> {
    let path_str = config_path.to_string_lossy().to_string();
    let backup_path_str = format!("{path_str}.xyeena-notch.bak");

    // Read existing config (or start fresh)
    let mut current = read_agy_hooks(config_path)?;

    // Ensure we have an object at the top level
    if !current.is_object() {
        current = serde_json::json!({});
    }

    // Guard: never overwrite protected groups
    if let Some(obj) = current.as_object() {
        for key in obj.keys() {
            if is_protected_group(key.as_str()) && key.as_str() == XYEENA_NOTCH_GROUP {
                return Err(ProviderError::ProtectedGroupConflict(key.clone()));
            }
        }
    }

    // Determine action before write
    let action = if current
        .as_object()
        .map(|o| o.contains_key(XYEENA_NOTCH_GROUP))
        .unwrap_or(false)
    {
        HookAction::Repair
    } else {
        HookAction::Install
    };

    // Build new group
    let new_group = build_agy_notch_group_scoped(relay_exe_path, Some(config_path), true)?;

    // Backup existing file
    let backup_written = if config_path.exists() {
        std::fs::copy(config_path, &backup_path_str).map_err(|e| ProviderError::BackupError {
            path: backup_path_str.clone(),
            detail: e.to_string(),
        })?;
        true
    } else {
        false
    };

    // Merge new group
    let obj = current.as_object_mut().expect("ensured object above");
    obj.insert(XYEENA_NOTCH_GROUP.to_string(), new_group);

    // Serialize with pretty-printing
    let serialized =
        serde_json::to_string_pretty(&current).map_err(|e| ProviderError::ConfigWriteError {
            path: path_str.clone(),
            detail: format!("JSON serialize error: {e}"),
        })?;

    // Atomic write via temp file + rename
    let temp_path = format!("{path_str}.xyeena-tmp");
    std::fs::write(&temp_path, serialized.as_bytes()).map_err(|e| {
        ProviderError::ConfigWriteError {
            path: temp_path.clone(),
            detail: e.to_string(),
        }
    })?;
    std::fs::rename(&temp_path, config_path).map_err(|e| ProviderError::ConfigWriteError {
        path: path_str.clone(),
        detail: format!("rename failed: {e}"),
    })?;

    Ok(HookInstallOutcome {
        provider_id: "antigravity".to_string(),
        config_path: path_str,
        backup_path: if backup_written {
            Some(backup_path_str)
        } else {
            None
        },
        action,
        success: true,
        message: "Xyeena Notch hooks installed successfully.".to_string(),
    })
}

/// Remove the `xyeena-notch` group from an AGY hooks.json file.
///
/// All other groups are preserved verbatim. Backs up before writing.
pub fn uninstall_agy_hooks(config_path: &Path) -> Result<HookInstallOutcome, ProviderError> {
    let path_str = config_path.to_string_lossy().to_string();
    let backup_path_str = format!("{path_str}.xyeena-notch.bak");

    if !config_path.exists() {
        return Ok(HookInstallOutcome {
            provider_id: "antigravity".to_string(),
            config_path: path_str,
            backup_path: None,
            action: HookAction::NoChange,
            success: true,
            message: "Config file does not exist; nothing to uninstall.".to_string(),
        });
    }

    let mut current = read_agy_hooks(config_path)?;

    if !current
        .as_object()
        .map(|o| o.contains_key(XYEENA_NOTCH_GROUP))
        .unwrap_or(false)
    {
        return Ok(HookInstallOutcome {
            provider_id: "antigravity".to_string(),
            config_path: path_str,
            backup_path: None,
            action: HookAction::NoChange,
            success: true,
            message: "No xyeena-notch group found; nothing to uninstall.".to_string(),
        });
    }

    // Backup before write
    std::fs::copy(config_path, &backup_path_str).map_err(|e| ProviderError::BackupError {
        path: backup_path_str.clone(),
        detail: e.to_string(),
    })?;

    // Remove group
    if let Some(obj) = current.as_object_mut() {
        obj.remove(XYEENA_NOTCH_GROUP);
    }

    // Atomic write
    let serialized =
        serde_json::to_string_pretty(&current).map_err(|e| ProviderError::ConfigWriteError {
            path: path_str.clone(),
            detail: format!("JSON serialize error: {e}"),
        })?;

    let temp_path = format!("{path_str}.xyeena-tmp");
    std::fs::write(&temp_path, serialized.as_bytes()).map_err(|e| {
        ProviderError::ConfigWriteError {
            path: temp_path.clone(),
            detail: e.to_string(),
        }
    })?;
    std::fs::rename(&temp_path, config_path).map_err(|e| ProviderError::ConfigWriteError {
        path: path_str.clone(),
        detail: format!("rename failed: {e}"),
    })?;

    // Clean up relay shim if present
    if let Some(parent) = config_path.parent() {
        let shim = parent.join("xyeena-agent-relay.cmd");
        if shim.exists() {
            let _ = std::fs::remove_file(shim);
        }
    }

    Ok(HookInstallOutcome {
        provider_id: "antigravity".to_string(),
        config_path: path_str,
        backup_path: Some(backup_path_str),
        action: HookAction::Uninstall,
        success: true,
        message: "xyeena-notch group removed; all other hooks preserved.".to_string(),
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};

    struct TestDir(PathBuf);
    impl TestDir {
        fn path(&self) -> &Path {
            &self.0
        }
    }
    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn tmp() -> TestDir {
        use std::time::{SystemTime, UNIX_EPOCH};
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("xyeena-test-{}-{nanos}", std::process::id()));
        std::fs::create_dir_all(&path).expect("create test dir");
        TestDir(path)
    }

    // -----------------------------------------------------------------------
    // Detection tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_known_providers_catalog() {
        let providers = known_providers();
        assert_eq!(providers.len(), 4);
        assert!(providers.iter().any(|p| p.id == "antigravity"));
        assert!(providers.iter().any(|p| p.id == "claude-code"));
        assert!(providers.iter().any(|p| p.id == "gemini-cli"));
        assert!(providers.iter().any(|p| p.id == "codex"));
    }

    #[test]
    fn test_detect_binary_present() {
        // Use the current executable as a known-present binary.
        let exe = std::env::current_exe()
            .expect("current_exe")
            .to_string_lossy()
            .to_string();
        let def = ProviderDef {
            id: "test".into(),
            display_name: "Test".into(),
            hook_format: HookFormat::AgyhooksJson,
            detection: DetectionStrategy::BinaryPath(exe.clone()),
            supported_events: vec![],
        };
        #[cfg(windows)]
        assert!(matches!(
            detect_provider(&def),
            DetectionResult::Installed { path } if path == exe
        ));
    }

    #[test]
    fn test_detect_binary_absent() {
        let def = ProviderDef {
            id: "test".into(),
            display_name: "Test".into(),
            hook_format: HookFormat::AgyhooksJson,
            detection: DetectionStrategy::BinaryPath("C:\\does\\not\\exist\\fake.exe".to_string()),
            supported_events: vec![],
        };
        #[cfg(windows)]
        assert_eq!(detect_provider(&def), DetectionResult::NotInstalled);
    }

    // -----------------------------------------------------------------------
    // Group builder tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_build_agy_group_structure() {
        let group = build_agy_notch_group("C:\\path\\to\\relay.exe").unwrap();
        let obj = group.as_object().unwrap();
        assert!(!obj.contains_key("SessionStart"));
        assert!(obj.contains_key("PreInvocation"));
        assert!(obj.contains_key("PostToolUse"));
        assert!(obj.contains_key("Stop"));
    }

    #[test]
    fn test_build_agy_group_command_prefix() {
        let group = build_agy_notch_group("C:\\relay.exe").unwrap();
        let session_entries = group["PreInvocation"].as_array().unwrap();
        let cmd = session_entries[0]["command"].as_str().unwrap();
        assert!(cmd.contains("C:\\relay.exe"));
        assert!(cmd.contains("PreInvocation"));
    }

    #[test]
    fn test_build_agy_group_path_too_long() {
        let long_path = "x".repeat(MAX_PATH_LEN + 1);
        assert!(matches!(
            build_agy_notch_group(&long_path),
            Err(ProviderError::PathTooLong)
        ));
    }

    // -----------------------------------------------------------------------
    // Read/parse tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_read_agy_hooks_missing_file_returns_empty_object() {
        let dir = tmp();
        let path = dir.path().join("nonexistent.json");
        let result = read_agy_hooks(&path).unwrap();
        assert!(result.is_object());
        assert_eq!(result.as_object().unwrap().len(), 0);
    }

    #[test]
    fn test_read_agy_hooks_valid_json() {
        let dir = tmp();
        let path = dir.path().join("hooks.json");
        fs::write(&path, r#"{"existing-group": {}}"#).unwrap();
        let result = read_agy_hooks(&path).unwrap();
        assert!(result.as_object().unwrap().contains_key("existing-group"));
    }

    #[test]
    fn test_read_agy_hooks_malformed_json_returns_error() {
        let dir = tmp();
        let path = dir.path().join("hooks.json");
        fs::write(&path, b"{ not valid json }").unwrap();
        assert!(matches!(
            read_agy_hooks(&path),
            Err(ProviderError::ConfigReadError { .. })
        ));
    }

    // -----------------------------------------------------------------------
    // Preview tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_preview_fresh_install() {
        let dir = tmp();
        let path = dir.path().join("hooks.json");
        let preview = preview_agy_install(&path, ConfigScope::Workspace, "C:\\relay.exe").unwrap();
        assert!(!preview.file_exists);
        assert!(!preview.existing_group_present);
        assert!(preview.preserved_groups.is_empty());
        assert!(preview.safe);
        assert_eq!(preview.provider_id, "antigravity");
    }

    #[test]
    fn test_preview_preserves_existing_groups() {
        let dir = tmp();
        let path = dir.path().join("hooks.json");
        fs::write(&path, r#"{"xyeena-rig-guided": {}, "other-group": {}}"#).unwrap();
        let preview = preview_agy_install(&path, ConfigScope::Workspace, "C:\\relay.exe").unwrap();
        assert!(preview.file_exists);
        assert!(!preview.existing_group_present);
        assert!(preview
            .preserved_groups
            .contains(&"xyeena-rig-guided".to_string()));
        assert!(preview
            .preserved_groups
            .contains(&"other-group".to_string()));
    }

    #[test]
    fn test_preview_repair_scenario() {
        let dir = tmp();
        let path = dir.path().join("hooks.json");
        fs::write(
            &path,
            serde_json::json!({ XYEENA_NOTCH_GROUP: {"old": true} }).to_string(),
        )
        .unwrap();
        let preview = preview_agy_install(&path, ConfigScope::Workspace, "C:\\relay.exe").unwrap();
        assert!(preview.existing_group_present);
    }

    // -----------------------------------------------------------------------
    // Install / uninstall tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_install_creates_file_with_correct_group() {
        let dir = tmp();
        let path = dir.path().join("hooks.json");
        let outcome = install_agy_hooks(&path, "C:\\relay.exe").unwrap();
        assert!(outcome.success);
        assert_eq!(outcome.action, HookAction::Install);

        let written = fs::read_to_string(&path).unwrap();
        let parsed: Value = serde_json::from_str(&written).unwrap();
        assert!(parsed.as_object().unwrap().contains_key(XYEENA_NOTCH_GROUP));
    }

    #[test]
    fn test_install_preserves_existing_groups() {
        let dir = tmp();
        let path = dir.path().join("hooks.json");
        fs::write(
            &path,
            r#"{"xyeena-rig-guided": {"SessionStart": [{"type": "command", "command": "rig", "timeout": 3}]}}"#,
        )
        .unwrap();

        let outcome = install_agy_hooks(&path, "C:\\relay.exe").unwrap();
        assert!(outcome.success);

        let written = fs::read_to_string(&path).unwrap();
        let parsed: Value = serde_json::from_str(&written).unwrap();
        let obj = parsed.as_object().unwrap();
        // Both groups present
        assert!(obj.contains_key("xyeena-rig-guided"));
        assert!(obj.contains_key(XYEENA_NOTCH_GROUP));
        // Rig's entry untouched
        assert!(
            obj["xyeena-rig-guided"]["SessionStart"].as_array().unwrap()[0]["command"]
                .as_str()
                .unwrap()
                == "rig"
        );
    }

    #[test]
    fn test_install_is_idempotent() {
        let dir = tmp();
        let path = dir.path().join("hooks.json");
        install_agy_hooks(&path, "C:\\relay.exe").unwrap();
        let outcome2 = install_agy_hooks(&path, "C:\\relay.exe").unwrap();
        assert_eq!(outcome2.action, HookAction::Repair);
        assert!(outcome2.success);
    }

    #[test]
    fn test_install_creates_backup() {
        let dir = tmp();
        let path = dir.path().join("hooks.json");
        fs::write(&path, r#"{"old-group": {}}"#).unwrap();
        let outcome = install_agy_hooks(&path, "C:\\relay.exe").unwrap();
        assert!(outcome.backup_path.is_some());
        let backup = outcome.backup_path.unwrap();
        assert!(std::path::Path::new(&backup).exists());
    }

    #[test]
    fn test_uninstall_removes_only_notch_group() {
        let dir = tmp();
        let path = dir.path().join("hooks.json");
        fs::write(
            &path,
            serde_json::json!({
                "xyeena-rig-guided": {"SessionStart": [{"type": "command", "command": "rig", "timeout": 3}]},
                XYEENA_NOTCH_GROUP: {"SessionStart": [{"type": "command", "command": "notch", "timeout": 3}]}
            })
            .to_string(),
        )
        .unwrap();

        let outcome = uninstall_agy_hooks(&path).unwrap();
        assert!(outcome.success);
        assert_eq!(outcome.action, HookAction::Uninstall);

        let written = fs::read_to_string(&path).unwrap();
        let parsed: Value = serde_json::from_str(&written).unwrap();
        let obj = parsed.as_object().unwrap();
        assert!(!obj.contains_key(XYEENA_NOTCH_GROUP));
        assert!(obj.contains_key("xyeena-rig-guided"));
    }

    #[test]
    fn test_uninstall_no_change_when_group_absent() {
        let dir = tmp();
        let path = dir.path().join("hooks.json");
        fs::write(&path, r#"{"other-group": {}}"#).unwrap();
        let outcome = uninstall_agy_hooks(&path).unwrap();
        assert_eq!(outcome.action, HookAction::NoChange);
    }

    #[test]
    fn test_uninstall_no_change_when_file_absent() {
        let dir = tmp();
        let path = dir.path().join("nonexistent.json");
        let outcome = uninstall_agy_hooks(&path).unwrap();
        assert_eq!(outcome.action, HookAction::NoChange);
    }

    #[test]
    fn test_install_concurrent_backup_safety() {
        // Simulate concurrent calls — both should succeed without corrupting the file.
        use std::sync::Arc;
        let dir = Arc::new(tmp());
        let path = Arc::new(dir.path().join("hooks.json"));
        std::fs::write(path.as_path(), r#"{"xyeena-rig-guided": {}}"#).unwrap();

        let p1 = path.clone();
        let p2 = path.clone();
        let t1 = std::thread::spawn(move || install_agy_hooks(p1.as_path(), "C:\\relay.exe"));
        let t2 = std::thread::spawn(move || install_agy_hooks(p2.as_path(), "C:\\relay.exe"));
        let r1 = t1.join().unwrap();
        let r2 = t2.join().unwrap();
        // At least one should succeed
        assert!(r1.is_ok() || r2.is_ok());
        // File should be valid JSON after both complete
        let content = std::fs::read_to_string(path.as_path()).unwrap();
        let _: Value = serde_json::from_str(&content).expect("valid JSON after concurrent writes");
    }

    #[test]
    fn test_resolve_command_prefix_clean_path() {
        let prefix = resolve_agy_command_prefix("C:\\clean\\relay.exe", None, false).unwrap();
        assert_eq!(prefix, "C:\\clean\\relay.exe");
    }

    #[test]
    fn test_resolve_command_prefix_relative_workspace() {
        let dir = tmp();
        let ws_root = dir.path();
        let agents_dir = ws_root.join(".agents");
        let hooks_json = agents_dir.join("hooks.json");
        let relay_exe = ws_root.join("bin").join("relay.exe");
        std::fs::create_dir_all(&agents_dir).unwrap();
        std::fs::create_dir_all(ws_root.join("bin")).unwrap();
        std::fs::write(&relay_exe, b"dummy").unwrap();

        let prefix =
            resolve_agy_command_prefix(&relay_exe.to_string_lossy(), Some(&hooks_json), false)
                .unwrap();

        // The relative path from .agents to bin/relay.exe is ..\bin\relay.exe
        assert!(prefix.contains("bin") && prefix.contains("relay.exe"));
        assert!(!prefix.contains(' '));
        assert!(!prefix.contains('"'));
    }

    #[test]
    fn test_resolve_command_prefix_shim_fallback() {
        let dir = tmp();
        let agents_dir = dir.path().join(".agents");
        let hooks_json = agents_dir.join("hooks.json");
        std::fs::create_dir_all(&agents_dir).unwrap();

        // Target path has spaces and is outside workspace
        let outside_relay = "D:\\External Programs With Spaces\\Xyeena Notch\\relay.exe";

        // Preview should return shim name without writing file
        let preview_prefix =
            resolve_agy_command_prefix(outside_relay, Some(&hooks_json), false).unwrap();
        assert_eq!(preview_prefix, "xyeena-agent-relay.cmd");
        assert!(!agents_dir.join("xyeena-agent-relay.cmd").exists());

        // Install (write_shim=true) should create the shim file
        let install_prefix =
            resolve_agy_command_prefix(outside_relay, Some(&hooks_json), true).unwrap();
        assert_eq!(install_prefix, "xyeena-agent-relay.cmd");
        let shim_file = agents_dir.join("xyeena-agent-relay.cmd");
        assert!(shim_file.exists());
        let shim_content = std::fs::read_to_string(&shim_file).unwrap();
        assert!(shim_content.contains("@chcp 65001 >nul"));
        assert!(shim_content.contains(outside_relay));
    }

    #[test]
    fn test_resolve_command_prefix_unicode_support() {
        let dir = tmp();
        let agents_dir = dir.path().join(".agents");
        let hooks_json = agents_dir.join("hooks.json");
        std::fs::create_dir_all(&agents_dir).unwrap();

        let unicode_relay = "C:\\Program Files\\Xyeena 測試\\relay.exe";
        let prefix = resolve_agy_command_prefix(unicode_relay, Some(&hooks_json), true).unwrap();
        assert_eq!(prefix, "xyeena-agent-relay.cmd");
        let shim_content =
            std::fs::read_to_string(agents_dir.join("xyeena-agent-relay.cmd")).unwrap();
        assert!(shim_content.contains("測試"));
    }

    #[test]
    fn test_install_creates_shim_and_uninstall_removes_shim() {
        let dir = tmp();
        let agents_dir = dir.path().join(".agents");
        let hooks_json = agents_dir.join("hooks.json");
        std::fs::create_dir_all(&agents_dir).unwrap();

        let outside_relay = "D:\\Program Files With Spaces\\relay.exe";
        let install_outcome = install_agy_hooks(&hooks_json, outside_relay).unwrap();
        assert!(install_outcome.success);
        let shim_file = agents_dir.join("xyeena-agent-relay.cmd");
        assert!(shim_file.exists());

        let uninstall_outcome = uninstall_agy_hooks(&hooks_json).unwrap();
        assert!(uninstall_outcome.success);
        assert!(!shim_file.exists());
    }

    #[test]
    fn test_unexecutable_command_error_when_no_config_dir() {
        let space_relay = "D:\\Program Files With Spaces\\relay.exe";
        let res = resolve_agy_command_prefix(space_relay, None, false);
        #[cfg(windows)]
        {
            let sanitized = sanitize_cmd_path(space_relay);
            if sanitized.contains(' ') {
                assert!(matches!(
                    res,
                    Err(ProviderError::UnexecutableCommand { .. })
                ));
            }
        }
        #[cfg(not(windows))]
        {
            assert!(matches!(
                res,
                Err(ProviderError::UnexecutableCommand { .. })
            ));
        }
    }
}
