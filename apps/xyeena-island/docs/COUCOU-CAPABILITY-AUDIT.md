# Coucou → Xyeena capability audit (source-based)

Audited against [`Louis-CFM/coucou` at 71b773f](https://github.com/Louis-CFM/coucou/tree/71b773f08101237e1ec950efdaee17a626c830e6): `windows/README.md`, `windows/src/island/island.ts`, `windows/src/island/fsm.ts`, `windows/src/core/anim.ts`, `windows/src-tauri/src/lib.rs`, and `LICENSE-ASSETS.md`. **Coucou code is MIT; Coucou/Mochi names, characters, icons, sounds and media are reserved.** Xyeena never bundles them.

Status legend: **implemented** = source exists, **candidate** = source exists but native acceptance is pending, **planned** = no functioning integration yet, **out of scope** = intentionally not a Coucou replica.

| User capability | Coucou Windows reference | Xyeena Island 1.0.0-alpha.1 candidate | Contract / next acceptance |
| --- | --- | --- | --- |
| Island show, collapse, tray, topmost | `island.rs`, `island.ts` | Candidate | Verify top edge, fullscreen, multi-monitor DPI, click-through; measure true FPS. |
| Responsive motion | `core/anim.ts` springs | Candidate | Adapt math with MIT attribution; benchmark native `set_size` latency; not a 60 FPS claim. |
| Animated companion | Mochi (reserved asset) | Original Fold candidate | Original vector only; improve rig/emotes in separate asset license audit. |
| Media playback sessions | Windows reference lacks full Spotify controller | Candidate | Windows GSMTC: list, previous, play/pause, next, timeline, seek, shuffle, repeat; unsupported buttons must fail visibly. |
| Media volume / mute | Full Spotify volume on Linux MPRIS | Candidate | Windows default output master volume via Core Audio; **not** per-app volume. |
| Clipboard history | Recap Copy; no Coucou Windows general clipboard manager documented | Candidate | **Xyeena original feature**: opt-in text only, in-memory ≤25 items, no startup capture, Pause/Clear, no history sync. |
| Meetings / calls | No general Teams call presence API in media module | Manual meeting timer | Automatic presence requires Microsoft Graph permissions or supported native presence API; never infer from playback. |
| OS notifications | Coucou agent activity and alerts | Run change/toast | User opt-in, dedupe, include event history. |
| Multiple agent session pills | `agents.rs`, `hooks.rs`, README Supported agents | Planned | Capability-first agent registry, no hidden installs. |
| Permission approval / question | `hooks.rs` relay and agent-specific consent | Protocol validation only | Exact session+request+nonce+expiry, user decision, no auto-allow; original agent terminal fallback. |
| Live tool events and diffs | `agent_hooks.rs`, `hooks.rs`, `session_window.rs` | Planned | Bounded size, per-provider allowlist, user-opt-in relay, no secret journaling. |
| Claude, Codex, Gemini, Cursor, Antigravity, Copilot, OpenCode | `agents.rs`, `hooks.rs` | Planned | Hook-install preview, backup, rollback, individual agent scopes. |
| AI chat / BYOK | `chat.rs`, `openai_compat.rs`, `local_chat.rs` | Planned | Windows Credential Manager, API allowlist, model/provider selection, no implicit machine access. |
| Local AI (Ollama/LM Studio) | `local_chat.rs` | Planned | Localhost-only default; explicit remote URL approval. |
| File drop / attach / diff | `files.rs`, `webview_drop.rs`, `session_window.rs` | Planned | Paths not read until deliberate drag/drop and consent; size cap; no default upload. |
| Global shortcuts | `shortcuts.rs` | Planned | Conflicts, AltGr, scope and opt-in, no keylogging. |
| Plan usage | `codex_plan.rs`, README Plan usage | Planned | Only authoritative CLI/API data; never estimate a made-up quota. |
| Weekly recap | `recap.rs` | Planned | Local opt-in aggregate statistics; privacy controls and export. |
| GitHub CI / review | `github.rs` | Planned | Fine-grained read-only token; status refresh/backoff. |
| Vercel, Resend, Notion, Stripe, Cal.com, n8n and other services | `integrations.rs` | Planned | Add independently, with least-privilege tokens; no empty decorative cards. |
| Phone link, encrypted pairing, relays | `phone_link/` | Planned | Separate security review, explicit opt-in, pairing/revocation, no default listener. |
| Desktop-floating mascot, wardrobe | `desktop.rs`, `mochi/wardrobe` | New Xyeena concept planned | No upstream asset reuse; inspect separate window focus/cursor behavior. |
| Internationalization and accessible UI | `i18n.rs`, README Languages | Planned | English/Indonesian first, keyboard/focus and reduced motion. |
| Installer/updates, signatures | `pack.mjs`, Tauri bundle | Unsigned NSIS packaging configured; signing/update planned | Signed executable or candid SmartScreen warning; reversible updates. |
| Linux | `platform/`, README Linux | Planned after stable Windows | Linux Tauri constraints and Wayland-specific positioning. |

## Development sequence

1. **Native desktop reliability:** CI on Windows; fix native compile, frame pacing, click-through and monitor handling. This is a dependency for all background features.
2. **Core utilities:** multi-session media + Core Audio, opt-in clipboard, notifications, local project activity. The alpha candidate contains the APIs and UI, with native QA outstanding.
3. **Xyeena agent bridge:** explicit one-agent pairing first, event normalization, consent, rollback, and parity tests. Then expand other agent providers.
4. **Productivity:** secure BYOK chat, file drop, live diffs, shortcuts, GitHub, recaps, integrations; one validated slice at a time.
5. **Ecosystem:** original rig, mobile pairing, optional Linux, installer/update pipeline.

**Hard exclusions:** Never rebrand Coucou/Mochi assets, deploy unapproved agent hooks, promise Teams presence through GSMTC, ship fake providers, or silently capture all clipboard content.
