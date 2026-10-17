//! Flow offline dictation and snippets engine module.
//! Provides offline speech capability detection, hotkey registration checks,
//! and privacy-safe text cleanup without cloud network dependencies.

use serde::{Deserialize, Serialize};

/// Status of the local Flow speech engine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FlowEngineStatus {
    pub available: bool,
    pub engine_name: String,
    pub local_only: bool,
    pub hotkey: String,
    pub hotkey_registered: bool,
}

/// Clean up dictated raw speech text by stripping filler words and normalizing whitespace.
pub fn cleanup_dictated_text(text: &str, filter_fillers: bool) -> String {
    let mut cleaned = text.trim().to_string();

    if filter_fillers {
        let fillers = [
            " um ",
            " Um ",
            " uh ",
            " Uh ",
            " erm ",
            " Erm ",
            " ah ",
            " Ah ",
            " like, ",
            " you know, ",
            " basically, ",
        ];
        for filler in fillers {
            cleaned = cleaned.replace(filler, " ");
        }
        // Check start of string fillers
        let start_fillers = ["um ", "Um ", "uh ", "Uh ", "erm ", "Erm ", "ah ", "Ah "];
        for sf in start_fillers {
            if cleaned.starts_with(sf) {
                cleaned = cleaned[sf.len()..].to_string();
            }
        }
    }

    // Collapse multiple consecutive spaces
    let mut collapsed = String::with_capacity(cleaned.len());
    let mut last_was_space = false;
    for c in cleaned.chars() {
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

    // Capitalize first character if non-empty
    if let Some(first) = collapsed.chars().next() {
        if first.is_lowercase() {
            let mut capitalized = first.to_uppercase().to_string();
            capitalized.push_str(&collapsed[first.len_utf8()..]);
            return capitalized;
        }
    }

    collapsed
}

/// Check the status of the local offline dictation engine.
/// Accurately reports engine availability without inferring readiness from platform.
#[tauri::command]
pub fn get_flow_engine_status() -> Result<FlowEngineStatus, String> {
    // In-process speech recognition engine is pending implementation.
    // OS Windows Voice Typing (Win+H) remains available as external OS fallback.
    Ok(FlowEngineStatus {
        available: false,
        engine_name: "In-Process Speech Dictation Pending (OS Win+H Fallback)".into(),
        local_only: true,
        hotkey: "Alt+D".into(),
        hotkey_registered: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cleanup_dictated_text_strips_fillers() {
        let raw = "Um this is like, um a test uh sentence.";
        let cleaned = cleanup_dictated_text(raw, true);
        assert!(!cleaned.to_lowercase().contains("um"));
        assert!(!cleaned.to_lowercase().contains("uh"));
        assert!(cleaned.starts_with("This is"));
    }

    #[test]
    fn test_cleanup_dictated_text_preserves_without_filter() {
        let raw = "um this is a test";
        let cleaned = cleanup_dictated_text(raw, false);
        assert!(cleaned.starts_with("Um this"));
    }

    #[test]
    fn test_flow_engine_status_is_local_only() {
        let status = get_flow_engine_status().expect("Must return flow status");
        assert!(status.local_only);
        assert!(
            !status.available,
            "In-process Flow engine must not be claimed available until implemented"
        );
        assert!(!status.engine_name.is_empty());
    }
}
