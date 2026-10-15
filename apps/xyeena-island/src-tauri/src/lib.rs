//! Xyeena Island MVP: transparent top-edge companion, tray, and opt-in read-only run summaries.
//! No cursor hooks, agent approval RPC, or autostart. AI requests use opt-in, bounded transport.
mod clipboard;
mod media;
mod volume;
use std::fs;
use std::path::Path;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewWindow};

// On-demand read-only cursor sampling. No hooks, stored coordinates, or desktop pet.
#[derive(serde::Serialize)]
struct IslandCursor {
    x: f64,
    y: f64,
}

#[tauri::command]
fn read_island_cursor(window: WebviewWindow) -> Result<Option<IslandCursor>, String> {
    if window.label() != "main" {
        return Err("Cursor access is limited to the main Island".into());
    }
    if !window.is_visible().map_err(|e| e.to_string())? {
        return Ok(None);
    }
    #[cfg(target_os = "windows")]
    {
        let mut cursor = windows::Win32::Foundation::POINT::default();
        unsafe { windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut cursor) }
            .map_err(|e| format!("Cannot read cursor position: {e}"))?;
        let position = window.inner_position().map_err(|e| e.to_string())?;
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        if !scale.is_finite() || scale <= 0.0 {
            return Err("Invalid monitor scale".into());
        }
        Ok(Some(IslandCursor {
            x: (f64::from(cursor.x) - f64::from(position.x)) / scale,
            y: (f64::from(cursor.y) - f64::from(position.y)) / scale,
        }))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Mode {
    Hidden,
    Compact,
    Glance,
    Expanded,
}
impl Mode {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "hidden" | "dormant" => Ok(Self::Hidden),
            "compact" => Ok(Self::Compact),
            "glance" => Ok(Self::Glance),
            "expanded" | "focused" | "pinned" => Ok(Self::Expanded),
            _ => Err("Invalid island mode".into()),
        }
    }
    fn dimensions(self) -> (f64, f64) {
        match self {
            Self::Hidden => (184.0, 8.0),
            Self::Compact => (400.0, 92.0),
            Self::Glance => (480.0, 144.0),
            Self::Expanded => (620.0, 396.0),
        }
    }
}

fn apply_frame(window: &WebviewWindow, width: f64, height: f64) -> Result<(), String> {
    // Public renderer can only request a small island-sized window.
    if !width.is_finite()
        || !height.is_finite()
        || !(184.0..=640.0).contains(&width)
        || !(7.0..=420.0).contains(&height)
    {
        return Err("Window size outside island bounds".into());
    }
    let monitor = window
        .current_monitor()
        .map_err(|e| format!("Cannot find current monitor: {e}"))?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "No monitor available".to_string())?;
    let scale = monitor.scale_factor();
    if !scale.is_finite() || scale <= 0.0 {
        return Err("Invalid DPI scale".into());
    }
    let physical_width = (width * scale).round() as i64;
    let left = monitor.position().x as i64 + (monitor.size().width as i64 - physical_width) / 2;
    let left = i32::try_from(left).map_err(|_| "Monitor coordinates out of range".to_string())?;
    // Bound the native hitbox to visible island content (no giant pointer-eating overlay).
    window
        .set_size(Size::Logical(LogicalSize::new(width, height)))
        .map_err(|e| format!("Island resize failed: {e}"))?;
    window
        .set_position(Position::Physical(PhysicalPosition::new(
            left,
            monitor.position().y,
        )))
        .map_err(|e| format!("Island placement failed: {e}"))?;
    Ok(())
}
fn set_mode(window: &WebviewWindow, mode: Mode) -> Result<(), String> {
    let (w, h) = mode.dimensions();
    apply_frame(window, w, h)
}

#[tauri::command]
fn set_island_mode(window: WebviewWindow, mode: String) -> Result<(), String> {
    set_mode(&window, Mode::parse(&mode)?)
}

#[tauri::command]
fn set_island_frame(window: WebviewWindow, width: f64, height: f64) -> Result<(), String> {
    apply_frame(&window, width, height)
}

