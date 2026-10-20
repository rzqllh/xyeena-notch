//! Sanitized Outbound DTO Boundary (W5)
//!
//! Enforces an explicit outbound allowlist for all telemetry emitted to the WebView.
//! Specifically:
//! - Complete removal of `raw` JSON payloads and arbitrary `tool_input` structures.
//! - String sanitization: strips C0/C1 control characters, bidi overrides, zero-width spaces.
//! - Redaction of tokens, API keys, and sensitive environment patterns.
//! - Strict length limits with truncation markers.

use super::state_machine::{ActivityState, ToolKind};
use serde::{Deserialize, Serialize};

/// Sanitizes a string for safe display in the WebView:
/// - Strips C0 and C1 control characters (preserving simple newlines if needed, or stripping if single line)
/// - Strips bidi overrides/isolates (U+202A..=U+202E, U+2066..=U+2069)
/// - Strips zero-width characters (U+200B, U+200C, U+200D, U+FEFF)
/// - Redacts detected credential patterns
/// - Collapses whitespace
/// - Truncates to max_chars with ellipsis marker
pub fn sanitize_display_text(raw: &str, max_chars: usize) -> String {
    let mut filtered = String::with_capacity(raw.len());

    for c in raw.chars() {
        // Strip bidi override and isolate characters
        if matches!(
            c,
            '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}' | '\u{200E}' | '\u{200F}' | '\u{061C}'
        ) {
            continue;
        }
        // Strip zero-width characters
        if matches!(
            c,
            '\u{200B}' | '\u{200C}' | '\u{200D}' | '\u{FEFF}' | '\u{00AD}'
        ) {
            continue;
        }
        // Strip C0 / C1 control characters (replace with space to avoid gluing tokens, collapsed later)
        if c.is_control() {
            filtered.push(' ');
            continue;
        }
        filtered.push(c);
    }

    // Collapse multiple spaces
    let mut collapsed = String::with_capacity(filtered.len());
    let mut last_was_space = false;
    for c in filtered.chars() {
        if c.is_whitespace() {
            if !last_was_space {
                collapsed.push(' ');
                last_was_space = true;
            }
        } else {
            collapsed.push(c);
            last_was_space = false;
        }
    }

    let trimmed = collapsed.trim();

    // Redact secret patterns
    let redacted = redact_secret_patterns(trimmed);

    // Truncate
    if redacted.chars().count() > max_chars {
        let truncated: String = redacted.chars().take(max_chars.saturating_sub(1)).collect();
        format!("{}…", truncated.trim_end())
    } else {
        redacted
    }
}

/// Redacts API keys, tokens, and URLs containing credentials.
fn redact_secret_patterns(text: &str) -> String {
    let mut out = text.to_string();

    // Canary token pattern
    if out.contains("CANARY_") || out.contains("canary_") {
        // Redact words containing CANARY
        let words: Vec<&str> = out.split_whitespace().collect();
        let sanitized_words: Vec<String> = words
            .into_iter()
            .map(|w| {
                if w.to_ascii_uppercase().contains("CANARY") {
                    "[REDACTED_SECRET]".to_string()
                } else {
                    w.to_string()
                }
            })
            .collect();
        out = sanitized_words.join(" ");
    }

    // Standard API key patterns (e.g. sk-..., ghp_..., etc.)
    let words: Vec<&str> = out.split_whitespace().collect();
    let sanitized_words: Vec<String> = words
        .into_iter()
        .map(|w| {
            if (w.starts_with("sk-") && w.len() > 10)
                || (w.starts_with("ghp_") && w.len() > 10)
                || (w.starts_with("xoxb-") && w.len() > 10)
                || w.contains("api_key=")
                || w.contains("token=")
            {
                "[REDACTED_KEY]".to_string()
            } else if w.contains("://") && w.contains('@') {
                // URL with embedded credentials, e.g. https://user:pass@host
                "[REDACTED_URL]".to_string()
            } else {
                w.to_string()
            }
        })
        .collect();

    sanitized_words.join(" ")
}

