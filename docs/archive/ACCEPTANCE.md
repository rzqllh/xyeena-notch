# Xyeena Island 0.3.0 — Windows acceptance

**Status:** automated domain tests PASS; native Windows compilation and manual checks pending. All native results must be evidenced on the user's device.

## Compile and environment

1. Windows 10/11, WebView2, MSVC x64 linker and Rust stable-msvc; `npm run doctor` must report valid versions.
2. `npm install`, `npm test`, `npm run build`, `npm run desktop` from project root — record exact output and first compiler error if any.
3. Keep existing Rust target caches and previous app version until smoke test passes.

## Motion and visual

4. Inspect initial compact pill at top-center; no taskbar entry; tray Open, Compact, Hide, Quit.
5. Expand/collapse 10 times, including reversal before completion. No jumping, stuck state, visual clipping or content flash.
6. Test 60Hz and 120Hz displays when available, including fractional scaling (125%, 150%), browser maximized, second monitor and focus changes. Record *measured* presentation FPS with Edge WebView2 DevTools/ETW; requestAnimationFrame timing alone is not native composition FPS.
7. Verify hide/compact/pin, pointer leaving and tray actions; ensure no giant transparent window blocks clicks behind the panel.
8. Windows theme dark and light, Preferences appearance dropdown, reduced motion and keyboard tab/arrow/focus. No text truncation beyond intentional ellipsis, no inaccessible low-contrast controls.

## Functional

9. Start Spotify or a Chromium tab playing audio. Media tab must show real session metadata if Windows exposes it. Try pause/play/next/previous and verify in the player itself; if unavailable, display an honest empty state.
10. Open Runs, connect a project with `.xyeena/runs`, confirm snapshot metadata and no journal/secret content. Retry with a folder lacking runs; no crash.
11. Alerts: first connection sends nothing. Enable notifications explicitly, grant OS permission, then change a test run snapshot from EXECUTE to REVIEW/RELEASE/CLOSE; only genuine changes should show in-app and, if Windows allows toasts, as an OS notification. An installed app may be needed for correct native toast identity.
12. No automatic Git hook, auth token, global shortcut, remote network connection, agent approval or autostart configuration.

## Exit gate

- Record a screenshot/video at compact and expanded size, plus successful `npm run build`/`npm run desktop` output.
- Until the full checklist passes, label the result `preview candidate`; do not bundle a public Windows installer or assert locked 60 FPS.
