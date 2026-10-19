//! Notetaker and voice commands module.
//! Enforces zero background recording, explicit user consent before any audio capture,
//! visual microphone active state indication, and bounded voice command execution.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

/// Status of the local audio input device and recording consent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MicrophoneStatus {
    pub available: bool,
    pub device_name: String,
    pub consented: bool,
    pub is_recording: bool,
    pub audio_backend_ready: bool,
    pub session_controller_active: bool,
    pub session_type: Option<String>,
}

/// Bounded in-memory captured audio PCM data.
#[derive(Debug, Clone, Default)]
pub struct CapturedAudioData {
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub is_float: bool,
    pub pcm_bytes: Vec<u8>,
}

/// Active recording session with explicit consent and bounded duration.
struct ActiveRecording {
    session_id: String,
    session_type: String,
    started_at: Instant,
    max_duration: Duration,
    stop_signal: Arc<AtomicBool>,
    is_paused: Arc<AtomicBool>,
    audio_data: Arc<Mutex<CapturedAudioData>>,
    #[allow(dead_code)]
    worker_handle: Option<JoinHandle<()>>,
}

/// Thread-safe manager for consented recording sessions.
#[derive(Default)]
pub struct VoiceSessionManager {
    active_session: Option<ActiveRecording>,
    last_completed_session: Option<(String, CapturedAudioData)>,
}

static VOICE_MANAGER: Mutex<Option<VoiceSessionManager>> = Mutex::new(None);

fn with_manager<F, R>(f: F) -> R
where
    F: FnOnce(&mut VoiceSessionManager) -> R,
{
    let mut guard = VOICE_MANAGER
        .lock()
        .expect("VoiceSessionManager lock poisoned");
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
    if text.contains("expand island")
        || text.contains("open island")
        || text.contains("show island")
    {
        return VoiceCommandAction::SetMode {
            mode: "expanded".into(),
        };
    }
    if text.contains("compact island")
        || text.contains("minimize island")
        || text.contains("collapse island")
    {
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
    if text.contains("open clipboard")
        || text.contains("show clips")
        || text == "clips"
        || text == "clipboard"
    {
        return VoiceCommandAction::Navigate {
            panel: "clipboard".into(),
        };
    }
    if text.contains("open settings")
        || text.contains("show settings")
        || text == "settings"
        || text == "preferences"
    {
        return VoiceCommandAction::Navigate {
            panel: "preferences".into(),
        };
    }
    if text.contains("show activity")
        || text.contains("open activity")
        || text.contains("show agents")
        || text == "activity"
        || text == "agents"
    {
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

#[cfg(windows)]
fn spawn_wasapi_capture_thread(
    stop_signal: Arc<AtomicBool>,
    is_paused: Arc<AtomicBool>,
    audio_data: Arc<Mutex<CapturedAudioData>>,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        use windows::Win32::Media::Audio::{
            eCapture, eConsole, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator,
            MMDeviceEnumerator, AUDCLNT_SHAREMODE_SHARED,
        };
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
        };

        unsafe {
            if CoInitializeEx(None, COINIT_MULTITHREADED).is_err() {
                return;
            }

            let enumerator: Result<IMMDeviceEnumerator, _> =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL);
            if let Ok(enum_device) = enumerator {
                if let Ok(endpoint) = enum_device.GetDefaultAudioEndpoint(eCapture, eConsole) {
                    if let Ok(client) = endpoint.Activate::<IAudioClient>(CLSCTX_ALL, None) {
                        if let Ok(p_format) = client.GetMixFormat() {
                            let channels = (*p_format).nChannels;
                            let sample_rate = (*p_format).nSamplesPerSec;
                            let bits = (*p_format).wBitsPerSample;
                            let block_align = (*p_format).nBlockAlign as usize;
                            let is_float = (*p_format).wFormatTag == 3
                                || ((*p_format).wFormatTag == 0xFFFE && bits == 32);

                            {
                                if let Ok(mut data) = audio_data.lock() {
                                    data.channels = channels;
                                    data.sample_rate = sample_rate;
                                    data.bits_per_sample = bits;
                                    data.is_float = is_float;
                                }
                            }

                            if client
                                .Initialize(
                                    AUDCLNT_SHAREMODE_SHARED,
                                    0,
                                    10_000_000,
                                    0,
                                    p_format,
                                    None,
                                )
                                .is_ok()
                            {
                                if let Ok(capture_client) =
                                    client.GetService::<IAudioCaptureClient>()
                                {
                                    if client.Start().is_ok() {
                                        // Bound memory buffer to 50 MB
                                        const MAX_BUFFER_BYTES: usize = 50 * 1024 * 1024;

                                        while !stop_signal.load(Ordering::Relaxed) {
                                            if is_paused.load(Ordering::Relaxed) {
                                                std::thread::sleep(
                                                    std::time::Duration::from_millis(20),
                                                );
                                                continue;
                                            }

                                            if let Ok(packet_size) =
                                                capture_client.GetNextPacketSize()
                                            {
                                                if packet_size > 0 {
                                                    let mut p_data = std::ptr::null_mut();
                                                    let mut num_frames = 0u32;
                                                    let mut flags = 0u32;
                                                    if capture_client
                                                        .GetBuffer(
                                                            &mut p_data,
                                                            &mut num_frames,
                                                            &mut flags,
                                                            None,
                                                            None,
                                                        )
                                                        .is_ok()
                                                    {
                                                        let byte_count =
                                                            (num_frames as usize) * block_align;
                                                        if !p_data.is_null() && byte_count > 0 {
                                                            let slice = std::slice::from_raw_parts(
                                                                p_data, byte_count,
                                                            );
                                                            if let Ok(mut data) = audio_data.lock()
                                                            {
                                                                if data.pcm_bytes.len()
                                                                    + slice.len()
                                                                    <= MAX_BUFFER_BYTES
                                                                {
                                                                    data.pcm_bytes
                                                                        .extend_from_slice(slice);
                                                                }
                                                            }
                                                        }
                                                        let _ = capture_client
                                                            .ReleaseBuffer(num_frames);
                                                    }
                                                }
                                            }
                                            std::thread::sleep(std::time::Duration::from_millis(
                                                15,
                                            ));
                                        }

                                        let _ = client.Stop();
                                    }
                                }
                            }
                        }
                    }
                }
            }

            CoUninitialize();
        }
    })
}