#[tauri::command]
fn set_window_priority(window: WebviewWindow, enabled: bool) -> Result<(), String> {
    window
        .set_always_on_top(enabled)
        .map_err(|e| format!("Always-on-top setting failed: {e}"))
}

#[tauri::command]
fn hide_island_window(window: WebviewWindow) -> Result<(), String> {
    let _ = window.emit("island:visibility", "hidden");
    window
        .hide()
        .map_err(|e| format!("Hide window failed: {e}"))
}

#[tauri::command]
fn recenter_island(window: WebviewWindow, mode: String) -> Result<(), String> {
    set_mode(&window, Mode::parse(&mode)?)
}

#[tauri::command]
fn read_native_clipboard() -> Result<Option<clipboard::NativeClipboardItem>, String> {
    clipboard::read_native_clipboard_item()
}

#[tauri::command]
fn write_native_image(data_url: String) -> Result<(), String> {
    clipboard::write_native_image_to_clipboard(&data_url)
}

#[tauri::command]
fn save_file_to_downloads(
    filename: String,
    content: String,
    is_base64: bool,
) -> Result<String, String> {
    let base_dir = std::env::var_os("USERPROFILE")
        .map(|p| std::path::PathBuf::from(p).join("Downloads"))
        .filter(|p| p.exists())
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let path = base_dir.join(&filename);
    if is_base64 {
        let b64 = if let Some(idx) = content.find(',') {
            &content[idx + 1..]
        } else {
            &content
        };
        let bytes = clipboard::base64_decode(b64).ok_or("Invalid base64 payload")?;
        std::fs::write(&path, bytes).map_err(|e| format!("Cannot save file: {e}"))?;
    } else {
        std::fs::write(&path, content.as_bytes()).map_err(|e| format!("Cannot save file: {e}"))?;
    }
    Ok(path.to_string_lossy().to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DroppedFilePayload {
    name: String,
    size_bytes: u64,
    data_url: Option<String>,
    text_preview: Option<String>,
    category: String,
    extension: String,
}

#[tauri::command]
fn read_dropped_file(path: String) -> Result<DroppedFilePayload, String> {
    let p = Path::new(&path);
    if !p.is_absolute() || !p.exists() {
        return Err("File path does not exist".into());
    }
    let metadata = fs::symlink_metadata(p).map_err(|e| format!("Cannot inspect file: {e}"))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("Only regular files can be dropped".into());
    }
    let size_bytes = metadata.len();
    if size_bytes > 50 * 1024 * 1024 {
        return Err("File exceeds 50 MB limit".into());
    }
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    let extension = p
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let is_img = ["png", "jpg", "jpeg", "webp", "bmp", "gif"].contains(&extension.as_str());
    let is_text = [
        "txt", "md", "json", "js", "ts", "rs", "html", "css", "toml", "yaml", "yml",
    ]
    .contains(&extension.as_str());

    let (data_url, text_preview) = if is_img {
        let bytes = fs::read(p).map_err(|e| format!("Cannot read image: {e}"))?;
        let mime = match extension.as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            "bmp" => "image/bmp",
            "gif" => "image/gif",
            _ => "application/octet-stream",
        };
        let b64 = clipboard::simple_base64_encode(&bytes);
        (Some(format!("data:{mime};base64,{b64}")), None)
    } else if is_text && size_bytes <= 100_000 {
        let text = fs::read_to_string(p).ok();
        (None, text.map(|t| t.chars().take(500).collect()))
    } else {
        (None, None)
    };

    let category = if is_img {
        "image"
    } else if is_text {
        "code"
    } else {
        "document"
    };

    Ok(DroppedFilePayload {
        name,
        size_bytes,
        data_url,
        text_preview,
        category: category.into(),
        extension,
    })
}

#[derive(Default)]
struct AiProcessState {
    active: std::collections::HashMap<String, u32>,
    cancelled: std::collections::HashSet<String>,
}

#[derive(Clone, Default)]
pub struct AiProcessRegistry(std::sync::Arc<std::sync::Mutex<AiProcessState>>);

