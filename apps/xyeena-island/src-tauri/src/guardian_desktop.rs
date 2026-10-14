//! Original Xyeena detached Guardian. One Tauri process, one hidden secondary window.
//! Windows cursor positions remain ephemeral. No pointer history, clicks or screenshots.
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Position};

const LABEL: &str = "guardian";
const SIDE: i32 = 180;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "lowercase")]
enum Mode {
    #[default]
    Perch,
    Follow,
}
impl Mode {
    fn parse(s: &str) -> Result<Self, String> {
        match s {
            "perch" => Ok(Self::Perch),
            "follow" => Ok(Self::Follow),
            _ => Err("Unknown Guardian mode".into()),
        }
    }
}

#[derive(Default)]
struct Live {
    detached: bool,
    mode: Mode,
    sleeping: bool,
    menu: bool,
    dragging: bool,
    context: String,
    spot: Option<(i32, i32)>,
    ignored: Option<bool>,
    gaze: Option<(i32, i32)>,
}
pub(crate) struct DesktopGuardian(Mutex<Live>);
impl Default for DesktopGuardian {
    fn default() -> Self {
        Self(Mutex::new(Live::default()))
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Snapshot {
    detached: bool,
    mode: Mode,
    context: String,
}
#[derive(Clone, serde::Serialize)]
struct Cursor {
    x: f64,
    y: f64,
    near: bool,
}
#[derive(serde::Serialize, serde::Deserialize)]
struct Preference {
    schema_version: u8,
    mode: Mode,
    x: i32,
    y: i32,
}
fn state(app: &AppHandle) -> tauri::State<'_, DesktopGuardian> {
    app.state::<DesktopGuardian>()
}
fn snapshot(live: &Live) -> Snapshot {
    Snapshot {
        detached: live.detached,
        mode: live.mode,
        context: live.context.clone(),
    }
}
fn broadcast(app: &AppHandle) {
    let snap = {
        let guard = state(app);
        let live = guard
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        snapshot(&live)
    };
    let _ = app.emit_to("main", "guardian:presence", snap.clone());
    let _ = app.emit_to(LABEL, "guardian:presence", snap);
}
fn config_file(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("guardian-desktop.json"))
        .map_err(|err| err.to_string())
}
fn load_config(app: &AppHandle) -> Option<Preference> {
    let path = config_file(app).ok()?;
    if std::fs::metadata(&path).ok()?.len() > 1024 {
        return None;
    }
    let value: Preference = serde_json::from_slice(&std::fs::read(path).ok()?).ok()?;
    (value.schema_version == 1).then_some(value)
}
fn persist(app: &AppHandle) -> Result<(), String> {
    let (mode, spot) = {
        let guard = state(app);
        let live = guard
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        (live.mode, live.spot)
    };
    let Some((x, y)) = spot else {
        return Ok(());
    };
    let path = config_file(app)?;
    let parent = path.parent().ok_or("Invalid configuration path")?;
    std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    let data = serde_json::to_vec(&Preference {
        schema_version: 1,
        mode,
        x,
        y,
    })
    .map_err(|err| err.to_string())?;
    // Written only after a deliberate move/mode change, never on pointer sampling.
    std::fs::write(path, data).map_err(|err| err.to_string())
}
fn bounds(app: &AppHandle, x: i32, y: i32, side: i32) -> (i32, i32) {
    let Ok(monitors) = app.available_monitors() else {
        return (x, y);
    };
    if monitors.is_empty() {
        return (x, y);
    }
    let chosen = monitors
        .iter()
        .find(|m| {
            let p = m.position();
            x >= p.x
                && y >= p.y
                && (x as i64) < p.x as i64 + m.size().width as i64
                && (y as i64) < p.y as i64 + m.size().height as i64
        })
        .unwrap_or(&monitors[0]);
    let p = chosen.position();
    let max_x = (p.x as i64 + chosen.size().width as i64 - side as i64 - 8)
        .clamp(i32::MIN as i64, i32::MAX as i64) as i32;
    let max_y = (p.y as i64 + chosen.size().height as i64 - side as i64 - 8)
        .clamp(i32::MIN as i64, i32::MAX as i64) as i32;
    (
        x.clamp(p.x + 8, max_x.max(p.x + 8)),
        y.clamp(p.y + 8, max_y.max(p.y + 8)),
    )
}

