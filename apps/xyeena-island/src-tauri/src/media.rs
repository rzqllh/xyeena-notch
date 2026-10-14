//! Windows System Media Transport Controls bridge.
//! GSMTC exposes playback sessions only; it does not report Teams meeting/call presence.
//! No microphone capture, process scanning, network activity, or privileged hooks.
use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSnapshot {
    pub available: bool,
    pub title: String,
    pub artist: String,
    pub source: String,
    pub playing: bool,
    pub position_ms: i64,
    pub duration_ms: i64,
    pub can_seek: bool,
}
impl MediaSnapshot {
    fn empty() -> Self {
        Self {
            available: false,
            title: String::new(),
            artist: String::new(),
            source: String::new(),
            playing: false,
            position_ms: 0,
            duration_ms: 0,
            can_seek: false,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaOverview {
    pub sessions: Vec<MediaSnapshot>,
    pub current_source: String,
}
fn bounded(value: String, max: usize) -> String {
    value.chars().take(max).collect()
}

#[cfg(target_os = "windows")]
fn manager(
) -> Result<windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager, String> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
    GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .and_then(|op| op.join())
        .map_err(|e| format!("Windows media service unavailable: {e}"))
}

#[cfg(target_os = "windows")]
fn playback_snapshot(
    session: &windows::Media::Control::GlobalSystemMediaTransportControlsSession,
) -> MediaSnapshot {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;
    let properties = session
        .TryGetMediaPropertiesAsync()
        .and_then(|op| op.join())
        .ok();
    let title = properties
        .as_ref()
        .and_then(|p| p.Title().ok())
        .map(|s| s.to_string())
        .unwrap_or_default();
    let artist = properties
        .as_ref()
        .and_then(|p| p.Artist().ok())
        .map(|s| s.to_string())
        .unwrap_or_default();
    let source = session
        .SourceAppUserModelId()
        .map(|s| s.to_string())
        .unwrap_or_default();
    let playing = session
        .GetPlaybackInfo()
        .ok()
        .and_then(|info| info.PlaybackStatus().ok())
        == Some(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing);
    let (position_ms, duration_ms, can_seek) = session
        .GetTimelineProperties()
        .ok()
        .map(|timeline| {
            let from = timeline.StartTime().map(|t| t.Duration).unwrap_or(0);
            let end = timeline.EndTime().map(|t| t.Duration).unwrap_or(0);
            let pos = timeline.Position().map(|t| t.Duration).unwrap_or(0);
            let total = ((end - from) / 10_000).clamp(0, 86_400_000);
            let current = ((pos - from) / 10_000).clamp(0, total);
            (current, total, total > 0)
        })
        .unwrap_or((0, 0, false));
    MediaSnapshot {
        available: true,
        title: bounded(title, 128),
        artist: bounded(artist, 96),
        source: bounded(source, 128),
        playing,
        position_ms,
        duration_ms,
        can_seek,
    }
}

fn get_media_sessions_sync() -> Result<MediaOverview, String> {
    #[cfg(target_os = "windows")]
    {
        let manager = manager()?;
        let current_source = manager
            .GetCurrentSession()
            .ok()
            .and_then(|s| s.SourceAppUserModelId().ok())
            .map(|s| bounded(s.to_string(), 128))
            .unwrap_or_default();
        let collection = manager
            .GetSessions()
            .map_err(|e| format!("Cannot list media sessions: {e}"))?;
        let total = collection
            .Size()
            .map_err(|e| format!("Cannot count media sessions: {e}"))?;
        let mut sessions = Vec::new();
        for index in 0..total.min(16) {
            if let Ok(item) = collection.GetAt(index) {
                sessions.push(playback_snapshot(&item));
            }
        }
        Ok(MediaOverview {
            sessions,
            current_source,
        })
    }
    #[cfg(not(target_os = "windows"))]
    Ok(MediaOverview {
        sessions: Vec::new(),
        current_source: String::new(),
    })
}

fn get_media_session_sync() -> Result<MediaSnapshot, String> {
    let overview = get_media_sessions_sync()?;
    Ok(overview
        .sessions
        .iter()
        .find(|s| s.source == overview.current_source)
        .or_else(|| overview.sessions.iter().find(|s| s.playing))
        .or_else(|| overview.sessions.first())
        .cloned()
        .unwrap_or_else(MediaSnapshot::empty))
}

fn media_transport_sync(action: String, source: Option<String>) -> Result<bool, String> {
    if !["previous", "toggle", "next"].contains(&action.as_str()) {
        return Err("Unsupported media transport action".into());
    }
    #[cfg(target_os = "windows")]
    {
        let manager = manager()?;
        let selected = match source.filter(|s| !s.is_empty() && s.len() <= 128) {
            None => manager.GetCurrentSession().ok(),
            Some(requested) => {
                let collection = manager.GetSessions().map_err(|e| e.to_string())?;
                let total = collection.Size().map_err(|e| e.to_string())?;
                (0..total.min(16))
                    .filter_map(|i| collection.GetAt(i).ok())
                    .find(|s| {
                        s.SourceAppUserModelId()
                            .ok()
                            .map(|id| id == requested)
                            .unwrap_or(false)
                    })
            }
        };
        let Some(session) = selected else {
            return Ok(false);
        };
        let request = match action.as_str() {
            "previous" => session.TrySkipPreviousAsync(),
            "next" => session.TrySkipNextAsync(),
            _ => session.TryTogglePlayPauseAsync(),
        }
        .map_err(|e| format!("Media control failed: {e}"))?;
        request
            .join()
            .map_err(|e| format!("Media command rejected: {e}"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = source;
        Ok(false)
    }
}

// Strictly bound user-supplied positions and session identifiers. Never seek arbitrary windows.
#[cfg(windows)]
fn selected_session(
    source: Option<String>,
) -> Result<Option<windows::Media::Control::GlobalSystemMediaTransportControlsSession>, String> {
    let manager = manager()?;
    let source = source.filter(|s| !s.is_empty() && s.len() <= 128);
    if let Some(requested) = source {
        let items = manager.GetSessions().map_err(|e| e.to_string())?;
        let size = items.Size().map_err(|e| e.to_string())?;
        Ok((0..size.min(16))
            .filter_map(|i| items.GetAt(i).ok())
            .find(|s| {
                s.SourceAppUserModelId()
                    .ok()
                    .map(|id| id == requested)
                    .unwrap_or(false)
            }))
    } else {
        Ok(manager.GetCurrentSession().ok())
    }
}
fn seek_sync(position_ms: i64, source: Option<String>) -> Result<bool, String> {
    if !(0..=86_400_000).contains(&position_ms) {
        return Err("Invalid seek position".into());
    }
    #[cfg(windows)]
    {
        let Some(session) = selected_session(source)? else {
            return Ok(false);
        };
        let timeline = session.GetTimelineProperties().map_err(|e| e.to_string())?;
        let from = timeline.StartTime().map_err(|e| e.to_string())?.Duration;
        let end = timeline.EndTime().map_err(|e| e.to_string())?.Duration;
        let target = from.saturating_add(position_ms.saturating_mul(10_000));
        if target < from || target > end {
            return Err("Seek position outside track".into());
        }
        session
            .TryChangePlaybackPositionAsync(target)
            .and_then(|op| op.join())
            .map_err(|e| format!("Player does not support seeking: {e}"))
    }
    #[cfg(not(windows))]
    {
        let _ = source;
        Ok(false)
    }
}
fn shuffle_sync(enabled: bool, source: Option<String>) -> Result<bool, String> {
    #[cfg(windows)]
    {
        let Some(session) = selected_session(source)? else {
            return Ok(false);
        };
        session
            .TryChangeShuffleActiveAsync(enabled)
            .and_then(|op| op.join())
            .map_err(|e| format!("Player does not support shuffle: {e}"))
    }
    #[cfg(not(windows))]
    {
        let _ = (enabled, source);
        Ok(false)
    }
}
fn repeat_sync(mode: String, source: Option<String>) -> Result<bool, String> {
    if !["off", "list", "track"].contains(&mode.as_str()) {
        return Err("Invalid repeat mode".into());
    }
    #[cfg(windows)]
    {
        use windows::Media::MediaPlaybackAutoRepeatMode;
        let Some(session) = selected_session(source)? else {
            return Ok(false);
        };
        let value = match mode.as_str() {
            "off" => MediaPlaybackAutoRepeatMode::None,
            "list" => MediaPlaybackAutoRepeatMode::List,
            _ => MediaPlaybackAutoRepeatMode::Track,
        };
        session
            .TryChangeAutoRepeatModeAsync(value)
            .and_then(|op| op.join())
            .map_err(|e| format!("Player does not support repeat: {e}"))
    }
    #[cfg(not(windows))]
    {
        let _ = source;
        Ok(false)
    }
}
#[tauri::command]
pub async fn media_seek(position_ms: i64, source: Option<String>) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || seek_sync(position_ms, source))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn media_shuffle(enabled: bool, source: Option<String>) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || shuffle_sync(enabled, source))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn media_repeat(mode: String, source: Option<String>) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || repeat_sync(mode, source))
        .await
        .map_err(|e| e.to_string())?
}

// WinRT .join() waits; use a blocking worker instead of blocking the Tauri UI thread.
#[tauri::command]
pub async fn get_media_sessions() -> Result<MediaOverview, String> {
    tauri::async_runtime::spawn_blocking(get_media_sessions_sync)
        .await
        .map_err(|e| format!("Media worker failed: {e}"))?
}

#[tauri::command]
pub async fn get_media_session() -> Result<MediaSnapshot, String> {
    tauri::async_runtime::spawn_blocking(get_media_session_sync)
        .await
        .map_err(|e| format!("Media worker failed: {e}"))?
}

#[tauri::command]
pub async fn media_transport(action: String, source: Option<String>) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || media_transport_sync(action, source))
        .await
        .map_err(|e| format!("Media worker failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::bounded;
    #[test]
    fn metadata_bounded() {
        assert_eq!(bounded("abcdef".into(), 3), "abc");
    }
}
