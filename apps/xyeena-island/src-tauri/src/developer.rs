//! Developer productivity module: bounded diff preview, path traversal protection,
//! and secure editor/terminal process spawning.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Maximum bytes allowed in a single diff preview to prevent memory exhaustion / UI stalls.
pub const MAX_DIFF_BYTES: usize = 65_536; // 64 KB
/// Maximum lines allowed in a single diff preview.
pub const MAX_DIFF_LINES: usize = 500;

/// Bounded workspace diff result.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkspaceDiffResult {
    pub workspace_root: String,
    pub diff: String,
    pub files: Vec<String>,
    pub truncated: bool,
    pub is_git_repo: bool,
}

/// Strip Windows UNC `\\?\` prefix if present for compatibility with CLI tools.
pub fn clean_path(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        path.to_path_buf()
    }
}

/// Validate that a workspace root path is non-empty, exists, and is a valid directory.
pub fn validate_workspace_root(root_str: &str) -> Result<PathBuf, String> {
    if root_str.trim().is_empty() {
        return Err("Workspace root cannot be empty".to_string());
    }
    let path = PathBuf::from(root_str.trim());
    if !path.exists() {
        return Err(format!("Workspace root does not exist: {root_str}"));
    }
    if !path.is_dir() {
        return Err(format!("Workspace root is not a directory: {root_str}"));
    }
    let canon = path
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize workspace root: {e}"))?;
    Ok(clean_path(&canon))
}

/// Validate that a requested subpath / relative path does not escape the workspace root.
pub fn validate_path_within_root(root: &Path, relative_or_sub: &str) -> Result<PathBuf, String> {
    let trimmed = relative_or_sub.trim();
    if trimmed.is_empty() {
        return Ok(clean_path(root));
    }
    if trimmed.contains("..") {
        return Err("Directory traversal rejected ('..')".to_string());
    }

    let joined = if Path::new(trimmed).is_absolute() {
        PathBuf::from(trimmed)
    } else {
        root.join(trimmed)
    };

    if joined.exists() {
        let canon_root = root
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize root: {e}"))?;
        let canon_target = joined
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize target path: {e}"))?;

        let clean_root = clean_path(&canon_root);
        let clean_target = clean_path(&canon_target);

        if !clean_target.starts_with(&clean_root) {
            return Err("Target path is outside the workspace root".to_string());
        }
        Ok(clean_target)
    } else {
        let clean_root = clean_path(root);
        let clean_target = clean_path(&joined);
        if !clean_target.starts_with(&clean_root) {
            return Err("Target path is outside the workspace root".to_string());
        }
        Ok(clean_target)
    }
}

/// Fetch a bounded git diff and modified file list for the specified workspace.
#[tauri::command]
pub fn get_workspace_diff(
    workspace_root: String,
    file_path: Option<String>,
) -> Result<WorkspaceDiffResult, String> {
    let root = validate_workspace_root(&workspace_root)?;

    // Check if git is available and if this workspace is inside a git repo
    let status_res = std::process::Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(&root)
        .output();

    let is_git_repo = match status_res {
        Ok(out) => out.status.success() && String::from_utf8_lossy(&out.stdout).trim() == "true",
        Err(_) => false,
    };

    if !is_git_repo {
        return Ok(WorkspaceDiffResult {
            workspace_root: root.to_string_lossy().to_string(),
            diff: String::new(),
            files: Vec::new(),
            truncated: false,
            is_git_repo: false,
        });
    }

    // Collect modified files list
    let mut files = Vec::new();
    if let Ok(out) = std::process::Command::new("git")
        .args(["status", "--porcelain=v1"])
        .current_dir(&root)
        .output()
    {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout);
            for line in s.lines().take(50) {
                if line.len() > 3 {
                    let file_entry = line[3..].trim().trim_matches('"').to_string();
                    if !file_entry.is_empty() {
                        files.push(file_entry);
                    }
                }
            }
        }
    }

    // Run git diff
    let mut diff_cmd = std::process::Command::new("git");
    diff_cmd
        .args(["--no-pager", "diff", "--no-color", "-U3"])
        .current_dir(&root);

    if let Some(fp) = &file_path {
        if !fp.trim().is_empty() {
            let valid_file = validate_path_within_root(&root, fp)?;
            diff_cmd.arg("--").arg(valid_file);
        }
    }

    let diff_output = diff_cmd
        .output()
        .map_err(|e| format!("Failed to run git diff: {e}"))?;
    let raw_diff = String::from_utf8_lossy(&diff_output.stdout);

    // Limit output to bounds
    let mut truncated = false;
    let mut bounded_lines = Vec::new();
    let mut total_bytes = 0;

    for line in raw_diff.lines() {
        if bounded_lines.len() >= MAX_DIFF_LINES || total_bytes + line.len() + 1 > MAX_DIFF_BYTES {
            truncated = true;
            break;
        }
        total_bytes += line.len() + 1;
        bounded_lines.push(line);
    }

    let mut final_diff = bounded_lines.join("\n");
    if truncated {
        final_diff.push_str("\n\n... [diff truncated at 64KB/500 lines limit]");
    }

    Ok(WorkspaceDiffResult {
        workspace_root: root.to_string_lossy().to_string(),
        diff: final_diff,
        files,
        truncated,
        is_git_repo: true,
    })
}