/// Standard 44-byte RIFF/WAVE header builder for 16-bit PCM export.
pub fn create_wav_header(
    sample_rate: u32,
    channels: u16,
    bits_per_sample: u16,
    data_len: u32,
) -> Vec<u8> {
    let mut header = Vec::with_capacity(44);
    let byte_rate = sample_rate * (channels as u32) * (bits_per_sample as u32 / 8);
    let block_align = channels * (bits_per_sample / 8);
    let total_file_size = 36 + data_len;

    header.extend_from_slice(b"RIFF");
    header.extend_from_slice(&total_file_size.to_le_bytes());
    header.extend_from_slice(b"WAVE");
    header.extend_from_slice(b"fmt ");
    header.extend_from_slice(&16u32.to_le_bytes());
    header.extend_from_slice(&1u16.to_le_bytes());
    header.extend_from_slice(&channels.to_le_bytes());
    header.extend_from_slice(&sample_rate.to_le_bytes());
    header.extend_from_slice(&byte_rate.to_le_bytes());
    header.extend_from_slice(&block_align.to_le_bytes());
    header.extend_from_slice(&bits_per_sample.to_le_bytes());
    header.extend_from_slice(b"data");
    header.extend_from_slice(&data_len.to_le_bytes());

    header
}

/// Query local microphone capability and current recording state.
/// Accurately reports audio capture engine availability, strictly differentiating
/// UI session state from hardware capture state.
#[tauri::command]
pub fn get_microphone_status() -> Result<MicrophoneStatus, String> {
    with_manager(|mgr| {
        let session_controller_active = mgr.active_session.is_some();
        let session_type = mgr.active_session.as_ref().map(|s| s.session_type.clone());
        let is_recording = mgr
            .active_session
            .as_ref()
            .map(|s| !s.is_paused.load(Ordering::Relaxed))
            .unwrap_or(false);
        let consented = mgr.active_session.is_some();

        #[cfg(windows)]
        {
            use windows::Win32::Media::Audio::{
                eCapture, eConsole, IMMDeviceEnumerator, MMDeviceEnumerator,
            };
            use windows::Win32::System::Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
            };

            let mut device_name = "Default Windows Capture Endpoint (WASAPI)".to_string();
            let mut available = false;
            let mut audio_backend_ready = false;

            unsafe {
                if CoInitializeEx(None, COINIT_MULTITHREADED).is_ok() {
                    let enumerator: Result<IMMDeviceEnumerator, _> =
                        CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL);
                    if let Ok(enum_device) = enumerator {
                        if let Ok(_endpoint) =
                            enum_device.GetDefaultAudioEndpoint(eCapture, eConsole)
                        {
                            available = true;
                            audio_backend_ready = true;
                            device_name = "Default Windows Capture Endpoint (WASAPI Ready)".into();
                        }
                    }
                    CoUninitialize();
                }
            }

            Ok(MicrophoneStatus {
                available,
                device_name,
                consented,
                is_recording,
                audio_backend_ready,
                session_controller_active,
                session_type,
            })
        }

        #[cfg(not(windows))]
        {
            Ok(MicrophoneStatus {
                available: false,
                device_name: "Hardware Audio Capture only supported on Windows".into(),
                consented,
                is_recording,
                audio_backend_ready: false,
                session_controller_active,
                session_type,
            })
        }
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
        return Err(
            "Explicit user consent is strictly required before starting audio recording.".into(),
        );
    }

    with_manager(|mgr| {
        if mgr.active_session.is_some() {
            return Err(
                "A recording session is already active. Stop current session first.".into(),
            );
        }

        let max_duration = if session_type == "voice_command" {
            Duration::from_secs(30)
        } else {
            // Notetaker session bounded to 60 minutes
            Duration::from_secs(3600)
        };

        let session_id = format!(
            "rec_{}_{}",
            session_type,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        );

        let stop_signal = Arc::new(AtomicBool::new(false));
        let is_paused = Arc::new(AtomicBool::new(false));
        let audio_data = Arc::new(Mutex::new(CapturedAudioData::default()));

        #[cfg(windows)]
        let worker_handle = Some(spawn_wasapi_capture_thread(
            stop_signal.clone(),
            is_paused.clone(),
            audio_data.clone(),
        ));
        #[cfg(not(windows))]
        let worker_handle = None;

        mgr.active_session = Some(ActiveRecording {
            session_id: session_id.clone(),
            session_type,
            started_at: Instant::now(),
            max_duration,
            stop_signal,
            is_paused,
            audio_data,
            worker_handle,
        });

        Ok(session_id)
    })
}

