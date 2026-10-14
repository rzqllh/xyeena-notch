//! Windows default output endpoint master volume, not per-app media volume.
//! Uses the public Core Audio COM API; no process injection or microphone access.
use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MasterVolume {
    pub available: bool,
    pub percent: u8,
    pub muted: bool,
    pub scope: &'static str,
}

#[cfg(windows)]
fn with_endpoint<T>(
    f: impl FnOnce(&windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume) -> Result<T, String>,
) -> Result<T, String> {
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
    };
    // COM interfaces are created, used and released on this one blocking worker.
    struct ComSession(bool);
    impl Drop for ComSession {
        fn drop(&mut self) {
            if self.0 {
                unsafe {
                    CoUninitialize();
                }
            }
        }
    }
    unsafe {
        // RPC_E_CHANGED_MODE simply indicates COM was initialized by the host
        // on this thread with another apartment model. Do not uninitialize it.
        let guard = ComSession(CoInitializeEx(None, COINIT_MULTITHREADED).is_ok());
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| format!("Windows audio endpoint unavailable: {e}"))?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .map_err(|e| format!("No default output device: {e}"))?;
        let endpoint: IAudioEndpointVolume = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|e| format!("Cannot control output volume: {e}"))?;
        let result = f(&endpoint);
        drop(endpoint);
        drop(device);
        drop(enumerator);
        drop(guard);
        result
    }
}

fn get_sync() -> Result<MasterVolume, String> {
    #[cfg(windows)]
    {
        with_endpoint(|endpoint| unsafe {
            let scalar = endpoint
                .GetMasterVolumeLevelScalar()
                .map_err(|e| e.to_string())?;
            let muted = endpoint.GetMute().map_err(|e| e.to_string())?.as_bool();
            Ok(MasterVolume {
                available: true,
                percent: (scalar.clamp(0.0, 1.0) * 100.0).round() as u8,
                muted,
                scope: "Windows master output",
            })
        })
    }
    #[cfg(not(windows))]
    {
        Ok(MasterVolume {
            available: false,
            percent: 0,
            muted: false,
            scope: "Windows only",
        })
    }
}
fn set_sync(percent: u8) -> Result<MasterVolume, String> {
    if percent > 100 {
        return Err("Volume must be 0-100".into());
    }
    #[cfg(windows)]
    {
        with_endpoint(|endpoint| unsafe {
            endpoint
                .SetMasterVolumeLevelScalar(f32::from(percent) / 100.0, std::ptr::null())
                .map_err(|e| format!("Could not change output volume: {e}"))
        })?;
        get_sync()
    }
    #[cfg(not(windows))]
    {
        Err("Output volume control requires Windows".into())
    }
}
fn mute_sync(muted: bool) -> Result<MasterVolume, String> {
    #[cfg(windows)]
    {
        with_endpoint(|endpoint| unsafe {
            endpoint
                .SetMute(muted, std::ptr::null())
                .map_err(|e| format!("Could not change output mute: {e}"))
        })?;
        get_sync()
    }
    #[cfg(not(windows))]
    {
        let _ = muted;
        Err("Output mute requires Windows".into())
    }
}
#[tauri::command]
pub async fn get_master_volume() -> Result<MasterVolume, String> {
    tauri::async_runtime::spawn_blocking(get_sync)
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn set_master_volume(percent: u8) -> Result<MasterVolume, String> {
    tauri::async_runtime::spawn_blocking(move || set_sync(percent))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn set_master_mute(muted: bool) -> Result<MasterVolume, String> {
    tauri::async_runtime::spawn_blocking(move || mute_sync(muted))
        .await
        .map_err(|e| e.to_string())?
}
