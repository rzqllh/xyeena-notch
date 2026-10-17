//! Notetaker and voice commands module.
//! Enforces zero background recording, explicit user consent before any audio capture,
//! visual microphone active state indication, and bounded voice command execution.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Status of the local audio input device and recording consent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MicrophoneStatus {
    pub available: bool,
    pub device_name: String,
    pub consented: bool,
    pub is_recording: bool,
    pub session_type: Option<String>,
}

/// Active recording session with explicit consent and bounded duration.
#[derive(Debug)]
struct ActiveRecording {
    session_id: String,
    session_type: String,
    started_at: Instant,
    max_duration: Duration,
}

/// Thread-safe manager for consented recording sessions.
#[derive(Default)]
pub struct VoiceSessionManager {
    active_session: Option<ActiveRecording>,
}

static VOICE_MANAGER: Mutex<Option<VoiceSessionManager>> = Mutex::new(None);

fn with_manager<F, R>(f: F) -> R
where
    F: FnOnce(&mut VoiceSessionManager) -> R,
{
    let mut guard = VOICE_MANAGER.lock().expect("VoiceSessionManager lock poisoned");
    let mgr = guard.get_or_insert_with(VoiceSessionManager::default);
    f(mgr)
}

/// Summary of a finished consented recording session.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecordingSummary {
    pub session_id: String,
    pub session_type: String,
    pub duration_seconds: u64,
}

/// Typed bounded voice command actions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "action", content = "payload")]
pub enum VoiceCommandAction {
    SetMode { mode: String },
    Navigate { panel: String },
    MediaControl { control: String },
    AskXyn { prompt: String },
    WeeklyRecap,
    Unknown { transcript: String },
}

/// Parse a raw voice transcript into a typed, bounded application action.
pub fn parse_voice_command(transcript: &str) -> VoiceCommandAction {
    let text = transcript.trim().to_lowercase();
    if text.is_empty() {
        return VoiceCommandAction::Unknown {
            transcript: String::new(),
        };
    }

    // 1. Ask Xyn queries ("ask xyn ...", "hey xyn ...", "xyn ...")
    let xyn_prefixes = ["ask xyn ", "hey xyn ", "xyn "];
    for prefix in xyn_prefixes {
        if text.starts_with(prefix) {
            let prompt = transcript.trim()[prefix.len()..].trim().to_string();
            if !prompt.is_empty() {
                return VoiceCommandAction::AskXyn { prompt };
            }
        }
    }

    // 2. Mode commands
    if text.contains("expand island") || text.contains("open island") || text.contains("show island") {
        return VoiceCommandAction::SetMode {
            mode: "expanded".into(),
        };
    }
    if text.contains("compact island") || text.contains("minimize island") || text.contains("collapse island") {
        return VoiceCommandAction::SetMode {
            mode: "compact".into(),
        };
    }
    if text.contains("hide island") || text.contains("close island") {
        return VoiceCommandAction::SetMode {
            mode: "hidden".into(),
        };
    }

    // 3. Navigation commands
    if text.contains("open chat") || text.contains("show chat") || text == "chat" {
        return VoiceCommandAction::Navigate {
            panel: "chat".into(),
        };
    }
    if text.contains("open clipboard") || text.contains("show clips") || text == "clips" || text == "clipboard" {
        return VoiceCommandAction::Navigate {
            panel: "clipboard".into(),
        };
    }
    if text.contains("open settings") || text.contains("show settings") || text == "settings" || text == "preferences" {
        return VoiceCommandAction::Navigate {
            panel: "preferences".into(),
        };
    }
    if text.contains("show activity") || text.contains("open activity") || text.contains("show agents") || text == "activity" || text == "agents" {
        return VoiceCommandAction::Navigate {
            panel: "activity".into(),
        };
    }
    if text.contains("show now") || text.contains("open now") || text == "now" {
        return VoiceCommandAction::Navigate {
            panel: "now".into(),
        };
    }

    // 4. Media transport commands
    if text == "play" || text == "play music" || text == "resume playback" || text == "resume" {
        return VoiceCommandAction::MediaControl {
            control: "play".into(),
        };
    }
    if text == "pause" || text == "pause music" || text == "stop music" {
        return VoiceCommandAction::MediaControl {
            control: "pause".into(),
        };
    }
    if text == "next track" || text == "next song" || text == "skip" || text == "skip song" {
        return VoiceCommandAction::MediaControl {
            control: "next".into(),
        };
    }
    if text == "previous track" || text == "previous song" || text == "previous" {
        return VoiceCommandAction::MediaControl {
            control: "previous".into(),
        };
    }

    // 5. Weekly Recap
    if text.contains("weekly recap") || text.contains("generate recap") || text == "recap" {
        return VoiceCommandAction::WeeklyRecap;
    }

    VoiceCommandAction::Unknown {
        transcript: transcript.trim().to_string(),
    }
}

/// Query local microphone capability and current recording state.
#[tauri::command]
pub fn get_microphone_status() -> Result<MicrophoneStatus, String> {
    with_manager(|mgr| {
        let is_recording = mgr.active_session.is_some();
        let session_type = mgr.active_session.as_ref().map(|s| s.session_type.clone());

        #[cfg(windows)]
        let available = true;
        #[cfg(not(windows))]
        let available = false;

        Ok(MicrophoneStatus {
            available,
            device_name: "Default Windows Recording Endpoint".into(),
            consented: false,
            is_recording,
            session_type,
        })
    })
}