#[tauri::command]
pub(crate) fn guardian_status(app: AppHandle) -> Snapshot {
    let guard = state(&app);
    let live = guard
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    snapshot(&live)
}

#[tauri::command]
pub(crate) fn guardian_detach(app: AppHandle, mode: String) -> Result<Snapshot, String> {
    let desired = Mode::parse(&mode)?;
    let win = app
        .get_webview_window(LABEL)
        .ok_or("Guardian window unavailable")?;
    let location = {
        let guard = state(&app);
        let live = guard
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        live.spot
    };
    let fallback = app
        .get_webview_window("main")
        .and_then(|win| win.inner_position().ok())
        .map(|p| (p.x + 360, p.y + 110))
        .unwrap_or((300, 150));
    let requested = location.unwrap_or(fallback);
    let (x, y) = bounds(&app, requested.0, requested.1, SIDE);
    win.set_position(Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|err| err.to_string())?;
    win.set_skip_taskbar(true).map_err(|err| err.to_string())?;
    prevent_activation(&win);
    win.set_always_on_top(true).map_err(|err| err.to_string())?;
    win.set_ignore_cursor_events(desired == Mode::Follow)
        .map_err(|err| err.to_string())?;
    win.show().map_err(|err| err.to_string())?;
    {
        let guard = state(&app);
        let mut live = guard
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        live.detached = true;
        live.mode = desired;
        live.sleeping = false;
        live.dragging = false;
        live.menu = false;
        live.ignored = Some(desired == Mode::Follow);
        if live.spot.is_none() {
            live.spot = Some((x, y));
        }
    }
    broadcast(&app);
    persist(&app)?;
    Ok(guardian_status(app))
}

#[tauri::command]
pub(crate) fn guardian_return(app: AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window(LABEL)
        .ok_or("Guardian window unavailable")?;
    let (was_following, location) = {
        let guard = state(&app);
        let live = guard
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        (live.mode == Mode::Follow, win.inner_position().ok())
    };
    if !was_following {
        if let Some(pos) = location {
            let (x, y) = bounds(&app, pos.x, pos.y, SIDE);
            let guard = state(&app);
            guard
                .0
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .spot = Some((x, y));
        }
    }
    let _ = win.hide();
    {
        let guard = state(&app);
        let mut live = guard
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        live.detached = false;
        live.sleeping = false;
        live.dragging = false;
        live.menu = false;
        live.gaze = None;
    }
    broadcast(&app);
    let _ = persist(&app);
    Ok(())
}

#[tauri::command]
pub(crate) fn guardian_set_mode(app: AppHandle, mode: String) -> Result<Snapshot, String> {
    let next = Mode::parse(&mode)?;
    let win = app
        .get_webview_window(LABEL)
        .ok_or("Guardian window unavailable")?;
    win.set_ignore_cursor_events(next == Mode::Follow)
        .map_err(|err| err.to_string())?;
    {
        let guard = state(&app);
        let mut live = guard
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        live.mode = next;
        live.ignored = Some(next == Mode::Follow);
    }
    broadcast(&app);
    persist(&app)?;
    Ok(guardian_status(app))
}

