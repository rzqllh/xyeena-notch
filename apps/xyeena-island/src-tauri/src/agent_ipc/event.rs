//! Normalized agent hook event schema and parser.
//!
//! Normalizes incoming events from diverse CLI / IDE agents (Claude Code,
//! Codex, Gemini CLI, Antigravity, Cursor) into a unified, type-safe schema.
//! Enforces bounded string lengths, argument aliasing, and validation.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Maximum length allowed for arbitrary string identifiers (provider, session, tool name, cwd).
pub const MAX_IDENTIFIER_LEN: usize = 256;
/// Maximum length allowed for command / path / query fields.
pub const MAX_FIELD_LEN: usize = 4096;

/// High-level normalized event category.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NormalizedEventType {
    SessionStart,
    SessionEnd,
    Prompt,
    ToolPre,
    ToolPost,
    Notification,
    PermissionRequest,
    Other(String),
}

impl fmt::Display for NormalizedEventType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::SessionStart => write!(f, "session_start"),
            Self::SessionEnd => write!(f, "session_end"),
            Self::Prompt => write!(f, "prompt"),
            Self::ToolPre => write!(f, "tool_pre"),
            Self::ToolPost => write!(f, "tool_post"),
            Self::Notification => write!(f, "notification"),
            Self::PermissionRequest => write!(f, "permission_request"),
            Self::Other(s) => write!(f, "other({s})"),
        }
    }
}

/// Normalized tool parameters with canonical argument aliases.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct NormalizedToolInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    pub raw_args: serde_json::Value,
}

/// A normalized agent hook event ready for session registry tracking and UI emission.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NormalizedEvent {
    pub event_type: NormalizedEventType,
    pub provider: String,
    pub session_id: String,
    pub timestamp_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<NormalizedToolInput>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_output: Option<String>,
    pub raw: serde_json::Value,
}

/// Validation and parsing errors for incoming hook payloads.
#[derive(Debug, PartialEq, Eq)]
pub enum EventParseError {
    MissingField(&'static str),
    FieldTooLong { field: String, max: usize },
    InvalidPayload(String),
}

impl fmt::Display for EventParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingField(fld) => write!(f, "Missing required event field: {fld}"),
            Self::FieldTooLong { field, max } => {
                write!(f, "Field '{field}' exceeds maximum length of {max} bytes")
            }
            Self::InvalidPayload(msg) => write!(f, "Invalid hook payload: {msg}"),
        }
    }
}

impl std::error::Error for EventParseError {}

