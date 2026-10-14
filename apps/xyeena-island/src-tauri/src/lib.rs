//! Xyeena Island MVP: transparent top-edge companion, tray, and opt-in read-only run summaries.
//! No hooks, agent approvals, autostart, sockets, or network endpoints.
mod guardian_desktop;
mod media;
mod volume;
use std::fs;
use std::path::Path;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewWindow};

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
    window
        .hide()
        .map_err(|e| format!("Hide window failed: {e}"))
}

#[tauri::command]
fn recenter_island(window: WebviewWindow, mode: String) -> Result<(), String> {
    set_mode(&window, Mode::parse(&mode)?)
}

#[derive(serde::Serialize)]
struct RunSummary {
    run_id: String,
    goal: String,
    state: String,
    created_at: String,
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
        result.push(RunSummary {
            run_id,
            goal: bounded_text(value.get("goal"), 160),
            state: bounded_text(value.get("workflow_state"), 24),
            created_at: bounded_text(value.get("created_at"), 48),
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
        let _ = window.emit("island:tray", requested);
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(guardian_desktop::DesktopGuardian::default())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            guardian_desktop::init(app.handle());
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
                if window.label() == "guardian" {
                    let _ = guardian_desktop::guardian_return(window.app_handle().clone());
                } else {
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
            guardian_desktop::guardian_status,
            guardian_desktop::guardian_detach,
            guardian_desktop::guardian_return,
            guardian_desktop::guardian_set_mode,
            guardian_desktop::guardian_set_menu,
            guardian_desktop::guardian_set_dragging,
            guardian_desktop::guardian_set_sleeping,
            guardian_desktop::guardian_update_context,
            guardian_desktop::guardian_save_position,
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
}