impl AiProcessRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_cancelled(&self, request_id: &str) -> bool {
        self.0
            .lock()
            .map(|state| state.cancelled.contains(request_id))
            .unwrap_or(true)
    }

    // Register/cancel are atomic with respect to each other. Never check the
    // cancellation set and insert into the active map under separate locks.
    pub fn register_or_kill(&self, request_id: &str, pid: u32) -> bool {
        let registered = match self.0.lock() {
            Ok(mut state) => {
                if state.cancelled.remove(request_id) {
                    false
                } else {
                    state.active.insert(request_id.to_string(), pid);
                    true
                }
            }
            Err(_) => false,
        };
        if !registered {
            Self::kill_pid(pid);
        }
        registered
    }

    pub fn unregister(&self, request_id: &str) {
        if let Ok(mut state) = self.0.lock() {
            state.active.remove(request_id);
            state.cancelled.remove(request_id);
        }
    }

    pub fn cancel(&self, request_id: &str) -> bool {
        let pid = match self.0.lock() {
            Ok(mut state) => {
                // An early cancel must remain pending until register_or_kill.
                if state.cancelled.len() >= 512 && !state.cancelled.contains(request_id) {
                    return false;
                }
                state.cancelled.insert(request_id.to_string());
                state.active.remove(request_id)
            }
            Err(_) => return false,
        };
        if let Some(pid) = pid {
            Self::kill_pid(pid);
        }
        true
    }

    fn kill_pid(pid: u32) {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }
        #[cfg(not(windows))]
        {
            let _ = std::process::Command::new("kill")
                .args(["-9", &pid.to_string()])
                .output();
        }
    }
}