/// Parse and normalize a raw JSON payload from an agent hook.
pub fn parse_and_normalize(raw: &serde_json::Value) -> Result<NormalizedEvent, EventParseError> {
    let obj = raw
        .as_object()
        .ok_or_else(|| EventParseError::InvalidPayload("Payload must be a JSON object".into()))?;

    // 1. Resolve Provider
    let provider =
        extract_str(obj, &["provider", "agent", "source", "client"]).unwrap_or_else(|| {
            if obj.contains_key("conversationId")
                || obj.contains_key("workspacePaths")
                || obj.contains_key("toolCall")
                || obj.contains_key("hook_event_name")
            {
                "antigravity".to_string()
            } else {
                "unknown-agent".to_string()
            }
        });
    if provider.len() > MAX_IDENTIFIER_LEN {
        return Err(EventParseError::FieldTooLong {
            field: "provider".into(),
            max: MAX_IDENTIFIER_LEN,
        });
    }

    // 2. Resolve Session ID (required)
    let session_id = extract_str(
        obj,
        &[
            "session_id",
            "sessionId",
            "conversation_id",
            "conversationId",
            "session",
        ],
    )
    .ok_or(EventParseError::MissingField("session_id"))?;
    if session_id.len() > MAX_IDENTIFIER_LEN {
        return Err(EventParseError::FieldTooLong {
            field: "session_id".into(),
            max: MAX_IDENTIFIER_LEN,
        });
    }

    // 3. Resolve Event Type
    let event_name = extract_str(
        obj,
        &[
            "hook_event_name",
            "event",
            "event_type",
            "type",
            "hook",
            "name",
        ],
    )
    .unwrap_or_else(|| "unknown".to_string());
    let event_type = match event_name.to_lowercase().replace(['-', '_'], "").as_str() {
        "sessionstart" | "start" | "sessioninit" => NormalizedEventType::SessionStart,
        "sessionend" | "stop" | "sessionstop" | "end" => NormalizedEventType::SessionEnd,
        "userprompt" | "userpromptsubmit" | "prompt" => NormalizedEventType::Prompt,
        "pretooluse" | "preinvocation" | "beforetool" | "toolpre" | "toolstart" | "toolcall" => {
            NormalizedEventType::ToolPre
        }
        "posttooluse" | "aftertool" | "toolpost" | "toolend" | "toolresult" => {
            NormalizedEventType::ToolPost
        }
        "notification" | "notify" | "alert" => NormalizedEventType::Notification,
        "permissionrequest"
        | "permissionrequested"
        | "approvalrequest"
        | "approvalrequested"
        | "askuser" => NormalizedEventType::PermissionRequest,
        _ => NormalizedEventType::Other(event_name),
    };

    // 4. Resolve Timestamp
    let timestamp_ms = obj
        .get("timestamp")
        .or_else(|| obj.get("timestamp_ms"))
        .or_else(|| obj.get("time"))
        .and_then(|v| v.as_u64())
        .unwrap_or_else(|| {
            use std::time::{SystemTime, UNIX_EPOCH};
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0)
        });

    // 5. Resolve CWD & Workspace Root
    let cwd = extract_bounded_str(
        obj,
        &["cwd", "current_dir", "working_directory"],
        MAX_FIELD_LEN,
    )?;
    let workspace_root = extract_bounded_str(
        obj,
        &["workspace_root", "workspace", "project_root", "projectRoot"],
        MAX_FIELD_LEN,
    )?
    .or_else(|| {
        obj.get("workspacePaths")
            .or_else(|| obj.get("workspace_paths"))
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    });

    // 6. Resolve Tool Information
    let tool_call_obj = obj
        .get("toolCall")
        .or_else(|| obj.get("tool_call"))
        .and_then(|v| v.as_object());

    let tool_name = if let Some(tc) = tool_call_obj {
        extract_bounded_str(tc, &["name", "tool_name", "toolName"], MAX_IDENTIFIER_LEN)?.or(
            extract_bounded_str(
                obj,
                &["tool_name", "toolName", "tool", "name"],
                MAX_IDENTIFIER_LEN,
            )?,
        )
    } else {
        extract_bounded_str(
            obj,
            &["tool_name", "toolName", "tool", "name"],
            MAX_IDENTIFIER_LEN,
        )?
    };

    let tool_input = tool_call_obj
        .and_then(|tc| {
            tc.get("args")
                .or_else(|| tc.get("arguments"))
                .or_else(|| tc.get("input"))
                .or_else(|| tc.get("parameters"))
        })
        .or_else(|| {
            obj.get("tool_input")
                .or_else(|| obj.get("toolInput"))
                .or_else(|| obj.get("input"))
                .or_else(|| obj.get("parameters"))
                .or_else(|| obj.get("arguments"))
                .or_else(|| obj.get("args"))
        })
        .map(normalize_tool_input);

    let tool_output = extract_bounded_str(
        obj,
        &["tool_output", "toolOutput", "output", "result"],
        MAX_FIELD_LEN,
    )?;

    Ok(NormalizedEvent {
        event_type,
        provider,
        session_id,
        timestamp_ms,
        cwd,
        workspace_root,
        tool_name,
        tool_input,
        tool_output,
        raw: raw.clone(),
    })
}

fn extract_str(obj: &serde_json::Map<String, serde_json::Value>, keys: &[&str]) -> Option<String> {
    for &key in keys {
        if let Some(val) = obj.get(key) {
            if let Some(s) = val.as_str() {
                if !s.trim().is_empty() {
                    return Some(s.trim().to_string());
                }
            }
        }
    }
    None
}

fn extract_bounded_str(
    obj: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
    max_len: usize,
) -> Result<Option<String>, EventParseError> {
    if let Some(s) = extract_str(obj, keys) {
        if s.len() > max_len {
            return Err(EventParseError::FieldTooLong {
                field: keys[0].to_string(),
                max: max_len,
            });
        }
        Ok(Some(s))
    } else {
        Ok(None)
    }
}

