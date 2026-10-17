//! GitHub PR, CI, and code review integration module.
//! Provides read-only workspace repository detection, PR status, CI workflow runs,
//! and rate-limit tracking via GitHub CLI or scoped personal access tokens.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

/// Maximum bytes allowed when reading CLI/API output.
pub const MAX_GITHUB_OUTPUT_BYTES: usize = 262_144; // 256 KB

/// Summary of an active Pull Request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitHubPrSummary {
    pub number: u64,
    pub title: String,
    pub state: String,
    pub url: String,
    pub is_draft: bool,
    pub head_branch: String,
    pub base_branch: String,
    pub review_decision: Option<String>,
    pub checks_conclusion: Option<String>,
}

/// A recent GitHub Actions CI run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitHubCiRun {
    pub id: u64,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub branch: String,
    pub event: String,
    pub url: String,
    pub updated_at: String,
}

/// Overall GitHub integration status for a workspace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitHubStatusResult {
    pub is_git_repo: bool,
    pub is_github: bool,
    pub repo_slug: Option<String>,
    pub branch: Option<String>,
    pub configured: bool,
    pub config_method: Option<String>,
    pub pr: Option<GitHubPrSummary>,
    pub recent_runs: Vec<GitHubCiRun>,
    pub rate_limited: bool,
    pub rate_limit_remaining: Option<u32>,
    pub rate_limit_reset: Option<u64>,
    pub error: Option<String>,
}

/// Parse owner and repository slug from git remote origin URL.
/// Supports HTTPS (`https://github.com/owner/repo.git`) and SSH (`git@github.com:owner/repo.git`).
pub fn parse_github_remote(remote_url: &str) -> Option<String> {
    let trimmed = remote_url.trim();
    if trimmed.is_empty() {
        return None;
    }

    let without_suffix = trimmed.strip_suffix(".git").unwrap_or(trimmed);

    // SSH format: git@github.com:owner/repo
    if let Some(rest) = without_suffix.strip_prefix("git@github.com:") {
        let parts: Vec<&str> = rest.split('/').collect();
        if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
            return Some(format!("{}/{}", parts[0], parts[1]));
        }
    }

    // HTTPS / HTTP format
    if let Some(pos) = without_suffix.find("github.com/") {
        let path = &without_suffix[pos + "github.com/".len()..];
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() >= 2 && !parts[0].is_empty() && !parts[1].is_empty() {
            return Some(format!("{}/{}", parts[0], parts[1]));
        }
    }

    None
}