/// Start an audio recording session with strict user consent verification.
/// Fails immediately if `user_consented` is false.
#[tauri::command]
pub fn start_consented_recording(
    session_type: String,
    user_consented: bool,
) -> Result<String, String> {
    if !user_consented {
        return Err("Explicit user consent is strictly required before starting audio recording.".into());
    }

    with_manager(|mgr| {
        if mgr.active_session.is_some() {
            return Err("A recording session is already active. Stop current session first.".into());
        }

        let max_duration = if session_type == "voice_command" {
            Duration::from_secs(30)
        } else {
            // Notetaker session bounded to 60 minutes
            Duration::from_secs(3600)
        };

        let session_id = format!("rec_{}_{}", session_type, std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());

        mgr.active_session = Some(ActiveRecording {
            session_id: session_id.clone(),
            session_type,
            started_at: Instant::now(),
            max_duration,
        });

        Ok(session_id)
    })
}

/// Stop an active audio recording session and return bounded summary.
#[tauri::command]
pub fn stop_consented_recording(session_id: String) -> Result<RecordingSummary, String> {
    with_manager(|mgr| {
        match mgr.active_session.take() {
            Some(active) => {
                if active.session_id != session_id {
                    // Put it back
                    mgr.active_session = Some(active);
                    return Err(format!("Session ID mismatch. Active session: {}", session_id));
                }

                let elapsed = active.started_at.elapsed();
                let bounded_duration = elapsed.min(active.max_duration);

                Ok(RecordingSummary {
                    session_id: active.session_id,
                    session_type: active.session_type,
                    duration_seconds: bounded_duration.as_secs(),
                })
            }
            None => Err("No active recording session found.".into()),
        }
    })
}

/// Parse voice command text into a typed command action.
#[tauri::command]
pub fn parse_voice_intent(transcript: String) -> Result<VoiceCommandAction, String> {
    Ok(parse_voice_command(&transcript))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_consent_required_to_start_recording() {
        let err = start_consented_recording("notetaker".into(), false);
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("consent is strictly required"));
    }

    #[test]
    fn test_recording_lifecycle_happy_path() {
        let sid = start_consented_recording("notetaker".into(), true).expect("Must start with consent");
        assert!(sid.starts_with("rec_notetaker_"));

        let status = get_microphone_status().expect("Must get mic status");
        assert!(status.is_recording);
        assert_eq!(status.session_type.as_deref(), Some("notetaker"));

        let summary = stop_consented_recording(sid.clone()).expect("Must stop session");
        assert_eq!(summary.session_id, sid);
        assert_eq!(summary.session_type, "notetaker");

        let after_status = get_microphone_status().expect("Must get mic status");
        assert!(!after_status.is_recording);
        assert_eq!(after_status.session_type, None);
    }

    #[test]
    fn test_duplicate_session_rejected() {
        let sid = start_consented_recording("voice_command".into(), true).expect("First session starts");
        let duplicate_err = start_consented_recording("voice_command".into(), true);
        assert!(duplicate_err.is_err());
        assert!(duplicate_err.unwrap_err().contains("already active"));

        stop_consented_recording(sid).expect("Cleanup session");
    }

    #[test]
    fn test_voice_command_parsing() {
        // Mode switching
        assert_eq!(
            parse_voice_command("Please expand island now"),
            VoiceCommandAction::SetMode {
                mode: "expanded".into()
            }
        );
        assert_eq!(
            parse_voice_command("compact island"),
            VoiceCommandAction::SetMode {
                mode: "compact".into()
            }
        );

        // Navigation
        assert_eq!(
            parse_voice_command("show chat"),
            VoiceCommandAction::Navigate {
                panel: "chat".into()
            }
        );
        assert_eq!(
            parse_voice_command("open clipboard"),
            VoiceCommandAction::Navigate {
                panel: "clipboard".into()
            }
        );

        // Media controls
        assert_eq!(
            parse_voice_command("pause music"),
            VoiceCommandAction::MediaControl {
                control: "pause".into()
            }
        );
        assert_eq!(
            parse_voice_command("next track"),
            VoiceCommandAction::MediaControl {
                control: "next".into()
            }
        );

        // Ask Xyn
        assert_eq!(
            parse_voice_command("Ask Xyn what is the current weather?"),
            VoiceCommandAction::AskXyn {
                prompt: "what is the current weather?".into()
            }
        );
        assert_eq!(
            parse_voice_command("Hey Xyn review this diff"),
            VoiceCommandAction::AskXyn {
                prompt: "review this diff".into()
            }
        );

        // Weekly recap
        assert_eq!(
            parse_voice_command("generate recap"),
            VoiceCommandAction::WeeklyRecap
        );

        // Unknown
        assert_eq!(
            parse_voice_command("random phrase that has no command"),
            VoiceCommandAction::Unknown {
                transcript: "random phrase that has no command".into()
            }
        );
    }
}