fn normalize_tool_input(val: &serde_json::Value) -> NormalizedToolInput {
    let mut input = NormalizedToolInput {
        raw_args: val.clone(),
        ..Default::default()
    };

    if let Some(map) = val.as_object() {
        // Alias for command
        input.command = extract_str(
            map,
            &["command", "CommandLine", "command_line", "cmd", "script"],
        );
        // Alias for path
        input.path = extract_str(
            map,
            &[
                "path",
                "file_path",
                "filePath",
                "TargetFile",
                "AbsolutePath",
                "SearchPath",
                "DirectoryPath",
                "file",
            ],
        );
        // Alias for query
        input.query = extract_str(map, &["query", "Query", "pattern", "search_term", "q"]);
        // Alias for summary
        input.summary = extract_str(
            map,
            &[
                "summary",
                "toolSummary",
                "description",
                "Description",
                "msg",
            ],
        );
    }

    input
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_normalize_claude_code_event() {
        let payload = json!({
            "event": "PreToolUse",
            "provider": "claude-code",
            "session_id": "session-claude-99",
            "cwd": "C:\\repo",
            "tool_name": "Bash",
            "tool_input": {
                "command": "git status"
            }
        });

        let event = parse_and_normalize(&payload).expect("must parse successfully");
        assert_eq!(event.event_type, NormalizedEventType::ToolPre);
        assert_eq!(event.provider, "claude-code");
        assert_eq!(event.session_id, "session-claude-99");
        assert_eq!(event.cwd.as_deref(), Some("C:\\repo"));
        assert_eq!(event.tool_name.as_deref(), Some("Bash"));

        let input = event.tool_input.expect("must have tool_input");
        assert_eq!(input.command.as_deref(), Some("git status"));
    }

    #[test]
    fn test_normalize_antigravity_gemini_aliased_event() {
        let payload = json!({
            "event_type": "before_tool",
            "agent": "antigravity",
            "sessionId": "ag-sess-42",
            "cwd": "C:\\Users\\dev\\project",
            "tool": "run_command",
            "parameters": {
                "CommandLine": "cargo test --locked",
                "toolSummary": "Run test suite"
            }
        });

        let event = parse_and_normalize(&payload).expect("must parse successfully");
        assert_eq!(event.event_type, NormalizedEventType::ToolPre);
        assert_eq!(event.provider, "antigravity");
        assert_eq!(event.session_id, "ag-sess-42");
        assert_eq!(event.tool_name.as_deref(), Some("run_command"));

        let input = event.tool_input.expect("must have tool_input");
        assert_eq!(input.command.as_deref(), Some("cargo test --locked"));
        assert_eq!(input.summary.as_deref(), Some("Run test suite"));
    }

    #[test]
    fn test_normalize_path_and_query_aliasing() {
        let payload = json!({
            "type": "tool_call",
            "client": "cursor",
            "conversation_id": "cur-123",
            "name": "grep_search",
            "args": {
                "AbsolutePath": "C:\\repo\\Cargo.toml",
                "Query": "tokio"
            }
        });

        let event = parse_and_normalize(&payload).expect("must parse");
        let input = event.tool_input.expect("input");
        assert_eq!(input.path.as_deref(), Some("C:\\repo\\Cargo.toml"));
        assert_eq!(input.query.as_deref(), Some("tokio"));
    }

    #[test]
    fn test_normalize_native_antigravity_lifecycle_hook() {
        let payload = json!({
            "hook_event_name": "PostToolUse",
            "conversationId": "d641ffc3-c6ee-4d42-9f3c-19a386137da5",
            "workspacePaths": ["C:\\Users\\dev\\project"],
            "toolCall": {
                "name": "run_command",
                "args": {
                    "CommandLine": "git status --short",
                    "toolSummary": "Check git status"
                }
            }
        });

        let event =
            parse_and_normalize(&payload).expect("must parse native antigravity hook payload");
        assert_eq!(event.event_type, NormalizedEventType::ToolPost);
        assert_eq!(event.provider, "antigravity");
        assert_eq!(event.session_id, "d641ffc3-c6ee-4d42-9f3c-19a386137da5");
        assert_eq!(
            event.workspace_root.as_deref(),
            Some("C:\\Users\\dev\\project")
        );
        assert_eq!(event.tool_name.as_deref(), Some("run_command"));

        let input = event.tool_input.expect("must have tool_input");
        assert_eq!(input.command.as_deref(), Some("git status --short"));
        assert_eq!(input.summary.as_deref(), Some("Check git status"));
    }

    #[test]
    fn test_rejects_missing_session_id() {
        let payload = json!({
            "event": "SessionStart",
            "provider": "claude-code"
        });

        let err = parse_and_normalize(&payload).unwrap_err();
        assert_eq!(err, EventParseError::MissingField("session_id"));
    }

    #[test]
    fn test_rejects_oversized_session_id() {
        let huge_id = "s".repeat(MAX_IDENTIFIER_LEN + 1);
        let payload = json!({
            "event": "SessionStart",
            "session_id": huge_id
        });

        let err = parse_and_normalize(&payload).unwrap_err();
        match err {
            EventParseError::FieldTooLong { field, max } => {
                assert_eq!(field, "session_id");
                assert_eq!(max, MAX_IDENTIFIER_LEN);
            }
            _ => panic!("Expected FieldTooLong, got {:?}", err),
        }
    }
}
