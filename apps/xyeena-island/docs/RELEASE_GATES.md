# Release Gates — 1.0.0-alpha.1

This document outlines the strict automated, security, visual, performance, packaging, and runtime acceptance gates required for the `1.0.0-alpha.1` Windows prerelease.

---

## 1. Automated Verification Gates (Blocking)

All automated checks must pass on a clean working tree from an immutable Git commit:

- [x] **Monorepo Lockfile Integrity:** `npm ci` installs cleanly with zero lockfile drift across all workspaces.
- [x] **Initial Workspace Audit:** `node scripts/audit-init.mjs` verifies package versions, canonical identities (`@xyeena/island`, `@xyeena/xyn`), and absence of stale build artifacts.
- [x] **Automated JavaScript/TypeScript Tests (105/105 PASS):**
  - `@xyeena/island`: 72/72 tests pass (DOM, runtime, clipboard, media, AI chat, notifications, layout constraints).
  - `@xyeena/xyn`: 16/16 tests pass (engine, rig motion, expressions, wardrobe, reduced motion, gaze bounds).
  - `@xyeena/recap`: 14/14 tests pass (archive bounds, date calculation, event deduplication, SVG rendering).
  - `guardian-playground`: 3/3 tests pass (canonical mascot consumption, minimal desktop shell, static build).
- [x] **TypeScript Strict Compilation:** `tsc --noEmit` completes with zero type errors.
- [x] **Vite Web Production Bundle:** `vite build` builds the client bundle without warnings.
- [x] **Release Manifest Audit:** `npm run release:audit` verifies synchronized `1.0.0-alpha.1` versions across root `package.json`, `apps/xyeena-island/package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
- [x] **Rust Formatting:** `cargo fmt --all -- --check` passes with zero formatting diffs.
- [x] **Rust Clippy Linting:** `cargo clippy --locked --all-targets -- -D warnings` completes with 0 warnings.
- [x] **Rust Unit & Integration Tests (10/10 PASS):**
  - `xyeena_island_lib`: 10/10 tests pass (authority validation, query sanitization, cancellation registry, geometry bounds, metadata limits).
- [x] **Git Cleanliness:** `git diff --check` reports zero whitespace or newline anomalies.

---

## 2. Security & Privacy Gates (Blocking)

- [x] **Zero Secret Exposure:** Repository history and working tree scanned; zero API keys, personal access tokens, or private certificates exist.
- [x] **In-Memory Credential Safety:** BYOK API keys reside solely in `#keys` private heap memory and never touch `localStorage`, IndexedDB, or disk.
- [x] **Loopback AI Enforcement:** Local model endpoints (Ollama/LM Studio) are strictly validated to loopback addresses (`localhost`/`127.0.0.1`) and reject cloud credentials.
- [x] **3xx Redirect Rejection:** Native curl transport fails closed on HTTP 3xx redirect responses.
- [x] **Clipboard Privacy:** Clipboard observation defaults to OFF; history buffer is bounded to 64 MiB total and wipes completely on session exit.
- [x] **Read-Only Project Boundary:** Run summaries only read `.xyeena/runs/*/snapshot.json`; no file mutation or script execution privileges exist.

---

## 3. Visual & Mascot Integration Gates (Blocking)

- [x] **Stationary Top Notch Framing:** Island docks to top center display without horizontal drift.
- [x] **Expanded Mascot Integration:** Xyn Lion framed inside a 54×54px area in the 58px header, anchored with a clean physical contact shadow.
- [x] **No Overlapping Artifacts:** Eliminated unclipped 500-radius blue radial halo and oversaturated floor glow. No bleeding into notch shoulder wings or navigation tabs.
- [x] **WCAG AA Contrast:** Typography verified in Dark (`--text: #f0f3f6`) and Light (`--text: #1b232c`) themes.
- [x] **Dual Theme Visual Verification:** Verified via automated browser screenshots in both Dark and Light themes.

---

## 4. Performance & Rendering Gates (Blocking)

- [x] **Gradient Caching:** Linear and radial gradients cached via `WeakMap` per context, eliminating Direct2D brush allocations on every frame.
- [x] **Wash Geometry Bounded:** Replaced 8000×8000 polygon with tight 1100×1100 quad enclosing the 1000×1000 design space.
- [x] **Adaptive Frame Pacing:** Idle breathing throttled to ~30 FPS; bursts to 60 FPS during user interactions or active emotes.
- [x] **Multi-Instance Suspension:** Inactive guardian slots suspended (`stop()`); only the visible mode's canvas loop runs.
- [x] **Pointer Event Hygiene:** Global pointermove listeners skip geometry calculations when the mascot canvas is paused.

---

## 5. Packaging & Distribution Gates

- [x] **Unsigned NSIS Installer:** Bundles only the single `main` Island window; no duplicate desktop windows or debug schemas.
- [x] **Checksum Integrity:** `SHA256SUMS.txt` generated alongside the installer binary.
- [x] **GitHub Release Workflow:** `.github/workflows/release.yml` triggers via authenticated `workflow_dispatch` requiring an annotated `v1.0.0-alpha.N` tag.
- [ ] **Windows SmartScreen Notice:** Prerelease installer is unsigned; user must be informed of the Windows SmartScreen notice.

---

## 6. Manual Windows Runtime Gates (Recorded Status)

The following items are physically validated or recorded as PENDING for physical hardware testing:

| Gate | Status | Evidence / Notes |
|---|---|---|
| Single Notch Window | PASS | Tauri config enforces 1 window (`main`), `skipTaskbar: true`, `transparent: true`. |
| Tray Minimize / Restore | PASS | Win32 tray icon restored and functional. |
| GSMTC Media Transport | PASS | Tested with Windows media sessions (Spotify/Edge). |
| Master Volume Endpoint | PASS | Verified with Core Audio default endpoint. |
| In-Memory Clipboard Lifecycle | PASS | Tested across mode collapse/expand; verified memory wipe on exit. |
| Windows Toast Alerts | PASS | User opt-in verified; alerts recorded in Activity feed. |
| Multi-Monitor / DPI 125%-200% | PENDING | Canvas DPR logic uses `Math.min(3, devicePixelRatio)`; physical multi-DPI monitor validation pending user hardware. |
| Teams Native Call Auto-Detect | DEFERRED | Explicit roadmap item; manual meeting timer provided. |
