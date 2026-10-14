# Xyeena Notch — Smoke-Ready Alpha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a working, installable, and smoke-test-ready Xyeena Island Windows application (`1.0.0-alpha.1`) with the original Xyeena Guardian mascot integrated, polished native UI, hardened media/audio/clipboard controls, and complete verification.

**Architecture:** Monorepo with `@xyeena/island` (Tauri desktop app) consuming `@xyeena/mascot` as an npm workspace package. Native Rust backend handles Windows GSMTC media controls, Core Audio master volume, and top-center window placement. Frontend uses a restrained, Japanese-inspired design system with strict privacy boundaries.

**Tech Stack:** Tauri v2, Rust (windows 0.62), TypeScript, Vite, Vanilla CSS, Web Components (`<xyeena-guardian>`), NSIS.

## Global Constraints

- Fixed version: `1.0.0-alpha.1` across all manifests (`package.json`, `apps/xyeena-island/package.json`, `Cargo.toml`, `tauri.conf.json`).
- Do not bump versions, merge to main, force-push, or publish releases.
- Do not modify the separate `xyeena-agent` repository.
- Antislop rules apply: no em dashes outside docs carve-out (R-02), no generic AI buzzwords (R-16), WCAG AA contrast (R-25), no dead buttons (R-26), proper UI states (R-27), keyboard accessibility with visible focus (R-32), both light and dark themes functional (R-34), no script patching (R-33).
- Verification before completion: fresh command output required before asserting success.

---

### Task 1: Package Workspace Linking & Mascot Node Compatibility

**Files:**
- Modify: `packages/xyeena-mascot/src/guardian.js:1-15`
- Modify: `apps/xyeena-island/package.json:18-23`
- Test: `packages/xyeena-mascot/tests/engine.test.js`

**Interfaces:**
- Consumes: `@xyeena/mascot` exports (`XyeenaGuardian`, `defineXyeenaGuardian`, `GuardianController`, `pickMascotState`, `STATES`, `stateForEvent`)
- Produces: Safe imports in both Node.js (SSR/test) and browser environments without `ReferenceError: HTMLElement is not defined`.

- [ ] **Step 1: Write test for mascot module import in Node**
- [ ] **Step 2: Run test and observe failure**
- [ ] **Step 3: Update `packages/xyeena-mascot/src/guardian.js` to guard `HTMLElement`**
- [ ] **Step 4: Add `@xyeena/mascot` to `apps/xyeena-island/package.json` dependencies**
- [ ] **Step 5: Run tests and verify clean imports across workspaces**

---

### Task 2: Integrate Guardian Mascot into Island Core

**Files:**
- Modify: `apps/xyeena-island/src/core/mascot.mjs`
- Modify: `apps/xyeena-island/tests/mascot.test.mjs`
- Modify: `apps/xyeena-island/src/main.ts`

**Interfaces:**
- Consumes: `@xyeena/mascot` (`defineXyeenaGuardian`, `GuardianController`, `pickMascotState`, `stateForEvent`, `STATES`)
- Produces: `<xyeena-guardian>` rendered in compact bar and expanded header, dynamically driven by playback, meeting timer, local Xyeena run states, and notifications.

- [ ] **Step 1: Write unit tests in `apps/xyeena-island/tests/mascot.test.mjs` verifying Guardian state mapping**
- [ ] **Step 2: Update `src/core/mascot.mjs` to wrap canonical Guardian controller and event resolution**
- [ ] **Step 3: Update `src/main.ts` to register `defineXyeenaGuardian()` and mount `<xyeena-guardian>`**
- [ ] **Step 4: Wire event state transitions (idle, listening, working, attention, greeting, finished, sleeping)**
- [ ] **Step 5: Run `npm test` to verify all mascot tests pass**

---

### Task 3: Polish Island UI & Antislop Design System

**Files:**
- Modify: `apps/xyeena-island/src/style.css`
- Modify: `apps/xyeena-island/src/main.ts`

**Interfaces:**
- Consumes: CSS custom properties (`--base`, `--panel`, `--hover`, `--line`, `--text`, `--sub`, `--muted`, `--accent`, `--accent-text`, `--good`, `--focus`)
- Produces: Restrained Japanese-inspired UI, WCAG AA compliant contrast in both light and dark modes, no layout overflow at 100%/125%/150% scaling, visible focus outlines, no em dashes in copy.

