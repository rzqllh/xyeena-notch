# Engineering Worklog — Parity Rebuild

Internal running engineering worklog for tracking reads, changes, observations, and anomalies across phases.

---

## Phase 0: Verified Audit & Ledger Baseline (2026-10-20)

### 1. What was read:
- `GOAL-LAUNCHER.md`, `00-MASTER-CONTRACT.md`, `README-PACK.md`, `REVISION-NOTES.md`, and `01-PHASE-0-AUDIT.md`.
- Legacy audit tracker `.xyeena/plans/coucou-parity/03-PARITY-LEDGER.md` (F01–F34).
- Pinned upstream Coucou Windows 0.5.0 clone (`841a81ce1d75b65882b30139e6b716d0837dce30`) under `$env:TEMP\coucou-upstream`.
- `apps/xyeena-island/src/main.ts` (3,839 lines), `apps/xyeena-island/src/style.css` (2,611 lines), `apps/xyeena-island/index.html` (13 lines).
- `apps/xyeena-island/src-tauri/src/agent_ipc/{approval,event,framing,mod,pipe,provider,session}.rs`.
- `apps/xyeena-island/src-tauri/src/bin/relay.rs`, `developer.rs`, `voice.rs`, `flow.rs`, `clipboard.rs`, `media.rs`, `volume.rs`, `github.rs`, `integrations.rs`, `companion.rs`, `ai_diagnostics.rs`, and `lib.rs`.
- `apps/xyeena-island/src-tauri/capabilities/default.json` and `tauri.conf.json`.

### 2. What was changed:
- Created branch `chore/p0-parity-audit` from clean baseline `5fcad08285633f11ef5992ef6d4eaf6ac4174a0b`.
- Created `docs/parity/BASELINE.md` capturing toolchain versions, test execution tails, and CI run records.
- Created `scripts/measure-resources.ps1` and `docs/parity/BASELINE-RESOURCES.md` measuring host Rust process (20.04 MB WS / 8.21 MB private) vs full WebView2 process tree (220.82 MB WS / 254.13 MB private).
- Created `docs/parity/CONTRADICTIONS.md` documenting 10 specific claims vs actual code reality.
- Created `docs/parity/SECURITY-FINDINGS.md` verifying S1–S9 with code locations and severities.
- Created `docs/parity/UI-AUDIT.md` analyzing scroll ownership (confirming L3 `#page-activity` clip), 24 Phosphor icons, 109 inline styles, token inventory, and a11y.
- Created `docs/parity/DECISIONS-NEEDED.md` and `docs/parity/DECISION-SOURCES.md` tracking open approvals (D3) and scope locks.
- Created `docs/parity/ID-MAP.md` mapping 34 seed IDs (F01–F34) and 7 extended IDs (G01–G07).
- Created `docs/parity/test-manifest.json` recording 287 passing tests tied to commit `5fcad08`.
- Created `scripts/verify-ledger.mjs` with comprehensive schema validation, test proof enforcement, path existence verification, 6 automated negative tests, and Markdown generation.
- Created `docs/parity/ledger.json` and generated `docs/parity/LEDGER.md`.
- Updated `package.json` with `ledger:verify` script and wired into `npm run check`.
- Updated `.github/workflows/ci.yml` with `npm run ledger:verify` in the `source` job.

### 3. What surprised me:
1. **Coucou Windows Multi-Window Architecture:** Upstream Coucou creates separate secondary windows via `WebviewWindowBuilder` for Desktop companion (`mochi.html`), Dictation (`pill.html`), and Hub (`index.html#hub`), whereas Xyeena Notch is engineered as a single stationary window (`#island`). Upstream `show_settings_window` in Coucou is actually `show_hub(app, Some("general"))` rather than a separate `settings.html` window.
2. **Memory Footprint Boundary:** The native Rust host process is remarkably compact (20.04 MB Working Set, 8.21 MB Private Bytes), easily clearing the 40 MB target. However, the Chromium WebView2 runtime process tree adds 7 child processes totaling ~220.82 MB Working Set. Previous claims of "<40 MB" only apply to the Rust host.
3. **Scroll Ownership Inconsistency:** `#page-now` correctly has `overflow-y: auto`, but `.page` has `overflow: hidden`, meaning `#page-activity` (Agents panel) completely clips multi-agent session cards and the event history on desktop viewports.
4. **Custom Command Exposure:** While `capabilities/default.json` appears restrictive, Tauri 2's `core:default` enables `invoke` on all 35 custom commands registered in `lib.rs`, meaning the WebView has access to file reads, audio recording, process spawning, and hook writing without per-command origin checks.

---

## Phase 1: Core P0 — Session Identity, Approval Pipeline, Credentials, & Pipe Hardening (2026-10-20)