pub fn escape_curl_config_str(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 16);
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            other => out.push(other),
        }
    }
    out
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeAiPayload {
    request_id: Option<String>,
    url: String,
    method: String,
    headers: std::collections::HashMap<String, String>,
    body: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeAiResponse {
    status: u16,
    body: String,
    ok: bool,
}

// Validate the actual URL authority, not a string prefix. In particular,
// http://localhost:11434@untrusted.example is NOT a localhost request.
fn is_authorized_ai_destination(value: &str) -> bool {
    if value.len() > 2048 || value.bytes().any(|b| b <= 0x20 || b == 0x7f) || value.contains('\\') {
        return false;
    }
    let Some((scheme, rest)) = value.split_once("://") else {
        return false;
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.is_empty()
        || authority.contains('@')
        || authority.contains('%')
        || authority.contains('[')
        || authority.contains(']')
    {
        return false;
    }

    match scheme {
        "https" => matches!(
            authority,
            "api.openai.com"
                | "api.anthropic.com"
                | "generativelanguage.googleapis.com"
                | "openrouter.ai"
        ),
        "http" => {
            let Some((host, port)) = authority.rsplit_once(':') else {
                return false;
            };
            (host == "localhost" || host == "127.0.0.1")
                && !port.is_empty()
                && port.bytes().all(|b| b.is_ascii_digit())
                && port.parse::<u16>().is_ok_and(|p| p > 0)
        }
        _ => false,
    }
}

fn validate_ai_payload(payload: &NativeAiPayload) -> Result<(), String> {
    if !is_authorized_ai_destination(&payload.url) {
        return Err("Destination host not in authorized AI provider registry".into());
    }
    if payload.method != "POST" {
        return Err("Only POST requests are supported by AI transport".into());
    }
    if payload
        .body
        .as_ref()
        .is_some_and(|body| body.len() > 1_048_576)
    {
        return Err("AI request exceeds permitted size".into());
    }
    if payload.headers.len() > 12 {
        return Err("Too many AI request headers".into());
    }
    if payload.request_id.as_ref().is_some_and(|id| {
        id.is_empty()
            || id.len() > 128
            || !id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    }) {
        return Err("Invalid AI request ID".into());
    }
    for (name, value) in &payload.headers {
        let allowed = matches!(
            name.to_ascii_lowercase().as_str(),
            "content-type"
                | "authorization"
                | "x-api-key"
                | "anthropic-version"
                | "http-referer"
                | "x-title"
                | "accept"
        );
        if !allowed || value.len() > 8192 || value.chars().any(char::is_control) {
            return Err("Invalid AI request headers".into());
        }
    }
    Ok(())
}

fn execute_native_ai_request(
    payload: NativeAiPayload,
    registry: AiProcessRegistry,
) -> Result<NativeAiResponse, String> {
    validate_ai_payload(&payload)?;

    let req_id = payload.request_id.clone().unwrap_or_default();
    if !req_id.is_empty() && registry.is_cancelled(&req_id) {
        registry.unregister(&req_id);
        return Err("Request was cancelled before process creation".into());
    }

    // Pass all headers, url, method, and prompt body via stdin config.
    // Zero credentials or prompt contents are exposed in OS process command-line arguments.
    let mut config = String::new();
    config.push_str(&format!(
        "url = \"{}\"\n",
        escape_curl_config_str(&payload.url)
    ));
    config.push_str(&format!(
        "request = \"{}\"\n",
        escape_curl_config_str(&payload.method)
    ));
    config.push_str("max-time = 60\n");
    config.push_str("max-filesize = 2097152\n");
    for (k, v) in &payload.headers {
        config.push_str(&format!(
            "header = \"{}: {}\"\n",
            escape_curl_config_str(k),
            escape_curl_config_str(v)
        ));
    }
    if let Some(body) = &payload.body {
        config.push_str(&format!("data = \"{}\"\n", escape_curl_config_str(body)));
    }

    let mut cmd = std::process::Command::new("curl.exe");
    cmd.args(["-s", "-i", "--config", "-"]);
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to execute native transport: {e}"))?;

    let pid = child.id();
    if !req_id.is_empty() && !registry.register_or_kill(&req_id, pid) {
        return Err("Request was cancelled during startup".into());
    }

    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        let _ = stdin.write_all(config.as_bytes());
        let _ = stdin.flush();
        drop(stdin);
    }

    let output = child.wait_with_output();
    if !req_id.is_empty() {
        registry.unregister(&req_id);
    }

    let output =
        output.map_err(|e| format!("Native transport process failed or was terminated: {e}"))?;
    let raw = String::from_utf8_lossy(&output.stdout);

    let mut lines = raw.lines();
    let status = lines
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .unwrap_or(if output.status.success() { 200 } else { 500 });

    let body = if let Some(idx) = raw.find("\r\n\r\n") {
        raw[idx + 4..].to_string()
    } else if let Some(idx) = raw.find("\n\n") {
        raw[idx + 2..].to_string()
    } else {
        raw.to_string()
    };

    Ok(NativeAiResponse {
        status,
        ok: (200..300).contains(&status),
        body,
    })
}

#[tauri::command]
async fn native_ai_request(
    payload: NativeAiPayload,
    registry: tauri::State<'_, AiProcessRegistry>,
) -> Result<NativeAiResponse, String> {
    let reg = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || execute_native_ai_request(payload, reg))
        .await
        .map_err(|e| format!("Task execution error: {e}"))?
}

#[tauri::command]
fn cancel_native_ai_request(
    request_id: String,
    registry: tauri::State<'_, AiProcessRegistry>,
) -> Result<bool, String> {
    Ok(registry.cancel(&request_id))
}

#[derive(serde::Serialize)]
struct RunSummary {
    run_id: String,
    goal: String,
    state: String,
    created_at: String,
    finished_at: Option<String>,
}

fn bounded_text(value: Option<&serde_json::Value>, max_chars: usize) -> String {
    value
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .chars()
        .take(max_chars)
        .collect()
}

fn safe_subdir(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => Ok(metadata.is_dir() && !metadata.file_type().is_symlink()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(err) => Err(format!("Cannot inspect project: {err}")),
    }
}

