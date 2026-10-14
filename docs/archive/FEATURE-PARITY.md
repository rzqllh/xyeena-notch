> **Update for 0.6:** This document is a historical v0.5 design matrix. See [current source-based Coucou capability audit](COUCOU-CAPABILITY-AUDIT.md) for corrected implementation statuses and release gates.

# Xyeena Island — Coucou feature audit and adaptation plan

Updated 13 October 2026. Upstream Windows documentation inspected at [`Louis-CFM/coucou@71b773f`](https://github.com/Louis-CFM/coucou/tree/71b773f08101237e1ec950efdaee17a626c830e6/windows). This **does not** mean Xyeena has every listed feature or should duplicate Coucou's product/visual identity.

**Status vocabulary:** `IN` implemented in existing v0.4 / v0.5 source, Windows acceptance may still be pending; `PARTIAL` limited implementation; `PLANNED` design milestone; `GATED` requires explicit permission, additional security tests or platform support; `NO` should not be copied. All code/asset licenses assessed separately.

| Capability in Coucou (Windows unless stated) | Xyeena interpretation | State | Gate / priority |
| --- | --- | --- | --- |
| Always-on-top, no taskbar, tray open/hide/quit | Native compact/expanded shell | IN | Validate fullscreen, monitor swap and sleep |
| Hidden wake strip / pointer hover | Xyeena wake strip | IN | Windows hit-test; hidden click-through |
| Expand/collapse spring | Original UI on attributed MIT motion math | IN | Measure P95 presentation and 60/120 Hz |
| Pinned approvals | Pinned user-selected view (not approvals yet) | PARTIAL | Approval lifetime semantics before runtime wiring |
| Multimonitor positioning and focus | Center/recenter | PARTIAL | DPI, unplug, RDP, taskbar relocation |
| Sleep/park idle rendering | CSS compositor idle mascot | PARTIAL | CPU/GPU idle benchmarks |
| Native tray with Pause, Settings and Recap | Broader Xyeena control menu | PLANNED | Pause must stop all network/polling |
| Configurable global shortcuts | User-remappable commands | GATED | Collision scan and AltGr safeguard |
| Animated mascot with gestures, costume, sleep | **Original** faceted Xyeena Fold, reactive to explicit events | PARTIAL | Custom rig; no Mochi visuals or dance choreography |
| Drag companion onto desktop | Distinct optional desktop widget | PLANNED | Click-through and drag safety |
| User sound overrides and audio cues | Optional own sound theme, muted by default | PLANNED | Original/CC0 audio only, accessible mute |
| Claude Code sessions via hooks | Opt-in scoped Xyeena native event adapter | GATED | Diff preview, backup/uninstall, localhost-only relay |
| Codex, Copilot, Muse, Gemini, Antigravity, Cursor hooks | One adapter per provider | GATED | No cross-runtime guessed permissions |
| OpenCode, Amp, Hermes integrations | Opt-in plugin adapters | GATED | Per-plugin installation permission |
| Pending approval Allow/Deny | Confirm/deny with per-request identity and expiry | GATED | Fail closed, timeout, idempotence, exact acknowledgment |
| Agent questions and options | Structured multi-answer card | GATED | Same-session validation and answer schema |
| Completed agent task summary | Xyeena run completion event | PARTIAL | Currently only read-only run snapshot feed |
| Live tool steps | Bounded event stream | PLANNED | Privacy, throughput and log redaction |
| File edits ticker and diff viewer | Local-only diff preview | GATED | Max bytes/lines, exact file identity, secure path |
| Open terminal/editor at session | Open target editor via opt-in action | GATED | No arbitrary shell commands or URI injection |
| Install hook preview + backup + selective uninstall | Xyeena-native config installer | GATED | Must not silently alter `.claude`, `.codex`, etc. |
| Relay does not block parent agents | Bounded IPC worker | GATED | 300ms fail-safe, no auto-permit |
| Main tool + optional pills | Compact Xyeena workspaces, only active sources | PLANNED | Don't clone pill positioning |
| Claude and Codex plan usage | Optional local CLI-readable usage | GATED | Auth boundaries, opt-in and user-provided tools |
| Weekly recap / metrics | Local privacy-preserving run recap | PLANNED | Off/clear controls, no prompts/paths in shared image |
| Clipboard/share recap card | Native export controls | PLANNED | Sanitize and redact project names |
| Language choices and RTL | i18n of settings, status and notifications | PLANNED | EN/ID first, Arabic RTL later |
| Chat Claude/Gemini/OpenAI/OpenRouter | Provider adapter, no tool execution by default | GATED | Keys in Credential Manager, model picker, consent |
| Ollama/LM Studio/OpenAI-compatible local | Offline-first local LLM channel | GATED | SSRF/localhost restrictions, streaming and stop |
| Local chat Markdown with safe links | Sanitized render pipeline | GATED | No HTML injection or unsafe protocols |
| User drag-drop file to chat | Scoped attach with preview | GATED | Size/type/path bounds; never auto-upload |
| GitHub PR, CI, review cards | Optional GitHub integration | GATED | OAuth/token scopes, caching, rate limits |
| Vercel / deployment alerts | Optional connector with capability boundaries | GATED | Secrets and deployment budget |
| Notion / Cal.com / Stripe / Resend / n8n | Modular provider cards; only if demand exists | GATED | Per-provider APIs, licenses, privacy, opt-in |
| Spotify (Linux, MPRIS) | OS-appropriate session integration | GATED | Windows GSMTC different; no false parity |
| Windows playback sessions | Multiple GSMTC player sources | IN | Verify specific app implementations |
| Teams or Zoom meeting presence | Separate call integration | GATED | Not exposed by GSMTC; Graph/consent or OS-native signals |
| Read-only Xyeena runs | Read selected `.xyeena/runs` snapshots | IN | User-selected projects, bounded output |
| Notification toast and history | Opt-in run status alerts; local test event | IN | Installed-app identity and OS smoke test |
| Autostart | User switch, default off | GATED | Proper uninstall behavior |
| Window theming + reduced motion | System/light/dark and reduced motion | IN | High contrast/accessibility smoke |
| Accent matching, vibrancy | System color and opaque fallback | PLANNED | Contrast + Windows GPU performance tests |
| Local app update/release installer | Signed or clearly warned Windows distribution | GATED | NSIS/MSI signing and rollback tests |
| Phone/Android remote control | Independent optional companion project | GATED | Strong pairing, encryption, revocation; not MVP |
| Online relay/push notifications | Explicit optional future module | GATED | End-to-end threat model and privacy |
| Character name, icon, sounds and media from Coucou | **Never ship** | NO | Protected by upstream LICENSE-ASSETS.md |

## Delivery order — dependency-first

- **P0 — Windows native shell quality:** baseline native build, click-through, multi-monitor/DPI and stable frame-time telemetry. Improve UI without claiming 60 FPS from pure timing tests.
- **P1 — Xyeena identity and activity:** original Fold mascot and state mapping, per-source workspaces, local event feed, user-configured visibility and accessibility.
- **P2 — Agent adapters:** Xyeena-signed event schema and read-only relay; gated authorization/approval work only after same-user validation, expiry and CLI acknowledgment tests.
- **P3 — Productivity integrations:** opt-in GitHub, calendar and selected integrations, streaming local chat, secure storage; individual provider QA and explicit outbound traffic disclosure.
- **P4 — Advanced experience:** recaps, editable global hotkeys, file drop/diffs, language packs, desktop mascot, optional audio; signed Windows release.
- **P5 — Cross-platform and mobile:** Linux differences and mobile pairing as separate projects; no Coucou assets or unpublished/unstable APIs.

## Rules before claiming parity

1. A feature is not complete until it has automated tests **and Windows acceptance** where native APIs are involved.
2. Permission and agent hooks cannot be inferred from read-only run snapshots.
3. No premium, noncommercial, restricted, or ambiguous asset bundled on a guess; keep proof of source URL, creator, revision, license and actual file hash.
4. Xyeena design grammar and character identity must remain distinct from Coucou; MIT source code reuse does not license Coucou/Mochi branding.
5. No mock integration UI advertised as live. Display explicit `Unavailable`, `Not connected` or `Requires permission` when appropriate.

### Unconnected adapter foundation in this stage

`src/core/agent-events.mjs` defines a small allowlisted, privacy-safe event projection and exact-id/expiry decision preflight. It is **not wired** to any agent runtime, IPC listener, hook file, or approval button. These unit tests are prerequisite scaffolding only; live integration remains GATED.