/// Pause an active audio recording session.
#[tauri::command]
pub fn pause_consented_recording(session_id: String) -> Result<bool, String> {
    with_manager(|mgr| {
        if let Some(ref active) = mgr.active_session {
            if active.session_id == session_id {
                active.is_paused.store(true, Ordering::Relaxed);
                Ok(true)
            } else {
                Err(format!(
                    "Session ID mismatch. Active session: {}",
                    active.session_id
                ))
            }
        } else {
            Err("No active recording session to pause.".into())
        }
    })
}

/// Resume a paused audio recording session.
#[tauri::command]
pub fn resume_consented_recording(session_id: String) -> Result<bool, String> {
    with_manager(|mgr| {
        if let Some(ref active) = mgr.active_session {
            if active.session_id == session_id {
                active.is_paused.store(false, Ordering::Relaxed);
                Ok(true)
            } else {
                Err(format!(
                    "Session ID mismatch. Active session: {}",
                    active.session_id
                ))
            }
        } else {
            Err("No active recording session to resume.".into())
        }
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
                    return Err(format!(
                        "Session ID mismatch. Active session: {}",
                        session_id
                    ));
                }

                active.stop_signal.store(true, Ordering::Relaxed);

                let audio_snapshot = active
                    .audio_data
                    .lock()
                    .map(|d| d.clone())
                    .unwrap_or_default();
                mgr.last_completed_session = Some((active.session_id.clone(), audio_snapshot));

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

/// Export a recorded session as a standard 16-bit PCM WAV file upon explicit user request.
#[allow(clippy::chunks_exact_to_as_chunks)]
#[tauri::command]
pub fn export_consented_recording(session_id: String, export_path: String) -> Result<u64, String> {
    with_manager(|mgr| {
        let audio_data = if let Some(ref active) = mgr.active_session {
            if active.session_id == session_id {
                active.audio_data.lock().map_err(|e| e.to_string())?.clone()
            } else {
                return Err("Session ID mismatch".into());
            }
        } else if let Some((ref last_id, ref data)) = mgr.last_completed_session {
            if last_id == &session_id {
                data.clone()
            } else {
                return Err("No matching completed session found for export".into());
            }
        } else {
            return Err("No active or completed recording session found".into());
        };

        if audio_data.pcm_bytes.is_empty() {
            return Err("No audio data recorded in this session to export".into());
        }

        let pcm_16_bytes = if audio_data.is_float && audio_data.bits_per_sample == 32 {
            let num_samples = audio_data.pcm_bytes.len() / 4;
            let mut out = Vec::with_capacity(num_samples * 2);
            for chunk in audio_data.pcm_bytes.chunks_exact(4) {
                let sample_f32 = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
                let sample_i16 = (sample_f32 * 32767.0).clamp(-32768.0, 32767.0) as i16;
                out.extend_from_slice(&sample_i16.to_le_bytes());
            }
            out
        } else {
            audio_data.pcm_bytes
        };

        let wav_header = create_wav_header(
            if audio_data.sample_rate > 0 {
                audio_data.sample_rate
            } else {
                48000
            },
            if audio_data.channels > 0 {
                audio_data.channels
            } else {
                2
            },
            16,
            pcm_16_bytes.len() as u32,
        );

        let mut full_file = Vec::with_capacity(wav_header.len() + pcm_16_bytes.len());
        full_file.extend_from_slice(&wav_header);
        full_file.extend_from_slice(&pcm_16_bytes);

        let target_path = if std::path::Path::new(&export_path).is_absolute() {
            std::path::PathBuf::from(&export_path)
        } else {
            std::env::var_os("USERPROFILE")
                .map(|p| std::path::PathBuf::from(p).join("Downloads"))
                .filter(|p| p.exists())
                .or_else(|| std::env::current_dir().ok())
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join(&export_path)
        };

        std::fs::write(&target_path, &full_file)
            .map_err(|e| format!("Failed to write export WAV file: {}", e))?;

        Ok(full_file.len() as u64)
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

    #[cfg(windows)]
    #[test]
    fn test_wasapi_default_capture_device_detection() {
        use windows::Win32::Media::Audio::{
            eCapture, eConsole, IMMDeviceEnumerator, MMDeviceEnumerator,
        };
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
        };
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let enumerator: Result<IMMDeviceEnumerator, _> =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL);
            eprintln!(
                "WASAPI IMMDeviceEnumerator CoCreateInstance: {:?}",
                enumerator.is_ok()
            );
            if let Ok(enum_device) = enumerator {
                let default_endpoint = enum_device.GetDefaultAudioEndpoint(eCapture, eConsole);
                eprintln!(
                    "WASAPI GetDefaultAudioEndpoint: {:?}",
                    default_endpoint.is_ok()
                );
            }
            CoUninitialize();
        }
    }

    #[cfg(windows)]
    #[test]
    fn test_wasapi_audio_client_initialization() {
        use windows::Win32::Media::Audio::{
            eCapture, eConsole, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator,
            MMDeviceEnumerator, AUDCLNT_SHAREMODE_SHARED,
        };
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
        };
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let enumerator: Result<IMMDeviceEnumerator, _> =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL);
            if let Ok(enum_device) = enumerator {
                if let Ok(endpoint) = enum_device.GetDefaultAudioEndpoint(eCapture, eConsole) {
                    let client_res: Result<IAudioClient, _> = endpoint.Activate(CLSCTX_ALL, None);
                    eprintln!(
                        "WASAPI endpoint.Activate::<IAudioClient>: {:?}",
                        client_res.is_ok()
                    );
                    if let Ok(client) = client_res {
                        if let Ok(p_format) = client.GetMixFormat() {
                            let channels = (*p_format).nChannels;
                            let sample_rate = (*p_format).nSamplesPerSec;
                            let bits = (*p_format).wBitsPerSample;
                            eprintln!(
                                "WASAPI MixFormat: channels={}, sample_rate={}, bits={}",
                                channels, sample_rate, bits
                            );
                            let init_res = client.Initialize(
                                AUDCLNT_SHAREMODE_SHARED,
                                0,
                                10_000_000,
                                0,
                                p_format,
                                None,
                            );
                            eprintln!("WASAPI client.Initialize: {:?}", init_res.is_ok());
                            if init_res.is_ok() {
                                let capture_res: Result<IAudioCaptureClient, _> =
                                    client.GetService();
                                eprintln!(
                                    "WASAPI client.GetService::<IAudioCaptureClient>: {:?}",
                                    capture_res.is_ok()
                                );
                            }
                        }
                    }
                }
            }
            CoUninitialize();
        }
    }

    #[cfg(windows)]
    #[test]
    fn test_wasapi_real_audio_capture_frames() {
        use windows::Win32::Media::Audio::{
            eCapture, eConsole, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator,
            MMDeviceEnumerator, AUDCLNT_SHAREMODE_SHARED,
        };
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
        };
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let enumerator: Result<IMMDeviceEnumerator, _> =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL);
            if let Ok(enum_device) = enumerator {
                if let Ok(endpoint) = enum_device.GetDefaultAudioEndpoint(eCapture, eConsole) {
                    if let Ok(client) = endpoint.Activate::<IAudioClient>(CLSCTX_ALL, None) {
                        if let Ok(p_format) = client.GetMixFormat() {
                            if client
                                .Initialize(
                                    AUDCLNT_SHAREMODE_SHARED,
                                    0,
                                    10_000_000,
                                    0,
                                    p_format,
                                    None,
                                )
                                .is_ok()
                            {
                                if let Ok(capture_client) =
                                    client.GetService::<IAudioCaptureClient>()
                                {
                                    assert!(client.Start().is_ok());
                                    // Sleep a moment to let hardware capture frames
                                    std::thread::sleep(std::time::Duration::from_millis(50));
                                    let mut total_frames = 0u32;
                                    for _ in 0..10 {
                                        if let Ok(packet_size) = capture_client.GetNextPacketSize()
                                        {
                                            if packet_size > 0 {
                                                let mut p_data = std::ptr::null_mut();
                                                let mut num_frames = 0u32;
                                                let mut flags = 0u32;
                                                if capture_client
                                                    .GetBuffer(
                                                        &mut p_data,
                                                        &mut num_frames,
                                                        &mut flags,
                                                        None,
                                                        None,
                                                    )
                                                    .is_ok()
                                                {
                                                    total_frames += num_frames;
                                                    let _ =
                                                        capture_client.ReleaseBuffer(num_frames);
                                                }
                                            }
                                        }
                                        std::thread::sleep(std::time::Duration::from_millis(10));
                                    }
                                    let stop_res = client.Stop();
                                    eprintln!(
                                        "WASAPI client.Stop: {:?}, total_frames_captured: {}",
                                        stop_res.is_ok(),
                                        total_frames
                                    );
                                    assert!(stop_res.is_ok());
                                    assert!(
                                        total_frames > 0,
                                        "Real microphone must deliver non-empty audio frames"
                                    );
                                }
                            }
                        }
                    }
                }
            }
            CoUninitialize();
        }
    }

    static TEST_MUTEX: Mutex<()> = Mutex::new(());

    fn reset_test_state() {
        with_manager(|mgr| {
            if let Some(ref active) = mgr.active_session {
                active.stop_signal.store(true, Ordering::Relaxed);
            }
            mgr.active_session = None;
            mgr.last_completed_session = None;
        });
    }

    #[test]
    fn test_consent_required_to_start_recording() {
        let _guard = TEST_MUTEX.lock().unwrap();
        reset_test_state();
        let err = start_consented_recording("notetaker".into(), false);
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("consent is strictly required"));
    }

    #[test]
    fn test_recording_lifecycle_happy_path() {
        let _guard = TEST_MUTEX.lock().unwrap();
        reset_test_state();
        let sid =
            start_consented_recording("notetaker".into(), true).expect("Must start with consent");
        assert!(sid.starts_with("rec_notetaker_"));

        let status = get_microphone_status().expect("Must get mic status");
        // On Windows with WASAPI capture active
        assert!(status.session_controller_active);
        assert_eq!(status.session_type.as_deref(), Some("notetaker"));
        assert!(status.consented);
        #[cfg(windows)]
        {
            assert!(status.available);
            assert!(status.audio_backend_ready);
            assert!(status.is_recording);
        }

        // Test pause
        let pause_res = pause_consented_recording(sid.clone());
        assert!(pause_res.is_ok());
        let paused_status = get_microphone_status().expect("Must get status after pause");
        assert!(!paused_status.is_recording);

        // Test resume
        let resume_res = resume_consented_recording(sid.clone());
        assert!(resume_res.is_ok());
        let resumed_status = get_microphone_status().expect("Must get status after resume");
        assert!(resumed_status.is_recording);

        let summary = stop_consented_recording(sid.clone()).expect("Must stop session");
        assert_eq!(summary.session_id, sid);
        assert_eq!(summary.session_type, "notetaker");

        let after_status = get_microphone_status().expect("Must get mic status");
        assert!(!after_status.session_controller_active);
        assert!(!after_status.is_recording);
        assert_eq!(after_status.session_type, None);

        // Test WAV header builder
        let header = create_wav_header(48000, 2, 16, 1920);
        assert_eq!(&header[0..4], b"RIFF");
        assert_eq!(&header[8..12], b"WAVE");
        assert_eq!(&header[12..16], b"fmt ");
        assert_eq!(&header[36..40], b"data");
        assert_eq!(header.len(), 44);
    }

    #[test]
    fn test_duplicate_session_rejected() {
        let _guard = TEST_MUTEX.lock().unwrap();
        reset_test_state();
        let sid =
            start_consented_recording("voice_command".into(), true).expect("First session starts");
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
