# Stage 0.5 acceptance — Windows only

## Automated evidence

- `npm test`: 32/32 PASS on development source with Node 22.16, including event boundary fail-closed tests and Fold state mapping.
- TypeScript `tsc --noEmit`: PASS using temporary ambient declarations for Tauri APIs in this sandbox. **Real installed Tauri package declarations and native Cargo build were not available**; recheck both on Windows.
- No external mascot artwork is bundled. Coucou MIT motion attribution preserved; all existing Tauri settings and media logic retained.

## Required checks on owner's Windows desktop

1. Stop the running app. Back up source and apply the upgrade archive to a checkout based on v0.4. Do not use this archive on Stage 0 or v0.3.
2. `npm install`, `npm test`, `npm run build`, `npm run doctor`, `npm run desktop` all PASS. Confirm no Rust/WinRT regression before redesigning shell.
3. Original Fold is rendered at top-center in compact and header positions, with no old generic diamond brand mark visible in those slots.
4. In a compatible Windows playback session, Fold's motion changes to `playing`; if the player stops, Fold returns to appropriate actual state.
5. Manual meeting timer maps to `listening`; verify the app does **not** claim Teams or microphone presence automatically.
6. Connect a real Xyeena Agentic project that has `snapshot.json`; `EXECUTE/VERIFY` map to `working`, `DEBUG` maps to `attention`; no run remains `idle`.
7. Reduced-motion system setting and Xyeena toggle both stop Fold's CSS animations completely. High-contrast mode remains readable.
8. Expand/collapse continuously for 60 seconds, including interrupting an opening motion with a collapse; observe dropped frames, system CPU/GPU usage, screen DPI, and input correctness. **No numerical FPS guarantee is claimed** until measured.
9. Verify media controls, notifications, always-on-top, skip taskbar and tray remain functional; inspect logs for errors.
10. Review Settings → About & credits. Open `THIRD_PARTY_NOTICES.md` and verify that the MIT source license is included in any future distributable.

## Known constraints

- Fold is an experimental brand candidate. For higher-fidelity facial rigging and interpolation, create original art and attach a separate Rive state machine in the next milestone.
- No agent hooks/approval/keys were installed. The agent event module is an **unconnected policy boundary**.
- 60/120 Hz compositor behavior and Windows Media APIs are not verifiable in Linux-only source tests.
- Some media players do not expose GSMTC sessions. Teams calls are not GSMTC playback; Teams presence requires specific opt-in integration.
