# v0.6 candidate acceptance

Run in Windows PowerShell in a disposable/source-controlled project:

```powershell
npm install
npm test
npm run build
npm run doctor
npm run desktop
```

**Windows native build gate:** Rust compilation can fail when a dependency or WinRT API differs. Do not mark native PASS until the project compiles and a real Tauri window opens. Preserve the first `error:` and `Caused by:` from Cargo for diagnosis. Do not run `cargo clean` by default.

1. **Clipboard default-off:** open Clips; `Capture off`; no clipboard history from before opt-in. Select `Read clipboard once` and verify only text appears; restart app and confirm no stored history.
2. **Capture:** enable, copy two harmless test strings and confirm new entries with dedupe; Pause stops new additions. Clear removes the entries. Test credential-looking text and document limitations: this heuristic cannot reliably identify all secrets.
3. **Windows GSMTC:** play/pause, previous/next, and session choice. Timeline appears only when duration is available; seek must visibly fail for unsupported players. Shuffle/repeat are requests, not guaranteed results.
4. **Master output volume:** slider changes **default system output** (other apps will also be affected), mute toggles correctly and refreshes when changed through Windows settings. Not per-app volume.
5. **No false meeting detection:** Teams meeting doesn't automatically appear as media unless Teams itself exposes a supported playback session; manual meeting mode remains explicit.
6. **Tray and motion:** always-on-top, skip taskbar, reduced motion, no pointer obstruction; measure actual frame pacing on 60/120Hz and verify multi-display DPI.
7. **Security:** no secret clipboard persistence, no unsolicited hooks, no approvals or network calls, notification opt-in unchanged.

Report results before the next integration stage. Neither *node tests* nor TypeScript alone establish this acceptance.