// Invoked only when the user explicitly enters a project folder and clicks Connect/Refresh.
// Read ONLY snapshot summaries (not journals, claims, artifacts, files or credentials).
#[tauri::command]
fn read_xyeena_runs(project_root: String) -> Result<Vec<RunSummary>, String> {
    if project_root.trim().is_empty() || project_root.len() > 2048 {
        return Err("Enter a project folder first".into());
    }
    // Local-only MVP: never probe UNC network shares through a supplied path.
    if project_root.trim().starts_with("\\\\") || project_root.trim().starts_with("//") {
        return Err("Network share paths are not supported".into());
    }
    let root = Path::new(project_root.trim());
    if !root.is_absolute() || !safe_subdir(root)? {
        return Err("Choose an existing absolute project directory".into());
    }
    let config_dir = root.join(".xyeena");
    let runs_dir = config_dir.join("runs");
    if !safe_subdir(&config_dir)? || !safe_subdir(&runs_dir)? {
        return Ok(Vec::new());
    }
    let mut entries = fs::read_dir(&runs_dir)
        .map_err(|e| format!("Cannot read Xyeena run directory: {e}"))?
        .filter_map(Result::ok)
        .take(4096)
        .filter_map(|entry| {
            let metadata = fs::symlink_metadata(entry.path()).ok()?;
            if !metadata.is_dir() || metadata.file_type().is_symlink() {
                return None;
            }
            let modified = metadata.modified().ok()?;
            Some((modified, entry.path()))
        })
        .collect::<Vec<_>>();
    // Limit work and exposure. Do not enumerate entire run journals.
    entries.sort_unstable_by_key(|a| std::cmp::Reverse(a.0));
    let mut result = Vec::new();
    for (_, run_path) in entries.into_iter().take(12) {
        let snapshot = run_path.join("snapshot.json");
        let Ok(metadata) = fs::symlink_metadata(&snapshot) else {
            continue;
        };
        if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 131_072 {
            continue;
        }
        let Ok(contents) = fs::read_to_string(&snapshot) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&contents) else {
            continue;
        };
        let run_id = bounded_text(value.get("run_id"), 96);
        if run_id.is_empty() {
            continue;
        }
        let finished_at_raw = bounded_text(
            value
                .get("finished_at")
                .or_else(|| value.get("completed_at")),
            48,
        );
        let finished_at = if finished_at_raw.is_empty() {
            None
        } else {
            Some(finished_at_raw)
        };
        result.push(RunSummary {
            run_id,
            goal: bounded_text(value.get("goal"), 160),
            state: bounded_text(value.get("workflow_state"), 24),
            created_at: bounded_text(value.get("created_at"), 48),
            finished_at,
        });
        if result.len() >= 8 {
            break;
        }
    }
    Ok(result)
}

fn show_island(app: &tauri::AppHandle, requested: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = set_mode(&window, Mode::Compact);
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("island:visibility", "shown");
        let _ = window.emit("island:tray", requested);
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AiProcessRegistry::default())
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .ok_or_else(|| std::io::Error::other("Main Island window missing"))?;
            window.set_skip_taskbar(true)?;
            window.set_always_on_top(true)?;
            set_mode(&window, Mode::Compact).map_err(std::io::Error::other)?;

            let show = MenuItem::with_id(app, "show", "Open Island", true, None::<&str>)?;
            let compact = MenuItem::with_id(app, "compact", "Compact Island", true, None::<&str>)?;
            let hide =
                MenuItem::with_id(app, "hide", "Hide window (keep tray)", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Xyeena Island", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &compact, &hide, &quit])?;
            TrayIconBuilder::new()
                .icon(tauri::include_image!("./icons/tray.png"))
                .tooltip("Xyeena Island")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show_island(app, "expand"),
                    "compact" => show_island(app, "compact"),
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("island:visibility", "hidden");
                            let _ = window.hide();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_island(tray.app_handle(), "expand");
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if window.label() == "main" {
                    let _ = window.emit("island:visibility", "hidden");
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            set_island_mode,
            set_island_frame,
            set_window_priority,
            hide_island_window,
            recenter_island,
            read_xyeena_runs,
            media::get_media_session,
            media::get_media_sessions,
            media::media_transport,
            media::media_seek,
            media::media_shuffle,
            media::media_repeat,
            volume::get_master_volume,
            volume::set_master_volume,
            volume::set_master_mute,
            read_island_cursor,
            read_native_clipboard,
            write_native_image,
            save_file_to_downloads,
            read_dropped_file,
            native_ai_request,
            cancel_native_ai_request,
        ])
        .run(tauri::generate_context!())
        .expect("Xyeena Island failed to start");
}