### 1. What was read:
- `02-PHASE-1-CORE-P0.md`, `00-MASTER-CONTRACT.md`, ADR templates (`docs/adr/`).
- `apps/xyeena-island/src-tauri/src/agent_ipc/{approval,event,pipe,session}.rs`.
- `apps/xyeena-island/src-tauri/src/bin/relay.rs` and `apps/xyeena-island/src-tauri/src/lib.rs`.
- `apps/xyeena-island/src/core/{session-store.mjs,provider-credentials.mjs}`.

### 2. What was changed:
- **ADRs Written:**
  - `docs/adr/0002-credential-storage.md`: OS Credential Manager for Windows (`xyeena-island:<provider>`), in-memory zeroizing fallback, release build rejection of `.env*` files, zero plaintext secret leakage to JS.
  - `docs/adr/0003-activity-state-model.md`: Pure state reducer `reduce(state, event, now_ms)` with injected clock, 7 activity states, EN/ID bilingual copy keys, timing constants (`T_recent=8s`, `T_stalled=120s`, `T_ttl=10min`).
- **Native Modules Created & Hardened:**
  - `src-tauri/src/credentials.rs`: Windows Credential Manager integration (`CredWriteW`, `CredReadW`, `CredDeleteW`), `ZeroizingSecret` fallback, redaction on format, unit tests.
  - `src-tauri/src/settings_store.rs`: Atomic `.tmp` + rename persistence, v0 schema migration, alias sanitization.
  - `src-tauri/src/agent_ipc/limits.rs`: Enforced limit constants (`MAX_LIVE_SESSIONS = 16`, `TIMELINE_RING_BUFFER_CAP = 200`, `ARM_DELAY_MS = 600`, `APPROVAL_TTL_MS = 120_000`, `MAX_FRAME_SIZE_BYTES = 256KB`).
  - `src-tauri/src/agent_ipc/state_machine.rs`: Pure state reducer with transition guards and unit tests.
  - `src-tauri/src/agent_ipc/dto.rs`: Strict outbound telemetry boundary. Complete exclusion of `raw` payloads and `tool_input`. Control character stripping, canary/secret redactor, length limits.
  - `src-tauri/src/agent_ipc/session.rs`: Collision-free display names (`#<4>` and `#<6>`), manual focus pin, attention counter, timeline ring buffer.
  - `src-tauri/src/agent_ipc/approval.rs`: Fail-closed approval registry. Separation of `provider_request_id` vs `internal_request_id`, 600ms armed delay misclick guard, native CSPRNG nonces, exactly-once execution, rejection of non-interactive providers without fake execution. All 12 W4.7 table-driven tests pass.
  - `src-tauri/src/agent_ipc/pipe.rs`: Explicit current-user SID extraction and SDDL `D:P(A;;GRGW;;;<SID>)`, FrameBuffer fuzzing tests.
  - `src-tauri/src/bin/relay.rs`: Ingestion redaction, `--capture` flag strictly guarded by `XYEENA_CAPTURE=1`.
  - `src-tauri/tests/relay_integration.rs`: Isolated E2E integration test using `CARGO_BIN_EXE_xyeena-agent-relay`.
  - `tests/fixtures/agent-payloads/antigravity/`: 6 sanitized real payloads with `.meta.json` sidecars.
  - `src-tauri/src/lib.rs`: Exposed native commands (`credential_*`, `settings_*`), updated `get_agent_sessions` and approvals to return sanitized DTOs.
- **Frontend JS Wiring:**
  - `apps/xyeena-island/src/core/session-store.mjs` & `.d.mts`: Updated `hydrateSessions` to consume `SessionDto` (`activityState`, `displayName`, `attention`, `timeline`, `touchedFiles`).
  - `apps/xyeena-island/src/core/provider-credentials.mjs`: Added native `saveCredential`, `forgetCredential`, and `checkStatus` methods.
- **CI & Audit Documentation:**
  - `.github/workflows/ci.yml`: Tightened timeouts (`source: 15m`, `native: 45m`).
  - `docs/parity/CAPABILITIES.md`: Documented window definitions, custom command allowlist, plugin permissions, and README claims audit.
  - `docs/parity/ledger.json`: Updated F16 to VERIFIED, updated F09 and F11 test links.
  - `docs/parity/LEDGER.md`: Regenerated via `npm run ledger:verify`.

### 3. What surprised me:
1. **Zero-Token Credential Boundary:** Delegating credential persistence entirely to Windows Credential Manager allows JavaScript to operate without holding persistent API keys in memory or localStorage.
2. **Misclick Timing Dynamics:** A 600ms armed delay is barely perceptible to human intent, but completely neutralizes accidental mouse clicks when an approval dialog pops up suddenly.
3. **Integration Test Binary Resolution:** In Cargo integration tests under `tests/`, `env!("CARGO_BIN_EXE_<name>")` provides a reliable absolute path to compiled binary targets regardless of target directory nesting.
