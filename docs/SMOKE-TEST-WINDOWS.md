# Xyeena Notch — Windows Manual Smoke Test Guide (1.0.0-alpha.1)

**Application:** Xyeena Island (`@xyeena/island`)<br>
**Version:** `1.0.0-alpha.1`<br>
**Target OS:** Windows 10 / 11 (x64)<br>
**Binary Type:** Unsigned NSIS Installer (`currentUser` scope)<br>
**Binary Location:** `apps/xyeena-island/src-tauri/target/release/bundle/nsis/Xyeena Island_1.0.0-alpha.1_x64-setup.exe`<br>
**Binary Size:** 2,378,623 bytes (~2.27 MB)<br>
**SHA256 Checksum:** `7AAFADD499E59E5FF68C399BD8DDCA31EA1AA37E8C576FC4FDB71D747DFBEA54`<br>
**Execution Date:** 2026-10-14

---

## Pre-Requisites and Automated Baseline

Automated gates executed and verified prior to manual test distribution:

- [x] Node.js workspace unit tests: 64 tests passed (Island: 51, Mascot: 10, Playground: 3)
- [x] Native Rust tests: 5 tests passed (`cargo test --locked`)
- [x] Rust Clippy: 0 warnings (`cargo clippy --locked --all-targets -- -D warnings`)
- [x] Rust formatting: Checked and verified (`cargo fmt --all -- --check`)
- [x] TypeScript & Vite build: 0 errors
- [x] Release audit & license compliance: PASS (`npm run release:audit`)
- [x] NSIS bundle generation: PASS (`tauri build --bundles nsis`)

---

## Manual Smoke Test Scenarios

Instructions: Perform each test on a physical or dedicated virtual Windows machine running Windows 10 or 11. Mark **PASS**, **FAIL**, or **BLOCKED** and record observations.

---

### Scenario 1: Install and Launch

- **Procedure:**
  1. Double-click `Xyeena Island_1.0.0-alpha.1_x64-setup.exe`.
  2. Confirm installer runs without requiring administrative/UAC elevation (per-user NSIS install).
  3. Verify installation finishes cleanly without error dialogues.
  4. Launch `Xyeena Island` from Start Menu or desktop shortcut.
- **Expected Result:** Application starts without crash; compact Island bar appears centered at the top edge of the primary monitor.
- **Status:** `[ ] PENDING MANUAL SMOKE` (PASS / FAIL / BLOCKED)
- **Observations:**

---

### Scenario 2: Tray and Taskbar Behavior

- **Procedure:**
  1. Inspect the Windows Taskbar when Island is running.
  2. Press Alt+Tab to cycle active applications.
  3. Inspect the Windows Notification Area (system tray) for the Xyeena icon.
  4. Right-click the system tray icon to reveal tray menu (`Toggle Island`, `Preferences`, `Quit`).
  5. Select `Quit` from tray menu, then relaunch.
- **Expected Result:** Island does not appear in the Taskbar or Alt+Tab switcher (`skipTaskbar: true`). Tray icon is visible, responsive, and cleanly shuts down the process on `Quit`.
- **Status:** `[ ] PENDING MANUAL SMOKE` (PASS / FAIL / BLOCKED)
- **Observations:**

---

### Scenario 3: Compact, Expanded, Hidden, and Pinned Transitions

- **Procedure:**
  1. Click the compact Island bar or press Enter while focused.
  2. Observe expansion animation down to full panel (`620x396px`).
  3. Click outside the panel or press Escape. Verify collapse back to compact (`400x92px`).
  4. Toggle the Pin button in the Island header.
  5. Click outside the panel while pinned.
  6. Click the Minimize/Hide button. Verify collapse to dormant wake strip (`184x8px`).
- **Expected Result:** Transitions animate smoothly with spring physics; unpinned panel collapses on blur; pinned panel remains expanded; hide state collapses window cleanly without leaving artifacts.
- **Status:** `[ ] PENDING MANUAL SMOKE` (PASS / FAIL / BLOCKED)
- **Observations:**

---

### Scenario 4: Living Lion Guardian Mascot States and Motion

- **Procedure:**
  1. Inspect `<xyeena-guardian>` rendered in the compact Island notch (84px Canvas 2D/2.5D rig) and expanded header (56px).
  2. Move cursor globally across the Island window and observe lion gaze: eyes track pointer smoothly, followed by subtle head tilt/rotation (head lag).
  3. Move cursor directly over the lion's face and verify the dead-zone (eyes rest naturally centered rather than jittering).
  4. Verify the body remains stably anchored in place (no walking, no cursor chasing across the desktop).
  5. Verify natural breathing, ear twitching, mane motion, and spontaneous blinking.
  6. Click the Guardian avatar or press Enter to trigger a salute/greeting interaction.
  7. Trigger various app states: active media playback (listening/playing), manual meeting mode (working), notification toast (attention), and sleeping.