#[cfg(test)]
mod tests {
    use super::{bounded_text, Mode};
    #[test]
    fn geometry_is_bounded() {
        for mode in [Mode::Hidden, Mode::Compact, Mode::Glance, Mode::Expanded] {
            let (w, h) = mode.dimensions();
            assert!((184.0..=640.0).contains(&w) && (7.0..=420.0).contains(&h));
        }
    }
    #[test]
    fn arbitrary_modes_fail_closed() {
        assert!(Mode::parse("pinned").is_ok());
        assert!(Mode::parse("shell").is_err());
    }
    #[test]
    fn summary_fields_are_truncated() {
        let value = serde_json::json!("123456789");
        assert_eq!(bounded_text(Some(&value), 4), "1234");
    }
    #[test]
    fn curl_config_escaping_protects_delimiters() {
        use super::escape_curl_config_str;
        let raw = "hello \"world\"\nline 2\\backslash";
        let escaped = escape_curl_config_str(raw);
        assert_eq!(escaped, "hello \\\"world\\\"\\nline 2\\\\backslash");
    }
    #[test]
    fn ai_registry_early_cancellation_race_fails_registration() {
        use super::AiProcessRegistry;
        let registry = AiProcessRegistry::new();
        // Cancel before register
        assert!(registry.cancel("req-race-1"));
        assert!(registry.is_cancelled("req-race-1"));
        // Registration with non-existent dummy PID should detect pre-cancel and return false
        let registered = registry.register_or_kill("req-race-1", 999999);
        assert!(!registered, "Pre-cancelled request must not register");
    }
    #[test]
    fn ai_transport_rejects_authority_spoofing_and_invalid_ports() {
        use super::is_authorized_ai_destination as allowed;
        assert!(allowed("http://127.0.0.1:11434/api/chat"));
        assert!(allowed("http://localhost:1234/v1/chat/completions"));
        assert!(allowed("https://api.openai.com/v1/chat/completions"));
        assert!(allowed("https://api.anthropic.com/v1/messages"));
        assert!(allowed(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini"
        ));
        assert!(allowed("https://openrouter.ai/api/v1/chat/completions"));
        for rejected in [
            "http://localhost:11434@evil.example/chat",
            "http://127.0.0.1:80@evil.example/",
            "http://127.0.0.1:0/chat",
            "http://localhost:65536/chat",
            "http://localhost:abc/chat",
            "http://127.0.0.1:11434\\@evil.example/",
            "http://localhost:11434%40evil.example/",
            "https://api.openai.com.evil.example/v1/chat",
            "http://api.openai.com/v1/chat",
            "https://api.openai.com@evil.example/v1/chat",
            "file:///etc/passwd",
            "https://evil.example/v1/chat",
            "http://localhost:11434/\r\nheader = \"Injected\"",
        ] {
            assert!(!allowed(rejected), "must reject: {rejected}");
        }
    }

    #[test]
    fn ai_transport_rejects_untrusted_methods_headers_and_oversize_payloads() {
        use super::{validate_ai_payload, NativeAiPayload};
        let mut payload = NativeAiPayload {
            request_id: Some("req-ok-1".into()),
            url: "https://api.openai.com/v1/chat/completions".into(),
            method: "POST".into(),
            headers: std::collections::HashMap::from([(
                "Authorization".into(),
                "Bearer secret".into(),
            )]),
            body: Some("{}".into()),
        };
        assert!(validate_ai_payload(&payload).is_ok());
        payload.method = "GET".into();
        assert!(validate_ai_payload(&payload).is_err());
        payload.method = "POST".into();
        payload.headers.insert(
            "Authorization".into(),
            "Bearer secret\r\nInjected: value".into(),
        );
        assert!(validate_ai_payload(&payload).is_err());
        payload.headers.clear();
        payload.body = Some("x".repeat(1_048_577));
        assert!(validate_ai_payload(&payload).is_err());
    }
    #[test]
    fn ai_registry_normal_lifecycle() {
        use super::AiProcessRegistry;
        let registry = AiProcessRegistry::new();
        assert!(!registry.is_cancelled("req-normal"));
        let registered = registry.register_or_kill("req-normal", 999998);
        assert!(registered);
        registry.unregister("req-normal");
        assert!(!registry.is_cancelled("req-normal"));
    }
}