/// Outbound DTO for live session state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SessionDto {
    pub session_id: String,
    pub provider: String,
    pub display_name: String,
    pub alias: Option<String>,
    pub workspace_label: Option<String>,
    pub window_binding: Option<String>,
    pub activity_state: ActivityState,
    pub state_copy_key: String,
    pub attention_count: u32,
    pub is_focused: bool,
    pub last_event_at_ms: u64,
    pub active_approval_id: Option<String>,
}

/// Outbound DTO for a single timeline event.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TimelineEntryDto {
    pub entry_id: String,
    pub session_id: String,
    pub timestamp_ms: u64,
    pub event_kind: String,
    pub summary: String,
    pub tool_kind: Option<ToolKind>,
    pub command_preview: Option<String>,
    pub copy_key: String,
}

/// Outbound DTO for a pending approval card.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ApprovalDto {
    pub internal_request_id: String,
    pub session_id: String,
    pub provider: String,
    pub workspace_label: Option<String>,
    pub tool_kind: ToolKind,
    pub action_preview: String,
    pub armed_at_ms: u64,
    pub expires_at_ms: u64,
    pub default_action: String,
    pub interactive_allowed: bool,
    pub consequence_key: String,
}

/// Outbound DTO for file touched notifications.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FileTouchDto {
    pub session_id: String,
    pub file_path: String,
    pub change_kind: String,
    pub timestamp_ms: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bidi_and_zero_width_characters_are_stripped() {
        // Text injected with right-to-left override and zero-width spaces
        let dangerous = "Normal \u{202E}gnirts neddih\u{202C} \u{200B}text";
        let clean = sanitize_display_text(dangerous, 100);
        assert!(!clean.contains('\u{202E}'));
        assert!(!clean.contains('\u{202C}'));
        assert!(!clean.contains('\u{200B}'));
        assert_eq!(clean, "Normal gnirts neddih text");
    }

    #[test]
    fn test_c0_c1_control_characters_are_collapsed_or_stripped() {
        let text_with_controls = "Line 1\x00\x07\x1B[31m colored \n Line 2";
        let clean = sanitize_display_text(text_with_controls, 100);
        assert!(!clean.contains('\x00'));
        assert!(!clean.contains('\x07'));
        assert!(!clean.contains('\x1B'));
        assert_eq!(clean, "Line 1 [31m colored Line 2");
    }

    #[test]
    fn test_canary_secret_and_tokens_are_redacted() {
        let text = "Running tool with key sk-1234567890abcdef123456 and CANARY_SECRET_VAL!";
        let clean = sanitize_display_text(text, 200);
        assert!(!clean.contains("sk-1234567890abcdef123456"));
        assert!(!clean.contains("CANARY_SECRET_VAL"));
        assert!(clean.contains("[REDACTED_KEY]"));
        assert!(clean.contains("[REDACTED_SECRET]"));
    }

    #[test]
    fn test_url_with_credentials_redacted() {
        let url = "Clone from https://alice:supersecret@github.com/org/repo.git";
        let clean = sanitize_display_text(url, 200);
        assert!(!clean.contains("supersecret"));
        assert!(clean.contains("[REDACTED_URL]"));
    }

    #[test]
    fn test_length_capping_with_ellipsis() {
        let long_text = "This is a very long string that should be capped properly at some bound";
        let capped = sanitize_display_text(long_text, 20);
        assert!(capped.ends_with('…'));
        assert!(capped.chars().count() <= 20);
    }

    #[test]
    fn test_dto_json_serialization_contains_no_raw_or_tool_input_fields() {
        let session = SessionDto {
            session_id: "sess-1".to_string(),
            provider: "antigravity".to_string(),
            display_name: "Project #1234".to_string(),
            alias: None,
            workspace_label: Some("xyeena-notch".to_string()),
            window_binding: None,
            activity_state: ActivityState::Idle,
            state_copy_key: "agents.state.idle".to_string(),
            attention_count: 0,
            is_focused: true,
            last_event_at_ms: 1000,
            active_approval_id: None,
        };

        let json = serde_json::to_string(&session).unwrap();
        assert!(!json.contains("\"raw\""));
        assert!(!json.contains("\"tool_input\""));
        assert!(!json.contains("\"tool_output\""));
    }
}
