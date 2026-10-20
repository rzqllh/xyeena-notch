# Verified Windows 0.5.0 Parity Ledger

<!-- MACHINE-GENERATED FROM docs/parity/ledger.json — DO NOT HAND-EDIT -->

*Generated on:* 2026-10-20T02:43:21.579Z
*Total Capabilities:* 41

| ID | Area | Capability | Coucou Path | Status | Tier | Phase | Decision | Tests | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| **F01** | shell | Stationary notch / compact / glance / expanded / hidden | `windows/src-tauri/src/island.rs, windows/src/core/layout.ts` | `VERIFIED` | A | P0 | verified | 4 | E1+E2+E3 |
| **F02** | agents | Contextual source pills, session focus, multi-agent concurrency | `windows/src/island/agents.ts, windows/src/core/pills.ts` | `VERIFIED` | A | P3 | verified | 3 | E1+E2+E3 |
| **F03** | system | Tray menu, shortcuts, topmost, multi-monitor, DPI | `windows/src-tauri/src/tray.rs, windows/src-tauri/src/shortcuts.rs` | `FOUNDATION` | A | P4 | adapt | 0 | E1 |
| **F04** | mascot | Cursor gaze, Xyn gestures, pause/sleep, wardrobe | `windows/src/mochi/engine.ts, windows/src/mochi/wardrobe.ts` | `FOUNDATION` | A | P4 | adapt | 0 | E1 |
| **F05** | agents | Agent hook detection, opt-in install, backup, uninstall | `windows/src-tauri/src/agent_hooks.rs, windows/src/island/hooks.ts` | `VERIFIED` | A | P1 | verified | 4 | E1+E2+E3 |
| **F06** | agents | Claude Code live events, approvals, question prompts | `windows/src-tauri/src/claude.rs, windows/src-tauri/src/chat.rs` | `FOUNDATION` | A | P1 | build | 0 | E1 |
| **F07** | agents | Codex live events & approval (fail-closed) | `windows/src-tauri/src/codex_plan.rs` | `UNVERIFIED-CONTRACT` | A | P1 | needs-user | 0 | E1 |
| **F08** | agents | Gemini CLI live events & tool run telemetry | `windows/src-tauri/src/agents.rs` | `FOUNDATION` | A | P1 | build | 0 | E1 |
| **F09** | agents | Antigravity live events, named pipe IPC | `windows/src-tauri/src/pipe.rs` | `VERIFIED` | A | P1 | verified | 3 | E1+E2+E3+E4 |
| **F10** | agents | Cursor, Copilot, Muse, OpenCode, Amp, Hermes catalog | `windows/src/island/agents.ts` | `FOUNDATION` | B | P5 | adapt | 0 | E1 |
| **F11** | agents | Multi-session, subagent, lifecycle, notifications | `windows/src-tauri/src/pipe.rs, windows/src/core/state.ts` | `VERIFIED` | A | P1 | verified | 3 | E1+E2+E3 |
| **F12** | developer | File-change ticker and bounded diff preview | `windows/src/views/diff.ts, windows/src/core/diff.ts` | `VERIFIED` | A | P3 | verified | 3 | E1+E2+E3 |
| **F13** | developer | Open actual terminal/editor session | `windows/src-tauri/src/platform/windows.rs` | `VERIFIED` | A | P4 | verified | 2 | E1+E2+E3 |
| **F14** | telemetry | Claude/Codex usage limits & authentic token telemetry | `windows/src/views/usage.ts, windows/src/core/plan.ts` | `VERIFIED` | A | P4 | verified | 1 | E1+E2+E3 |
| **F15** | chat | AI Chat providers (streaming, multi-turn, strict models) | `windows/src-tauri/src/chat.rs, windows/src/views/chat.ts` | `VERIFIED` | A | P3 | verified | 4 | E1+E2+E3 |
| **F16** | security | Secure credentials and model discovery | `windows/src-tauri/src/secrets.rs` | `FOUNDATION` | A | P1 | adapt | 0 | E1 |
| **F17** | clipboard | In-memory clipboard text/image history, lossless PNG | `windows/src-tauri/src/platform/windows.rs` | `VERIFIED` | A | P3 | verified | 3 | E1+E2+E3 |
| **F18** | clipboard | Clipboard preview, search, pin, restore, clear | `windows/src/views/dom.ts` | `VERIFIED` | A | P3 | verified | 2 | E1+E2+E3 |
| **F19** | files | File drag/drop to Xyn, RFC 4180 CSV, native Explorer drop | `windows/src-tauri/src/files.rs, windows/src/views/upload.ts` | `VERIFIED` | A | P4 | verified | 1 | E1+E2+E3 |
| **F20** | media | Windows media/Spotify playback, master endpoint volume | `windows/src-tauri/src/spotify.rs` | `VERIFIED` | A | P3 | verified | 2 | E1+E2+E3 |
| **F21** | integrations | GitHub PR/CI/reviews and workspace detection | `windows/src-tauri/src/github.rs, windows/src/views/github.ts` | `VERIFIED` | A | P4 | verified | 3 | E1+E2+E3 |
| **F22** | integrations | Connected services health (Vercel, Notion, n8n, etc.) | `windows/src-tauri/src/integrations.rs` | `VERIFIED` | B | P5 | verified | 3 | E1+E2+E3 |
| **F23** | speech | Flow offline dictation, push-to-talk, WinRT recognizer | `windows/src-tauri/src/flow/mod.rs, windows/src/core/flow.ts` | `VERIFIED` | B | P5 | verified | 2 | E1+E2+E3 |
| **F24** | speech | Flow dictionary, snippets, cleanup, statistics | `windows/src/hub/pages/words.ts` | `VERIFIED` | B | P5 | verified | 2 | E1+E2+E3 |
| **F25** | audio | Notetaker consented recording and transcription (WASAPI) | `windows/src-tauri/src/notes/mod.rs` | `VERIFIED` | B | P5 | verified | 4 | E1+E2+E3 |
| **F26** | audio | Voice commands and voice-enabled Xyn | `windows/src-tauri/src/voice/brain.rs` | `VERIFIED` | B | P5 | verified | 3 | E1+E2+E3 |
| **F27** | recap | Weekly Recap and SVG share/export | `windows/src-tauri/src/recap.rs, windows/src/recap/share.ts` | `VERIFIED` | A | P4 | verified | 3 | E1+E2+E3 |
| **F28** | design | Localization (EN/ID), accessibility, reduced motion | `windows/src/i18n/i18n.ts` | `VERIFIED` | A | P2 | verified | 2 | E1+E2+E3 |
| **F29** | companion | Android local secure pairing / approvals | `windows/src-tauri/src/phone_link/mod.rs` | `DEFERRED` | C | — | deferred | 3 | E1 |
| **F30** | design | Icon design migration to Phosphor typed registry | `windows/src/views/icons.ts` | `VERIFIED` | A | P2 | verified | 1 | E1+E2+E3 |
| **F31** | cleanup | Removal of obsolete manual meeting timer | `windows/src-tauri/src/lib.rs` | `VERIFIED` | A | P0 | verified | 1 | E1+E2+E3 |
| **F32** | cleanup | Removal of obsolete Activity tab UI | `windows/src/island/island.ts` | `VERIFIED` | A | P0 | verified | 1 | E1+E2+E3 |
| **F33** | performance | WebView2 CPU/memory stability and suspension | `windows/src-tauri/src/lib.rs` | `VERIFIED` | A | P0 | verified | 1 | E1+E2+E3 |
| **F34** | packaging | Windows NSIS installer, uninstall, release audit | `windows/src-tauri/tauri.conf.json` | `VERIFIED` | A | P6 | verified | 4 | E1+E2+E3 |
| **G01** | companion | Detached floating desktop companion pet window | `windows/src-tauri/src/desktop.rs, windows/mochi.html` | `EXCLUDED` | C | — | excluded | 0 | E1 |
| **G02** | shell | Standalone secondary Hub window (640x720) | `windows/src-tauri/src/lib.rs, windows/index.html` | `DEFERRED` | C | — | deferred | 0 | E1 |
| **G03** | companion | Phone Link WhatsApp Gateway / Direct Messaging | `windows/src-tauri/src/phone_link/chat.rs` | `SKIPPED` | C | — | skip | 0 | E1 |
| **G04** | integrations | Crypto portfolio tracker integration | `windows/src/views/integrations.ts` | `SKIPPED` | C | — | skip | 0 | E1 |
| **G05** | audio | Voice wake word engine | `windows/src-tauri/src/voice/wake.rs` | `EXCLUDED` | C | — | excluded | 0 | E1 |
| **G06** | speech | Dedicated dictation floating pill window | `windows/src-tauri/src/flow/pill.rs, windows/pill.html` | `WIRED` | A | P5 | adapt | 0 | E1 |
| **G07** | settings | Dedicated standalone settings window (settings.html) | `windows/src-tauri/src/lib.rs, windows/settings.html` | `FOUNDATION` | B | P2 | adapt | 0 | E1 |