#[tauri::command]
pub(crate) fn guardian_set_menu(app: AppHandle, open: bool) -> Result<(), String> {
    let guard = state(&app);
    let mut live = guard
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    live.menu = open;
    if open {
        live.ignored = Some(false);
        if let Some(win) = app.get_webview_window(LABEL) {
            let _ = win.set_ignore_cursor_events(false);
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn guardian_set_dragging(app: AppHandle, dragging: bool) -> Result<(), String> {
    let guard = state(&app);
    let mut live = guard
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    live.dragging = dragging;
    if dragging {
        live.ignored = Some(false);
        if let Some(win) = app.get_webview_window(LABEL) {
            let _ = win.set_ignore_cursor_events(false);
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn guardian_set_sleeping(app: AppHandle, sleeping: bool) -> Result<(), String> {
    let guard = state(&app);
    let mut live = guard
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    live.sleeping = sleeping;
    if sleeping {
        live.gaze = None;
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn guardian_update_context(app: AppHandle, context: String) -> Result<(), String> {
    if ![
        "idle",
        "playing",
        "listening",
        "meeting",
        "working",
        "thinking",
        "attention",
        "finished",
        "error",
        "sleeping",
    ]
    .contains(&context.as_str())
    {
        return Err("Unknown Guardian context".into());
    }
    let changed = {
        let guard = state(&app);
        let mut live = guard
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if live.context == context {
            false
        } else {
            live.context = context.clone();
            true
        }
    };
    if changed {
        let _ = app.emit_to(LABEL, "guardian:context", context);
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn guardian_save_position(app: AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window(LABEL)
        .ok_or("Guardian window unavailable")?;
    let can_save = {
        let guard = state(&app);
        let live = guard
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        live.detached && live.mode == Mode::Perch && !live.dragging
    };
    if can_save {
        let position = win.inner_position().map_err(|err| err.to_string())?;
        let (x, y) = bounds(&app, position.x, position.y, SIDE);
        let guard = state(&app);
        guard
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .spot = Some((x, y));
        persist(&app)?;
    }
    Ok(())
}

#[cfg(windows)]
fn cursor_physical() -> Option<(i32, i32)> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut p = POINT::default();
    unsafe { GetCursorPos(&mut p).ok()? };
    Some((p.x, p.y))
}

#[cfg(windows)]
fn left_button_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    unsafe { GetAsyncKeyState(0x01) < 0 }
}

#[cfg(not(windows))]
fn left_button_down() -> bool {
    false
}

#[cfg(not(windows))]
fn cursor_physical() -> Option<(i32, i32)> {
    None
}

#[cfg(windows)]
fn prevent_activation(win: &tauri::WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    };
    let Ok(raw) = win.hwnd() else {
        return;
    };
    let handle = HWND(raw.0 as *mut _);
    unsafe {
        let old = GetWindowLongPtrW(handle, GWL_EXSTYLE);
        SetWindowLongPtrW(
            handle,
            GWL_EXSTYLE,
            old | WS_EX_NOACTIVATE.0 as isize | WS_EX_TOOLWINDOW.0 as isize,
        );
    }
}

#[cfg(not(windows))]
fn prevent_activation(_win: &tauri::WebviewWindow) {}

fn tick(app: &AppHandle) -> Duration {
    let (detached, mode, sleeping, menu, dragging, previous_ignored, previous_gaze) = {
        let guard = state(app);
        let live = guard
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        (
            live.detached,
            live.mode,
            live.sleeping,
            live.menu,
            live.dragging,
            live.ignored,
            live.gaze,
        )
    };
    if !detached {
        return Duration::from_millis(250);
    }
    let Some(win) = app.get_webview_window(LABEL) else {
        return Duration::from_millis(250);
    };
    if dragging && !left_button_down() {
        {
            let guard = state(app);
            guard
                .0
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .dragging = false;
        }
        if mode == Mode::Perch {
            if let Ok(p) = win.inner_position() {
                let guard = state(app);
                guard
                    .0
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .spot = Some((p.x, p.y));
            }
            let _ = persist(app);
        }
    }
    let Some((cx, cy)) = cursor_physical() else {
        return Duration::from_millis(120);
    };
    if mode == Mode::Follow && !sleeping {
        let Ok(monitors) = app.available_monitors() else {
            return Duration::from_millis(50);
        };
        if let Some(m) = monitors.iter().find(|m| {
            let p = m.position();
            (cx as i64) >= p.x as i64
                && (cy as i64) >= p.y as i64
                && (cx as i64) < p.x as i64 + m.size().width as i64
                && (cy as i64) < p.y as i64 + m.size().height as i64
        }) {
            let p = m.position();
            let side = win.outer_size().map(|s| s.width as i32).unwrap_or(SIDE);
            let right = cx as i64 + side as i64 + 72;
            let bottom = cy as i64 + side as i64 + 32;
            let dx = if right < p.x as i64 + m.size().width as i64 {
                cx.saturating_add(72)
            } else {
                cx.saturating_sub(side + 72)
            };
            let dy = if bottom < p.y as i64 + m.size().height as i64 {
                cy.saturating_add(32)
            } else {
                cy.saturating_sub(side + 32)
            };
            let (tx, ty) = bounds(app, dx, dy, side);
            if let Ok(current) = win.inner_position() {
                let next_x = current.x + ((tx - current.x) as f64 * 0.29).round() as i32;
                let next_y = current.y + ((ty - current.y) as f64 * 0.29).round() as i32;
                if current.x != next_x || current.y != next_y {
                    let _ =
                        win.set_position(Position::Physical(PhysicalPosition::new(next_x, next_y)));
                }
            }
        }
    }
    let Ok(mut pos) = win.inner_position() else {
        return Duration::from_millis(60);
    };
    let physical_side = win.outer_size().map(|s| s.width as i32).unwrap_or(SIDE);
    if mode == Mode::Perch && !dragging {
        let (safe_x, safe_y) = bounds(app, pos.x, pos.y, physical_side);
        if (pos.x, pos.y) != (safe_x, safe_y)
            && win
                .set_position(Position::Physical(PhysicalPosition::new(safe_x, safe_y)))
                .is_ok()
        {
            pos = PhysicalPosition::new(safe_x, safe_y);
            let guard = state(app);
            guard
                .0
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .spot = Some((safe_x, safe_y));
            let _ = persist(app);
        }
    }
    let side = physical_side as f64;
    let lx = cx as f64 - pos.x as f64;
    let ly = cy as f64 - pos.y as f64;
    let nx = (lx / side - 0.5) / 0.5;
    let ny = (ly / side - 0.49) / 0.5;
    let body = (nx / 0.7).powi(2) + (ny / 0.74).powi(2) <= 1.0;
    let near = (nx * nx + ny * ny) < 36.0;
    let ignore = mode == Mode::Follow || (!menu && !dragging && !body);
    if previous_ignored != Some(ignore) && win.set_ignore_cursor_events(ignore).is_ok() {
        let guard = state(app);
        guard
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .ignored = Some(ignore);
    }
    if !sleeping {
        let glance = (
            (nx.clamp(-1.0, 1.0) * 100.0) as i32,
            (ny.clamp(-1.0, 1.0) * 100.0) as i32,
        );
        if previous_gaze != Some(glance) {
            let _ = app.emit_to(
                LABEL,
                "guardian:cursor",
                Cursor {
                    x: nx.clamp(-1.0, 1.0),
                    y: ny.clamp(-1.0, 1.0),
                    near,
                },
            );
            let guard = state(app);
            guard
                .0
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .gaze = Some(glance);
        }
    }
    if sleeping {
        Duration::from_millis(200)
    } else if mode == Mode::Follow {
        Duration::from_millis(17)
    } else {
        Duration::from_millis(33)
    }
}

pub(crate) fn init(app: &AppHandle) {
    if let Some(pref) = load_config(app) {
        let guard = state(app);
        let mut live = guard
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        live.mode = pref.mode;
        live.spot = Some((pref.x, pref.y));
    }
    let handle = app.clone();
    std::thread::spawn(move || loop {
        let wait = tick(&handle);
        std::thread::sleep(wait);
    });
}

#[cfg(test)]
mod tests {
    use super::Mode;
    #[test]
    fn invalid_mode_is_rejected() {
        assert!(Mode::parse("perch").is_ok());
        assert!(Mode::parse("follow").is_ok());
        assert!(Mode::parse("always-record").is_err());
    }
}
