# Detached Guardian Alpha — Windows acceptance

This is source for a second, hidden-at-start WebView **in the same Tauri process**, not a second executable. The existing @xyeena/mascot package is reused. The application version stays `1.0.0-alpha.1`.

## How to smoke test (mark PASS only when performed)

| Gate | Procedure | Result |
| --- | --- | --- |
| Window | Launch normally, use the new Guardian button in expanded Island; Guardian appears and Island character disappears | NOT RUN |
| Tray & taskbar | Confirm no new taskbar or Alt-Tab entry, close Island, use tray | NOT RUN |
| Perch | Drag Guardian across desktop then return and detach again; verify saved position | NOT RUN |
| Follow | Choose Follow from Island; cursor movement never blocks underlying app clicks | NOT RUN |
| Return | Double-click Guardian in Perch or use Island Return | NOT RUN |
| Hitbox | Click VS Code/browser controls through transparent corners while Guardian overlaps | NOT RUN |
| Menu | Right-click Guardian in Perch; Return / Follow / Sleep | NOT RUN |
| Multi-monitor | Move across monitors, detach and reconnect after monitor removal | NOT RUN |
| DPI | Test 100%, 125%, 150% scaling; body and hitbox remain aligned | NOT RUN |
| Sleep | Toggle Sleep; no ongoing high-rate rendering, wake via menu | NOT RUN |
| Context | Media plays / meeting manually active / connected Xyeena runs; Lion reflects only real state | NOT RUN |
| Privacy | Confirm cursor coordinates are not written to disk or sent over network | NOT RUN |
| Focus | Clicking Guardian doesn't interrupt keyboard input to other apps | NOT RUN |
| Interruption | Rapid detach / return, alt-tab, sleep/resume and restart | NOT RUN |
| FPS | Measure p95 frame time, CPU/GPU idle, native window movement under Follow | NOT RUN |
| Installer | Build NSIS, install, launch, uninstall; no orphan windows or files | NOT RUN |

## Current architecture and limitations

- Two Tauri windows: main and guardian. `guardian` is hidden at startup and has an independent least-privilege capability. No duplicate Tauri host.
- The Guardian's native state is shared across windows and is restricted to the allowlisted Island context. No cursor trail, clicks, coordinates, clipboard data or screenshots are stored.
- `guardian-desktop.json` persists only Perch position and the selected desktop behavior. Explicitly return the Lion to the Island before quitting if you prefer the Island-only startup.
- Follow uses Win32 `GetCursorPos` and native window repositioning. Performance and focus on actual Windows hardware are NOT verified from Node tests.
- Windows cursor polling runs only while detached. Follow is click-through; use the Island header to return to Perch.
- Native hit testing is an approximate circle over the visible Lion silhouette, not pixel-perfect artwork alpha testing. Test screen scaling and accessories manually.
- Current artwork is the existing SVG Guardian. A future Canvas 2.5D head/mane rig and physically choreographed dock/undock are **not** included in this implementation.
- Detached Guardian is not considered release-accepted until tests above pass and the Windows Rust build, Clippy and packaging are green.

No data sync, agent hook installation or external service integration is added by this feature. Coucou is a motion reference only; no Mochi assets are reused.