/// Open a workspace directory or target file in VS Code or system default editor.
#[tauri::command]
pub fn open_in_editor(
    workspace_root: String,
    file_path: Option<String>,
    line: Option<u32>,
) -> Result<(), String> {
    let root = validate_workspace_root(&workspace_root)?;

    let target_arg = if let Some(fp) = file_path {
        if !fp.trim().is_empty() {
            let target = validate_path_within_root(&root, &fp)?;
            if let Some(l) = line {
                format!("{}:{l}", target.to_string_lossy())
            } else {
                target.to_string_lossy().to_string()
            }
        } else {
            root.to_string_lossy().to_string()
        }
    } else {
        root.to_string_lossy().to_string()
    };

    // Try VS Code first
    let vscode_spawn = std::process::Command::new("code.cmd")
        .arg("-g")
        .arg(&target_arg)
        .spawn()
        .or_else(|_| {
            std::process::Command::new("code")
                .arg("-g")
                .arg(&target_arg)
                .spawn()
        });

    if vscode_spawn.is_ok() {
        return Ok(());
    }

    // Fallback: Windows shell open via cmd.exe /c start
    #[cfg(windows)]
    {
        let fallback = std::process::Command::new("cmd.exe")
            .args(["/c", "start", "", &target_arg])
            .spawn();
        if fallback.is_ok() {
            return Ok(());
        }
    }

    Err(format!("Could not launch editor for target: {target_arg}"))
}

/// Open a terminal session at the target workspace root.
#[tauri::command]
pub fn open_in_terminal(workspace_root: String) -> Result<(), String> {
    let root = validate_workspace_root(&workspace_root)?;
    let root_str = root.to_string_lossy().to_string();

    #[cfg(windows)]
    {
        // Try Windows Terminal (wt.exe)
        let wt_spawn = std::process::Command::new("wt.exe")
            .args(["-d", &root_str])
            .spawn();

        if wt_spawn.is_ok() {
            return Ok(());
        }

        // Fallback: PowerShell
        let ps_spawn = std::process::Command::new("powershell.exe")
            .args([
                "-NoExit",
                "-Command",
                &format!(
                    "Set-Location -LiteralPath '{}'",
                    root_str.replace('\'', "''")
                ),
            ])
            .spawn();

        if ps_spawn.is_ok() {
            return Ok(());
        }

        // Fallback: cmd.exe
        let cmd_spawn = std::process::Command::new("cmd.exe")
            .args(["/K", "cd", "/d", &root_str])
            .spawn();

        if cmd_spawn.is_ok() {
            return Ok(());
        }
    }

    #[cfg(not(windows))]
    {
        let _ = root_str;
    }

    Err(format!(
        "Could not launch terminal in workspace: {workspace_root}"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_validate_workspace_root_rejects_empty_or_nonexistent() {
        assert!(validate_workspace_root("").is_err());
        assert!(validate_workspace_root("   ").is_err());
        assert!(validate_workspace_root("C:\\nonexistent_workspace_dir_12345").is_err());
    }

    #[test]
    fn test_validate_path_within_root_rejects_traversal() {
        let temp_dir = std::env::temp_dir();
        assert!(validate_path_within_root(&temp_dir, "../outside.txt").is_err());
        assert!(validate_path_within_root(&temp_dir, "dir/../../outside.txt").is_err());
    }

    #[test]
    fn test_validate_path_within_root_allows_subfiles() {
        let temp_root = std::env::temp_dir().join(format!("xyn_test_{}", std::process::id()));
        fs::create_dir_all(&temp_root).unwrap();

        let subfile = temp_root.join("hello.txt");
        fs::write(&subfile, "content").unwrap();

        let validated = validate_path_within_root(&temp_root, "hello.txt");
        assert!(validated.is_ok(), "Subfile should be validated");

        let _ = fs::remove_dir_all(&temp_root);
    }

    #[test]
    fn test_diff_bounding_limits() {
        let lines: Vec<String> = (0..1000).map(|i| format!("+line {i}")).collect();
        let raw_diff = lines.join("\n");

        let mut bounded_lines = Vec::new();
        let mut total_bytes = 0;
        let mut truncated = false;

        for line in raw_diff.lines() {
            if bounded_lines.len() >= MAX_DIFF_LINES
                || total_bytes + line.len() + 1 > MAX_DIFF_BYTES
            {
                truncated = true;
                break;
            }
            total_bytes += line.len() + 1;
            bounded_lines.push(line);
        }

        assert!(truncated, "1000 lines should be truncated");
        assert_eq!(bounded_lines.len(), MAX_DIFF_LINES);
    }
}