- **Expected Result:** Guardian renders with strong character presence at 84px compact / 56px expanded. Eyes smoothly track cursor with subtle head lag while body stays anchored. State priority transitions immediately to higher priority (error > attention > working > listening > idle). Reduced motion setting disables animated transforms.
- **Status:** `[ ] PENDING MANUAL SMOKE` (PASS / FAIL / BLOCKED)
- **Observations:**

---

### Scenario 5: Multi-Monitor and Display Scaling

- **Procedure:**
  1. Set Windows display scaling to 100%, then 125%, then 150% in Display Settings.
  2. Move or relaunch Island on secondary monitor if available.
  3. Inspect window geometry, text rendering, borders, and button click targets.
- **Expected Result:** Island stays aligned to top-center without clipping or overflow. Hitboxes remain accurate. High-DPI text and SVG vectors remain sharp.
- **Status:** `[ ] PENDING MANUAL SMOKE` (PASS / FAIL / BLOCKED)
- **Observations:**

---

### Scenario 6: Windows Master Volume and Mute

- **Procedure:**
  1. In expanded Island, navigate to the Volume control section.
  2. Drag volume slider or use Left/Right arrow keys. Verify percentage updates in real time.
  3. Click the Mute toggle button.
  4. Open Windows System Volume Mixer to compare values.
- **Expected Result:** Island slider directly controls Windows default endpoint master volume. Mute toggles system mute state. Feedback displays accurate percentage (e.g., `50%`) without desync.
- **Status:** `[ ] PENDING MANUAL SMOKE` (PASS / FAIL / BLOCKED)
- **Observations:**

---

### Scenario 7: Real Browser or Spotify Media Playback

- **Procedure:**
  1. Open Spotify or a media stream in Chrome/Edge/Firefox.
  2. Start audio playback. Observe Island media card.
  3. Click Play/Pause button in Island.
  4. Click Next Track and Previous Track buttons.
- **Expected Result:** GSMTC session is detected with accurate title, artist, and album. Play, pause, and skip commands execute reliably on the active player.
- **Status:** `[ ] PENDING MANUAL SMOKE` (PASS / FAIL / BLOCKED)
- **Observations:**

---

### Scenario 8: Unsupported Seek / Shuffle / Repeat Handling

- **Procedure:**
  1. Play audio in a player that does not support seeking or shuffle (e.g., standard browser web stream).
  2. Observe timeline slider and shuffle/repeat buttons.
  3. Attempt interaction with unsupported controls.
- **Expected Result:** Unsupported controls gracefully indicate disabled or unavailable state. App does not crash or throw unhandled exceptions.
- **Status:** `[ ] PENDING MANUAL SMOKE` (PASS / FAIL / BLOCKED)
- **Observations:**

---

### Scenario 9: Clipboard Opt-In, Pause, Copy, and Clear

- **Procedure:**
  1. Navigate to the Clipboard tab in expanded Island.
  2. Verify clipboard monitoring defaults to disabled (OFF).
  3. Toggle clipboard monitoring ON. Collapse Island to compact or switch focus to Notepad.
  4. Copy 3 distinct text snippets in Notepad.
  5. Expand Island again and verify all 3 snippets appear in the in-memory history list (verifying that window hiding/collapse does not clear history or terminate polling).
  6. Click Pause; copy another string; verify it is not captured.
  7. Click Copy on a previously captured snippet; paste in Notepad to verify content.
  8. Click Clear; verify history list is completely emptied.
  9. Close Island completely and relaunch; verify previous clipboard history is not persisted on disk.
- **Expected Result:** Strict privacy boundaries enforced: opt-in only, in-memory ring buffer, non-persisted history, persistence across Island collapses, pause and clear work as expected.
- **Status:** `[ ] PENDING MANUAL SMOKE` (PASS / FAIL / BLOCKED)
- **Observations:**

---

### Scenario 10: Notification Permission and Toast

- **Procedure:**
  1. Navigate to Notifications section.
  2. Click "Send Test Toast" button.
  3. Check for native Windows notification toast banner in bottom-right corner.
  4. Inspect in-app notification history list in Island.
- **Expected Result:** Native Windows toast displays correctly with title and body. Notification is recorded in Island local activity history.
- **Status:** `[ ] PENDING MANUAL SMOKE` (PASS / FAIL / BLOCKED)
- **Observations:**

---

### Scenario 11: Manual Meeting Mode

- **Procedure:**
  1. In expanded Island, navigate to Meeting Mode.
  2. Start a manual meeting timer (e.g., 15 minutes).
  3. Verify timer counts down and Guardian transitions to working state.
  4. Pause, adjust duration, and end the meeting session.
- **Expected Result:** Meeting mode acts as an explicit manual productivity timer. No false claims of Teams or Zoom auto-detection.
- **Status:** `[ ] PENDING MANUAL SMOKE` (PASS / FAIL / BLOCKED)
- **Observations:**

---

### Scenario 12: Real Xyeena Run Snapshots

