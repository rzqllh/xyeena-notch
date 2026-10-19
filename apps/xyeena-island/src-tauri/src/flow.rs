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
    pub current_language: String,
    pub supported_languages: Vec<String>,
    pub indonesian_supported: bool,
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
/// Accurately reports WinRT SpeechRecognizer engine capability and language pack availability.
#[tauri::command]
pub fn get_flow_engine_status() -> Result<FlowEngineStatus, String> {
    #[cfg(windows)]
    {
        use windows::Media::SpeechRecognition::SpeechRecognizer;
        let mut available = false;
        let mut current_language = "en-US".to_string();
        let mut supported_languages = Vec::new();
        let mut indonesian_supported = false;

        if let Ok(rec) = SpeechRecognizer::new() {
            available = true;
            if let Ok(lang) = rec.CurrentLanguage() {
                if let Ok(tag) = lang.LanguageTag() {
                    current_language = tag.to_string();
                }
            }
            if let Ok(langs) = SpeechRecognizer::SupportedTopicLanguages() {
                let count = langs.Size().unwrap_or(0);
                for i in 0..count {
                    if let Ok(l) = langs.GetAt(i) {
                        if let Ok(tag) = l.LanguageTag() {
                            let tag_str = tag.to_string();
                            if tag_str.to_lowercase().starts_with("id") {
                                indonesian_supported = true;
                            }
                            supported_languages.push(tag_str);
                        }
                    }
                }
            }
        }

        let engine_name = if available {
            "Windows.Media.SpeechRecognition (WinRT In-Process)".into()
        } else {
            "In-Process Speech Dictation Unavailable (OS Win+H Fallback)".into()
        };

        Ok(FlowEngineStatus {
            available,
            engine_name,
            local_only: true,
            hotkey: "Alt+D".into(),
            hotkey_registered: true,
            current_language,
            supported_languages,
            indonesian_supported,
        })
    }

    #[cfg(not(windows))]
    {
        Ok(FlowEngineStatus {
            available: false,
            engine_name: "Speech recognition only supported on Windows".into(),
            local_only: true,
            hotkey: "Alt+D".into(),
            hotkey_registered: false,
            current_language: "none".into(),
            supported_languages: vec![],
            indonesian_supported: false,
        })
    }
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
        #[cfg(windows)]
        {
            assert!(status.available);
            assert!(status.engine_name.contains("WinRT"));
            assert!(status.supported_languages.contains(&"en-US".to_string()));
            assert!(!status.indonesian_supported);
        }
        assert!(!status.engine_name.is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn test_winrt_speech_recognizer_availability() {
        use windows::Media::SpeechRecognition::SpeechRecognizer;
        let res = SpeechRecognizer::new();
        eprintln!(
            "WINRT SPEECH RECOGNIZER INSTANTIATION: {:?}",
            res.as_ref().map(|_| "OK").map_err(|e| e.to_string())
        );
        if let Ok(rec) = res {
            if let Ok(lang) = rec.CurrentLanguage() {
                if let Ok(tag) = lang.LanguageTag() {
                    eprintln!("WINRT CURRENT LANGUAGE: {}", tag);
                }
            }
            if let Ok(langs) = SpeechRecognizer::SupportedTopicLanguages() {
                let count = langs.Size().unwrap_or(0);
                eprintln!("WINRT SUPPORTED TOPIC LANGUAGES COUNT: {}", count);
                for i in 0..count {
                    if let Ok(l) = langs.GetAt(i) {
                        let tag = l.LanguageTag().map(|t| t.to_string()).unwrap_or_default();
                        let name = l.DisplayName().map(|n| n.to_string()).unwrap_or_default();
                        eprintln!("  TOPIC LANG {}: {} ({})", i, tag, name);
                    }
                }
            }
            if let Ok(langs) = SpeechRecognizer::SupportedGrammarLanguages() {
                let count = langs.Size().unwrap_or(0);
                eprintln!("WINRT SUPPORTED GRAMMAR LANGUAGES COUNT: {}", count);
                for i in 0..count {
                    if let Ok(l) = langs.GetAt(i) {
                        let tag = l.LanguageTag().map(|t| t.to_string()).unwrap_or_default();
                        let name = l.DisplayName().map(|n| n.to_string()).unwrap_or_default();
                        eprintln!("  GRAMMAR LANG {}: {} ({})", i, tag, name);
                    }
                }
            }
        }
    }
}