- [ ] **Step 1: Audit and refine color palette, borders, typography, and spacing in `src/style.css`**
- [ ] **Step 2: Add styling for `<xyeena-guardian>` in compact and expanded header**
- [ ] **Step 3: Replace all em dashes (`—`) in UI copy with colons or parentheses per R-02**
- [ ] **Step 4: Verify contrast ratios (minimum 4.5:1 text, 3:1 large text) for both dark and light modes**
- [ ] **Step 5: Verify keyboard navigation (Tab, Shift-Tab, Enter, Space, Escape, Arrow keys)**
- [ ] **Step 6: Build frontend (`npm run build`) to confirm TypeScript and Vite compilation**

---

### Task 4: Windows Media & Master Volume Hardening

**Files:**
- Modify: `apps/xyeena-island/src-tauri/src/media.rs`
- Modify: `apps/xyeena-island/src-tauri/src/volume.rs`
- Modify: `apps/xyeena-island/src/core/media-sessions.mjs`
- Modify: `apps/xyeena-island/src/main.ts`
- Test: `apps/xyeena-island/tests/advanced-media.test.mjs`

**Interfaces:**
- Consumes: WinRT GSMTC session manager, Windows Core Audio `IAudioEndpointVolume`
- Produces: Robust media session selection, playback controls, volume slider with accurate master output percentage, and graceful fallback for unsupported player capabilities.

- [ ] **Step 1: Review and refine media error handling and capability detection**
- [ ] **Step 2: Ensure master volume reports and sets system default output with accurate feedback**
- [ ] **Step 3: Verify media tests pass with `cargo test --locked` and `npm test`**

---

### Task 5: Core Productivity & Privacy Boundaries Verification

**Files:**
- Modify: `apps/xyeena-island/src/core/clipboard.mjs`
- Modify: `apps/xyeena-island/src/core/notifications.mjs`
- Modify: `apps/xyeena-island/src/core/settings.mjs`
- Modify: `apps/xyeena-island/src/main.ts`
- Test: `apps/xyeena-island/tests/clipboard.test.mjs`
- Test: `apps/xyeena-island/tests/features.test.mjs`

**Interfaces:**
- Consumes: In-memory clipboard ring buffer, `@tauri-apps/plugin-notification`, `localStorage` settings
- Produces: Opt-in clipboard capture that starts disabled, in-app notification feed, safe `.xyeena/runs` parsing, and persisted settings.

- [ ] **Step 1: Verify clipboard starts disabled and clears on page hide/exit**
- [ ] **Step 2: Verify notification permission check and fallback**
- [ ] **Step 3: Verify read-only run snapshot parser rejects path traversal or oversized files**
- [ ] **Step 4: Run unit tests to verify privacy guarantees**

---

### Task 6: Full Monorepo Verification Matrix & Alpha Gates

**Files:**
- Run: `.\scripts\verify-alpha.ps1`

- [ ] **Step 1: Run `npm ci`**
- [ ] **Step 2: Run `npm run init:audit`**
- [ ] **Step 3: Run `npm test` across all workspaces**
- [ ] **Step 4: Run `npm run build` (TypeScript + Vite + Playground)**
- [ ] **Step 5: Run `npm run doctor`**
- [ ] **Step 6: Run `npm run release:audit`**
- [ ] **Step 7: Run `cargo fmt --all -- --check`**
- [ ] **Step 8: Run `cargo test --locked`**
- [ ] **Step 9: Run `cargo clippy --locked --all-targets -- -D warnings`**
- [ ] **Step 10: Run full `.\scripts\verify-alpha.ps1` with NSIS packaging**

---

### Task 7: Windows Smoke Test Candidate Packaging & Documentation

**Files:**
- Create: `docs/SMOKE-TEST-WINDOWS.md`
- Modify: `README.md`
- Modify: `docs/FEATURE_STATUS.md`
- Modify: `docs/RELEASE_GATES.md`
- Modify: `THIRD_PARTY_NOTICES.md`

- [ ] **Step 1: Verify NSIS installer generated in `apps/xyeena-island/src-tauri/target/release/bundle/nsis/`**
- [ ] **Step 2: Compute and document installer file size and SHA256 checksum**
- [ ] **Step 3: Author comprehensive `docs/SMOKE-TEST-WINDOWS.md` with 16 test scenarios**
- [ ] **Step 4: Update README and documentation to remove stale initialization notes and reflect current architecture**
- [ ] **Step 5: Verify clean Git status on `feat/smoke-ready-alpha`**