- **Procedure:**
  1. Enter a valid directory path containing a `.xyeena/runs/<id>/snapshot.json` file.
  2. Verify Island parses the snapshot and displays task status, phase, and summary.
  3. Enter an invalid path or a directory with malformed JSON.
- **Expected Result:** Valid run snapshot is read cleanly in read-only mode without file modifications. Invalid or non-existent path displays safe error/empty state without crashing.
- **Status:** `[ ] PENDING MANUAL SMOKE` (PASS / FAIL / BLOCKED)
- **Observations:**

---

### Scenario 13: Settings and Restart Persistence

- **Procedure:**
  1. In Settings tab, change theme (Dark / Light / System) and toggle Reduced Motion.
  2. Toggle Start Hidden preference.
  3. Quit Island from the system tray menu.
  4. Relaunch Island and verify settings persisted in `localStorage`.
- **Expected Result:** User preferences persist across app restarts without corruption.
- **Status:** `[ ] PENDING MANUAL SMOKE` (PASS / FAIL / BLOCKED)
- **Observations:**

---

### Scenario 14: Sleep, Relaunch, and Crash Recovery

- **Procedure:**
  1. With Island running, put Windows into Sleep mode, then wake the machine.
  2. Verify Island window remains responsive and re-attaches to media/volume sessions.
  3. In Task Manager, terminate `xyeena-island.exe` process unexpectedly.
  4. Relaunch application.
- **Expected Result:** Window recovers cleanly after sleep without dead IPC handles or zombie processes.
- **Status:** `[ ] PENDING MANUAL SMOKE` (PASS / FAIL / BLOCKED)
- **Observations:**

---

### Scenario 15: Uninstall and Cleanup

- **Procedure:**
  1. Open Windows Settings > Apps > Installed apps.
  2. Select `Xyeena Island` and click Uninstall.
  3. Confirm uninstallation completes.
  4. Verify Start Menu shortcut and install directory in `%LOCALAPPDATA%\Programs\xyeena-island` are cleanly removed.
- **Expected Result:** Uninstallation completes silently or with clean standard dialogue; no orphaned background services or startup registry entries remain.
- **Status:** `[ ] PENDING MANUAL SMOKE` (PASS / FAIL / BLOCKED)
- **Observations:**

---

### Scenario 16: Accessibility, Reduced Motion, and Performance Observation

- **Procedure:**
  1. Enable Windows "Show animations in Windows" -> OFF, or enable Island "Reduced Motion".
  2. Expand and collapse Island; verify window jumps to target dimensions instantly without animation.
  3. Navigate entire expanded UI using only keyboard (`Tab`, `Shift+Tab`, `Space`, `Enter`, `Arrow keys`).
  4. Inspect focus outlines on all interactive controls.
  5. Check Task Manager for idle CPU and GPU usage while compact bar is stationary.
- **Expected Result:** Full keyboard accessibility with high-contrast visible focus outlines. Reduced motion disables RAF loops immediately. Idle CPU/GPU remains negligible (< 0.5% CPU when idle).
- **Status:** `[ ] PENDING MANUAL SMOKE` (PASS / FAIL / BLOCKED)
- **Observations:**

---

### Scenario 17: Detached Desktop Guardian (Perch, Follow, Drag, Return, and Click-Through)

- **Procedure:**
  1. In expanded Island header, click the Lion button (`🦁`).
  2. Confirm Guardian detaches: Island mascot slot hides cleanly and transparent Guardian window appears on desktop.
  3. Inspect Windows Taskbar and Alt+Tab: confirm no separate taskbar button or Alt+Tab entry is created (`skipTaskbar: true`, `WS_EX_TOOLWINDOW`).
  4. In Perch mode, drag the Guardian across desktop; verify smooth repositioning without focus-stealing from underlying windows.
  5. Click through the transparent corners outside the Lion's body; verify clicks hit underlying desktop/browser without obstruction.
  6. Right-click Guardian to open the context menu (`Return home`, `Switch mode`, `Sleep`).
  7. Switch to Follow mode: verify Guardian follows cursor with offset and full click-through to apps below.
  8. Switch back to Perch mode; double-click Guardian or click `🦁` in Island header to return home.
  9. Confirm Guardian window hides and Island companion reappears.
- **Expected Result:** Shared presence across Island and desktop; smooth non-activating secondary window; reliable click-through; Perch position persisted in `guardian-desktop.json`.
- **Status:** `[ ] PENDING MANUAL SMOKE` (PASS / FAIL / BLOCKED)
- **Observations:**

---

## Smoke Test Sign-Off Summary

| Field | Detail |
|---|---|
| **Evaluator Name** | |
| **Windows Version** | Windows 10 / 11 Build: |
| **Display Resolution / Scale** | e.g., 2560x1440 @ 125% |
| **Overall Assessment** | [ ] PASS — READY FOR ALPHA TESTING <br> [ ] BLOCKED — DEFECTS FOUND |
| **Blocking Issues (if any)** | |
| **Sign-Off Date** | |
