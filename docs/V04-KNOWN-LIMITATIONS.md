# Island 0.4 — implementation scope and acceptance

## Confirmed in source

- Removed the large redundant home hero, placeholder cards, repetitive status banners, and ornamental footer.
- Compact: a single current-context status. Expanded: **Now**, **Activity**, **Settings**.
- **Now** presents a list of Windows playback sessions via `GetSessions`, controls the user-selected source, and includes a clearly labeled **manual** meeting timer.
- **Activity** is optional, reads only `.xyeena/runs/*/snapshot.json` from a selected directory, and explains why an ordinary Island directory has no snapshots. Project directory is remembered on this device only after explicit Connect.
- **Test toast** logs an entry in Activity; Windows toast delivery is separately subject to operating-system permission.
- Expanded height 396 logical pixels. The body, including Settings and Media, scrolls rather than silently clipping content. No fake equal-size home cards.
- Preference/state changes remain local. No third-party telemetry or network service.

## NOT implemented / NOT claimed

- **Teams call detection is NOT provided by GSMTC**. Windows GSMTC reports compatible playback sessions; Teams calls require a distinct connector. The timer is manual, not a detection result.
- For real Teams `InAMeeting`/`InACall` status, the next stage requires Microsoft Graph `Presence.Read` delegated authorization or another documented user-consented Teams API. Do not infer meetings solely from `ms-teams.exe` processes or microphone usage.
- No Windows Notification Center read access, no call controls/mic capture, no automatic meeting join, no Teams message access.
- No guaranteed 60/120 FPS: native resize/WebView2 timing must be measured on Windows with a real monitor and instrumentation.
- Rust/Windows native compilation has not been performed in the model container. Static TypeScript checking used temporary Tauri API type declarations; final Windows compilation is still a release gate.

## Windows acceptance

1. `npm install`, `npm test`, `npm run build`, `npm run doctor`, `npm run desktop`.
2. Expand/compact repeatedly, switch between Now, Activity and Settings; no cropped controls. Scroll in Settings/Activity.
3. Start playback in Spotify or a compatible browser tab, refresh; choose the correct source, test previous/play-pause/next. If the source is missing, the app may not publish GSMTC sessions.
4. Enter a Teams call; observe that the app **does not falsely label it as a music track or a detected meeting**. Manual meeting mode starts/stops and tracks elapsed time.
5. Click Test toast; the Windows toast should be requested and an Activity history row should appear. Denied permission is explained.
6. Verify pin, always-on-top, hide to tray, escape key, and reduced-motion setting; restart and confirm manually chosen settings persist.
7. Record actual frame timings and inspect native build errors before claiming performance targets.

## Source and licenses

- Xyeena code: MIT. Motion mathematical primitives trace to Coucou Windows, MIT, copyright Louis Raillé; see `THIRD_PARTY_NOTICES.md`.
- No Coucou branding, character, artwork, sounds, or icons copied.