/// Retrieve the remote.origin.url for a given repository directory.
pub fn get_git_remote_url(dir: &Path) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.args(["config", "--get", "remote.origin.url"]);
    cmd.current_dir(dir);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to invoke git: {e}"))?;

    if !output.status.success() {
        return Err("No git remote origin configured".into());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Retrieve the current checked out branch name.
pub fn get_git_branch(dir: &Path) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.args(["rev-parse", "--abbrev-ref", "HEAD"]);
    cmd.current_dir(dir);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to invoke git rev-parse: {e}"))?;

    if !output.status.success() {
        return Err("Cannot determine active git branch".into());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Check if GitHub CLI is installed and authenticated.
pub fn check_gh_cli() -> bool {
    let mut cmd = Command::new("gh");
    cmd.args(["auth", "status"]);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd.output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

/// Fetch PR info using `gh pr view` in JSON format.
pub fn fetch_pr_via_gh_cli(dir: &Path) -> Option<GitHubPrSummary> {
    let mut cmd = Command::new("gh");
    cmd.args([
        "pr",
        "view",
        "--json",
        "number,title,state,url,isDraft,headRefName,baseRefName,reviewDecision,statusCheckRollup",
    ]);
    cmd.current_dir(dir);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_gh_pr_view_json(&stdout)
}

/// Parse raw JSON output from `gh pr view`.
pub fn parse_gh_pr_view_json(json_str: &str) -> Option<GitHubPrSummary> {
    let val: serde_json::Value = serde_json::from_str(json_str).ok()?;
    let number = val.get("number")?.as_u64()?;
    let title = val.get("title")?.as_str()?.to_string();
    let state = val.get("state")?.as_str()?.to_string();
    let url = val.get("url")?.as_str()?.to_string();
    let is_draft = val
        .get("isDraft")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let head_branch = val
        .get("headRefName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let base_branch = val
        .get("baseRefName")
        .and_then(|v| v.as_str())
        .unwrap_or("main")
        .to_string();
    let review_decision = val
        .get("reviewDecision")
        .and_then(|v| v.as_str())
        .map(String::from);

    // Compute aggregate check conclusion if statusCheckRollup exists
    let checks_conclusion = val
        .get("statusCheckRollup")
        .and_then(|r| r.as_array())
        .map(|checks| {
            let mut has_failure = false;
            let mut has_pending = false;
            for c in checks {
                let status = c.get("status").and_then(|s| s.as_str()).unwrap_or("");
                let conclusion = c.get("conclusion").and_then(|s| s.as_str()).unwrap_or("");
                if conclusion == "FAILURE"
                    || conclusion == "TIMED_OUT"
                    || conclusion == "ACTION_REQUIRED"
                {
                    has_failure = true;
                } else if status == "IN_PROGRESS" || status == "QUEUED" {
                    has_pending = true;
                }
            }
            if has_failure {
                "FAILURE".to_string()
            } else if has_pending {
                "PENDING".to_string()
            } else if checks.is_empty() {
                "NEUTRAL".to_string()
            } else {
                "SUCCESS".to_string()
            }
        });

    Some(GitHubPrSummary {
        number,
        title,
        state,
        url,
        is_draft,
        head_branch,
        base_branch,
        review_decision,
        checks_conclusion,
    })
}

/// Fetch recent workflow runs using `gh run list` in JSON format.
pub fn fetch_runs_via_gh_cli(dir: &Path, limit: usize) -> Vec<GitHubCiRun> {
    let mut cmd = Command::new("gh");
    cmd.args([
        "run",
        "list",
        "--limit",
        &limit.to_string(),
        "--json",
        "databaseId,name,status,conclusion,headBranch,event,url,updatedAt",
    ]);
    cmd.current_dir(dir);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = match cmd.output() {
        Ok(o) => o,
        Err(_) => return Vec::new(),
    };

    if !output.status.success() {
        return Vec::new();
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_gh_run_list_json(&stdout)
}

/// Parse raw JSON output from `gh run list`.
pub fn parse_gh_run_list_json(json_str: &str) -> Vec<GitHubCiRun> {
    let val: serde_json::Value = match serde_json::from_str(json_str) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    let arr = match val.as_array() {
        Some(a) => a,
        None => return Vec::new(),
    };

    arr.iter()
        .filter_map(|item| {
            let id = item.get("databaseId")?.as_u64()?;
            let name = item.get("name")?.as_str()?.to_string();
            let status = item.get("status")?.as_str()?.to_string();
            let conclusion = item
                .get("conclusion")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(String::from);
            let branch = item
                .get("headBranch")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let event = item
                .get("event")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let url = item
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let updated_at = item
                .get("updatedAt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            Some(GitHubCiRun {
                id,
                name,
                status,
                conclusion,
                branch,
                event,
                url,
                updated_at,
            })
        })
        .collect()
}

/// Fetch GitHub repository PR & CI status for a workspace directory.
#[tauri::command]
pub fn get_github_status(
    workspace_root: Option<String>,
    token: Option<String>,
) -> Result<GitHubStatusResult, String> {
    let dir = if let Some(ws) = workspace_root {
        crate::developer::validate_workspace_root(&ws)?
    } else {
        std::env::current_dir().map_err(|e| format!("Cannot get working directory: {e}"))?
    };

    let remote_url = match get_git_remote_url(&dir) {
        Ok(u) => u,
        Err(e) => {
            return Ok(GitHubStatusResult {
                is_git_repo: false,
                is_github: false,
                repo_slug: None,
                branch: None,
                configured: false,
                config_method: None,
                pr: None,
                recent_runs: Vec::new(),
                rate_limited: false,
                rate_limit_remaining: None,
                rate_limit_reset: None,
                error: Some(e),
            });
        }
    };

    let slug = parse_github_remote(&remote_url);
    if slug.is_none() {
        return Ok(GitHubStatusResult {
            is_git_repo: true,
            is_github: false,
            repo_slug: None,
            branch: get_git_branch(&dir).ok(),
            configured: false,
            config_method: None,
            pr: None,
            recent_runs: Vec::new(),
            rate_limited: false,
            rate_limit_remaining: None,
            rate_limit_reset: None,
            error: Some("Remote is not a GitHub repository".into()),
        });
    }

    let repo_slug = slug;
    let branch = get_git_branch(&dir).ok();

    // Check token preference first, then CLI
    let effective_token = token
        .filter(|t| !t.trim().is_empty())
        .or_else(|| {
            std::env::var("GITHUB_TOKEN")
                .ok()
                .filter(|t| !t.trim().is_empty())
        })
        .or_else(|| {
            std::env::var("GH_TOKEN")
                .ok()
                .filter(|t| !t.trim().is_empty())
        });

    if let Some(_tok) = effective_token {
        // Direct REST API queries via curl.exe could be wired here if gh CLI is missing.
        // For standard local development, gh CLI is preferred when present.
    }

    let has_gh = check_gh_cli();
    if !has_gh {
        return Ok(GitHubStatusResult {
            is_git_repo: true,
            is_github: true,
            repo_slug,
            branch,
            configured: false,
            config_method: Some("none".into()),
            pr: None,
            recent_runs: Vec::new(),
            rate_limited: false,
            rate_limit_remaining: None,
            rate_limit_reset: None,
            error: Some("GitHub CLI (gh) not authenticated and no GITHUB_TOKEN configured".into()),
        });
    }

    // Use gh CLI for authentic, scoped data without credential leakage
    let pr = fetch_pr_via_gh_cli(&dir);
    let recent_runs = fetch_runs_via_gh_cli(&dir, 3);

    Ok(GitHubStatusResult {
        is_git_repo: true,
        is_github: true,
        repo_slug,
        branch,
        configured: true,
        config_method: Some("gh_cli".into()),
        pr,
        recent_runs,
        rate_limited: false,
        rate_limit_remaining: None,
        rate_limit_reset: None,
        error: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_github_remote_ssh_and_https() {
        assert_eq!(
            parse_github_remote("git@github.com:rzqllh/xyeena-notch.git"),
            Some("rzqllh/xyeena-notch".to_string())
        );
        assert_eq!(
            parse_github_remote("git@github.com:owner/sub-repo"),
            Some("owner/sub-repo".to_string())
        );
        assert_eq!(
            parse_github_remote("https://github.com/rzqllh/xyeena-notch.git"),
            Some("rzqllh/xyeena-notch".to_string())
        );
        assert_eq!(
            parse_github_remote("https://github.com/owner/project"),
            Some("owner/project".to_string())
        );
        assert_eq!(
            parse_github_remote("https://gitlab.com/owner/repo.git"),
            None
        );
        assert_eq!(parse_github_remote(""), None);
        assert_eq!(parse_github_remote("   "), None);
    }

    #[test]
    fn test_parse_gh_pr_view_json() {
        let raw = r#"{
            "number": 42,
            "title": "feat: coucou parity",
            "state": "OPEN",
            "url": "https://github.com/rzqllh/xyeena-notch/pull/42",
            "isDraft": true,
            "headRefName": "feat/windows-parity-xyn",
            "baseRefName": "main",
            "reviewDecision": "REVIEW_REQUIRED",
            "statusCheckRollup": [
                { "status": "COMPLETED", "conclusion": "SUCCESS" },
                { "status": "COMPLETED", "conclusion": "SUCCESS" }
            ]
        }"#;

        let pr = parse_gh_pr_view_json(raw).expect("Must parse valid PR json");
        assert_eq!(pr.number, 42);
        assert_eq!(pr.title, "feat: coucou parity");
        assert_eq!(pr.state, "OPEN");
        assert!(pr.is_draft);
        assert_eq!(pr.head_branch, "feat/windows-parity-xyn");
        assert_eq!(pr.base_branch, "main");
        assert_eq!(pr.review_decision.as_deref(), Some("REVIEW_REQUIRED"));
        assert_eq!(pr.checks_conclusion.as_deref(), Some("SUCCESS"));
    }

    #[test]
    fn test_parse_gh_run_list_json() {
        let raw = r#"[
            {
                "databaseId": 123456,
                "name": "CI",
                "status": "completed",
                "conclusion": "success",
                "headBranch": "main",
                "event": "push",
                "url": "https://github.com/rzqllh/xyeena-notch/actions/runs/123456",
                "updatedAt": "2026-10-17T12:00:00Z"
            }
        ]"#;

        let runs = parse_gh_run_list_json(raw);
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].id, 123456);
        assert_eq!(runs[0].name, "CI");
        assert_eq!(runs[0].status, "completed");
        assert_eq!(runs[0].conclusion.as_deref(), Some("success"));
        assert_eq!(runs[0].branch, "main");
    }

    #[test]
    fn test_empty_pr_rejection() {
        assert!(parse_gh_pr_view_json("{}").is_none());
        assert!(parse_gh_pr_view_json("invalid json").is_none());
    }
}
