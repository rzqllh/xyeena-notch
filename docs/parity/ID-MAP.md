# Capability ID Map — Coucou Windows 0.5.0 vs Xyeena Notch

Mapping of seeded capability identifiers `F01`–`F34` (from legacy `03-PARITY-LEDGER.md`) and extended inventory identifiers `G01`–`G07` to their architectural areas, upstream source modules, and active Xyeena Notch implementation status.

| ID | Capability Area | Description | Upstream Coucou 0.5.0 Module | Xyeena Notch Implementation | Tier | Target Phase | Status |
|---|---|---|---|---|---|---|---|
| **F01** | Shell / Geometry | Stationary notch / compact / glance / expanded / hidden | `windows/src-tauri/src/island.rs` | `src-tauri/src/lib.rs:apply_frame`, `style.css` | A | P0 | `VERIFIED` |
| **F02** | Agents / UI | Contextual source pills, session focus, multi-agent | `windows/src/island/agents.ts` | `src/core/session-store.mjs`, `main.ts` | A | P3 | `VERIFIED` |
| **F03** | System / Desktop | Tray menu, shortcuts, topmost, multi-monitor, DPI | `windows/src-tauri/src/tray.rs` | `src-tauri/src/lib.rs:setup_tray` | A | P4 | `FOUNDATION` |
| **F04** | Mascot / Interaction | Cursor gaze, Xyn gestures, pause/sleep, wardrobe | `windows/src/mochi/engine.ts` | `packages/xyn` (read-only), `src/core/guardian.mjs` | A | P4 | `FOUNDATION` |
| **F05** | Agents / Hooks | Hook detection, opt-in install, backup, uninstall | `windows/src-tauri/src/agent_hooks.rs` | `src-tauri/src/agent_ipc/provider.rs`, `relay.rs` | A | P1 | `VERIFIED` |
| **F06** | Agents / Providers | Claude Code live events, approvals, question prompts | `windows/src-tauri/src/claude.rs` | `src-tauri/src/agent_ipc/event.rs`, `approval.rs` | A | P1 | `FOUNDATION` |
| **F07** | Agents / Providers | Codex live events & approval (fail-closed) | `windows/src-tauri/src/codex_plan.rs` | `src-tauri/src/agent_ipc/event.rs`, `provider.rs` | A | P1 | `UNVERIFIED-CONTRACT` |
| **F08** | Agents / Providers | Gemini CLI live events & tool run telemetry | `windows/src-tauri/src/agents.rs` | `src-tauri/src/agent_ipc/event.rs` | A | P1 | `FOUNDATION` |
| **F09** | Agents / Providers | Antigravity live events, named pipe IPC | `windows/src-tauri/src/pipe.rs` | `src-tauri/src/agent_ipc/pipe.rs`, `relay.rs` | A | P1 | `VERIFIED` (Historical E4) |
| **F10** | Agents / Providers | Cursor, Copilot, Muse, OpenCode, Amp, Hermes catalog | `windows/src/island/agents.ts` | `src-tauri/src/agent_ipc/provider.rs` | B | P5 | `FOUNDATION` |
| **F11** | Agents / Core | Multi-session, subagent, lifecycle, notifications | `windows/src-tauri/src/pipe.rs` | `src-tauri/src/agent_ipc/session.rs`, `session-store.mjs` | A | P1 | `VERIFIED` |
| **F12** | Developer / Diff | File-change ticker and bounded diff preview | `windows/src/views/diff.ts` | `src-tauri/src/developer.rs`, `main.ts` | A | P3 | `VERIFIED` |
| **F13** | Developer / Tools | Open actual terminal/editor session | `windows/src-tauri/src/platform/windows.rs` | `src-tauri/src/developer.rs:open_in_editor/terminal` | A | P4 | `VERIFIED` |
| **F14** | Telemetry / Quota | Claude/Codex usage limits & authentic token telemetry | `windows/src/views/usage.ts` | `src-tauri/src/agent_ipc/event.rs`, `session-store.mjs` | A | P4 | `VERIFIED` |
| **F15** | AI Chat / Core | AI Chat providers (streaming, multi-turn, strict models) | `windows/src-tauri/src/chat.rs` | `src-tauri/src/lib.rs:invoke_ai_proxy`, `ai-chat.mjs` | A | P3 | `VERIFIED` |
| **F16** | Security / Auth | Secure credentials and model discovery | `windows/src-tauri/src/secrets.rs` | `src/core/provider-credentials.mjs`, `lib.rs` | A | P1 | `FOUNDATION` |
| **F17** | Clipboard / Core | In-memory clipboard text/image history, lossless PNG | `windows/src-tauri/src/platform/windows.rs` | `src-tauri/src/clipboard.rs`, `clipboard.mjs` | A | P3 | `VERIFIED` |
| **F18** | Clipboard / UI | Clipboard preview, search, pin, restore, clear | `windows/src/views/dom.ts` | `src/core/clipboard.mjs`, `main.ts` | A | P3 | `VERIFIED` |
| **F19** | Files / DragDrop | File drag/drop to Xyn, RFC 4180 CSV, native Explorer drop | `windows/src-tauri/src/files.rs` | `src-tauri/src/lib.rs:read_dropped_file`, `files.mjs` | A | P4 | `VERIFIED` |
| **F20** | Media / Control | Windows media/Spotify playback, master volume | `windows/src-tauri/src/spotify.rs` | `src-tauri/src/media.rs`, `volume.rs`, `media.mjs` | A | P3 | `VERIFIED` |
| **F21** | Integrations / Git | GitHub PR/CI/reviews and workspace detection | `windows/src-tauri/src/github.rs` | `src-tauri/src/github.rs`, `integrations.mjs` | A | P4 | `VERIFIED` |
| **F22** | Integrations / Cloud | Connected services health (Vercel, Notion, n8n, etc.) | `windows/src-tauri/src/integrations.rs` | `src-tauri/src/integrations.rs`, `integrations.mjs` | B | P5 | `VERIFIED` |
| **F23** | Speech / Flow | Flow offline dictation, push-to-talk, WinRT recognizer | `windows/src-tauri/src/flow/mod.rs` | `src-tauri/src/flow.rs`, `src/core/flow.mjs` | B | P5 | `VERIFIED` |
| **F24** | Speech / Flow | Flow dictionary, snippets, cleanup, statistics | `windows/src/hub/pages/words.ts` | `src-tauri/src/flow.rs`, `src/core/flow.mjs` | B | P5 | `VERIFIED` |
| **F25** | Audio / Voice | Notetaker consented recording and transcription (WASAPI) | `windows/src-tauri/src/notes/mod.rs` | `src-tauri/src/voice.rs`, `main.ts` | B | P5 | `VERIFIED` |
| **F26** | Audio / Voice | Voice commands and voice-enabled Xyn | `windows/src-tauri/src/voice/brain.rs` | `src-tauri/src/voice.rs`, `voice-commands.mjs` | B | P5 | `VERIFIED` |
| **F27** | Recap / Export | Weekly Recap and SVG share/export | `windows/src-tauri/src/recap.rs` | `packages/xyeena-recap`, `main.ts` | A | P4 | `VERIFIED` |
| **F28** | Design / I18n | Localization (EN/ID), accessibility, reduced motion | `windows/src/i18n/i18n.ts` | `src/core/i18n.mjs`, `style.css` | A | P2 | `VERIFIED` |
| **F29** | Companion / Mobile | Android local secure pairing / approvals | `windows/src-tauri/src/phone_link/mod.rs` | `src-tauri/src/companion.rs` | C | N/A | `DEFERRED` |
| **F30** | Design / Icons | Icon design migration to Phosphor typed registry | `windows/src/views/icons.ts` | `src/core/icons.mjs`, `tests/icons.test.mjs` | A | P2 | `VERIFIED` |
| **F31** | Legacy Cleanup | Removal of obsolete manual meeting timer | `windows/src-tauri/src/lib.rs` | Removed in `bdecbd1`; zero residual timer references | A | P0 | `VERIFIED` |
| **F32** | Legacy Cleanup | Removal of obsolete Activity tab UI | `windows/src/island/island.ts` | Removed in `bdecbd1`; replaced by Agents panel | A | P0 | `VERIFIED` |
| **F33** | Performance | WebView2 CPU/memory stability and suspension | `windows/src-tauri/src/lib.rs` | Idle canvas suspension & volume polling throttle | A | P0 | `VERIFIED` |
| **F34** | Packaging | Windows NSIS installer, uninstall, release audit | `windows/src-tauri/tauri.conf.json` | `scripts/release-audit.mjs`, NSIS bundle | A | P6 | `VERIFIED` |
| **G01** | Desktop Companion | Detached floating pet window (`mochi.html`) | `windows/src-tauri/src/desktop.rs` | Excluded by design invariant D7 (notch-only) | C | N/A | `EXCLUDED` |
| **G02** | Hub Window | Standalone 640x720 Hub window (`index.html#hub`) | `windows/src-tauri/src/lib.rs:645` | Single-window modular settings default (D3 pending) | C | N/A | `DEFERRED` |
| **G03** | Phone Link Messaging | Phone Link WhatsApp Gateway / Direct Messaging | `windows/src-tauri/src/phone_link/chat.rs` | Excluded from current scope per D6 | C | N/A | `SKIPPED` |
| **G04** | Integrations | Crypto portfolio tracker | `windows/src/views/integrations.ts` | Excluded from current scope per D6 | C | N/A | `SKIPPED` |
| **G05** | Voice / Wake | Voice wake word engine (`voice/wake.rs`) | `windows/src-tauri/src/voice/wake.rs` | Excluded from current scope per D13 / SA7 | C | N/A | `EXCLUDED` |
| **G06** | Speech / Pill | Dedicated dictation floating pill window | `windows/src-tauri/src/flow/pill.rs` | Integrated into stationary notch island | A | P5 | `WIRED` |
| **G07** | Settings Window | Dedicated standalone settings window (`settings.html`) | `windows/src-tauri/src/lib.rs:669` | Single-window modular settings in main window (D3) | B | P2 | `FOUNDATION` |
