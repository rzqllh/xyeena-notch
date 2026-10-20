# Baseline Environment and Verification — Phase 0

Captured on 2026-10-20. Reference commit: `5fcad08285633f11ef5992ef6d4eaf6ac4174a0b` (branch `feat/windows-parity-xyn`, Draft PR #8).
Phase branch: `chore/p0-parity-audit`.

---

## 1. Environment & Toolchain (E2)

| Component | Verified Version / Metric | Command / Source |
|---|---|---|
| **Git Baseline HEAD** | `5fcad08285633f11ef5992ef6d4eaf6ac4174a0b` | `git rev-parse HEAD` |
| **Active Branch** | `chore/p0-parity-audit` (stacked from `feat/windows-parity-xyn`) | `git branch --show-current` |
| **Working Tree State** | Clean (prior to Phase 0 artifacts) | `git status --porcelain` |
| **Operating System** | Microsoft Windows 11 Pro `10.0.26300.0` (x64) | `[System.Environment]::OSVersion.VersionString` |
| **Node.js** | `v22.19.0` | `node -v` |
| **npm** | `11.13.0` | `npm -v` |
| **Rust Compiler** | `rustc 1.99.0 (b940084d7 2026-09-28)` | `rustc --version` |
| **Cargo** | `cargo 1.99.0 (5f94df478 2026-08-27)` | `cargo --version` |
| **WebView2 Runtime** | `155.0.4283.62` | `HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}` pv |
| **Display DPI & Scale** | Applied DPI: `96` (100% scale), 1920x1080 | `HKCU:\Control Panel\Desktop\WindowMetrics` AppliedDPI |

---

## 2. Test Execution Tails & Counts (E2 / E3)

### A. Island Workspace Tests (`npm test --workspace @xyeena/island`)
```text
# Subtest: parseVoiceIntent maps voice commands accurately
ok 137 - parseVoiceIntent maps voice commands accurately
  ---
  duration_ms: 3.1606
  type: 'test'
  ...
# Subtest: executeVoiceAction invokes appropriate context callbacks
ok 138 - executeVoiceAction invokes appropriate context callbacks
  ---
  duration_ms: 0.4534
  type: 'test'
  ...
1..138
# tests 138
# suites 0
# pass 138
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 6401.2551
```
- **Tests Passed:** 138 / 138
- **Exit Code:** 0

### B. Full Monorepo Check (`npm run check`)
Includes Island (138), Xyn (16), Recap (14), Guardian Playground (3), Vite build, Guardian browser preview build, and release audit.
```text
transforming...
✓ 44 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  0.46 kB │ gzip:   0.29 kB
dist/assets/main-B64ioz3S.css   48.99 kB │ gzip:   9.14 kB
dist/assets/main-CoPmeUug.js   512.96 kB │ gzip: 119.52 kB
✓ built in 804ms

> xyeena-notch@1.0.0-alpha.1 build:guardian
> node examples/guardian-playground/scripts/build.mjs

Guardian browser-only preview created in C:\Users\Hafizh Rizqullah\Documents\Code\_active\xyeena-notch\examples\guardian-playground\dist

> xyeena-notch@1.0.0-alpha.1 release:audit
> npm run release:audit --workspace @xyeena/island

INFO local ignored directory or file exists: node_modules (do not commit it)
INFO local ignored directory or file exists: src-tauri/target (do not commit it)
INFO local ignored directory or file exists: dist (do not commit it)
PASS release audit: 1.0.0-alpha.1 manifests, licenses, two lockfiles and notch-only packaging intent
```
- **Monorepo JS Tests:** 171 / 171 passed (138 island, 16 xyn, 14 recap, 3 playground)
- **Exit Code:** 0

### C. Rust Formatting Check (`cargo fmt --all -- --check`)
- Command: `cd apps/xyeena-island/src-tauri; cargo fmt --all -- --check`
- **Output:** Clean (no formatting diffs)
- **Exit Code:** 0

### D. Rust Clippy (`cargo clippy --locked --all-targets -- -D warnings`)
```text
    Checking xyeena-island v1.0.0-alpha.1 (C:\Users\Hafizh Rizqullah\Documents\Code\_active\xyeena-notch\apps\xyeena-island\src-tauri)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 28.35s
```
- **Warnings / Errors:** 0
- **Exit Code:** 0

### E. Rust Unit & Integration Tests (`cargo test --locked`)
```text
test flow::tests::test_flow_engine_status_is_local_only ... ok
test flow::tests::test_winrt_speech_recognizer_availability ... ok
test voice::tests::test_wasapi_audio_client_initialization ... ok
test voice::tests::test_wasapi_real_audio_capture_frames ... ok

test result: ok. 116 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.50s

     Running unittests src\bin\relay.rs (target\debug\deps\xyeena_agent_relay-dcb1da28906fe1bd.exe)

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

     Running unittests src\main.rs (target\debug\deps\xyeena_island-79dd7e02586fb5aa.exe)

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

   Doc-tests xyeena_island_lib

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```
- **Tests Passed:** 116 / 116
- **Exit Code:** 0

---

## 3. Total Verified Test Counts

| Test Suite | Framework / Runner | Passed | Failed | Skipped |
|---|---|---|---|---|
| `@xyeena/island` | `node:test` | 138 | 0 | 0 |
| `@xyeena/xyn` | `node:test` | 16 | 0 | 0 |
| `@xyeena/recap` | `node:test` | 14 | 0 | 0 |
| `guardian-playground` | `node:test` | 3 | 0 | 0 |
| `xyeena-island-lib` (Rust) | `cargo test` | 116 | 0 | 0 |
| **Monorepo Total** | Combined | **287** | **0** | **0** |

---

## 4. GitHub Actions CI Status (`gh run list`)

Recent workflow runs on base branch `feat/windows-parity-xyn`:
```text
completed  success   feat(parity): Windows 0.5.0 parity implementation and security hardening (F01-F34) [DRAFT]  Xyeena Notch CI  feat/windows-parity-xyn  pull_request  39222435675  10m21s   2026-10-19T08:23:36Z
completed  cancelled feat(parity): Windows 0.5.0 parity implementation and security hardening (F01-F34) [DRAFT]  Xyeena Notch CI  feat/windows-parity-xyn  pull_request  39213491185  1h13m1s  2026-10-19T07:02:55Z
completed  cancelled feat(parity): Windows 0.5.0 parity implementation and security hardening (F01-F34) [DRAFT]  Xyeena Notch CI  feat/windows-parity-xyn  pull_request  39208849502  48m25s   2026-10-19T06:15:18Z
completed  success   feat(parity): Windows 0.5.0 parity implementation and security hardening (F01-F34) [DRAFT]  Xyeena Notch CI  feat/windows-parity-xyn  pull_request  39192444407  12m24s   2026-10-19T02:58:23Z
completed  failure   feat(parity): Windows 0.5.0 parity implementation and security hardening (F01-F34) [DRAFT]  Xyeena Notch CI  feat/windows-parity-xyn  pull_request  39191934797  5m2s     2026-10-19T02:51:44Z
```

Latest Run Details (`39222435675`):
- **Commit:** `5fcad08285633f11ef5992ef6d4eaf6ac4174a0b`
- **Result:** SUCCESS
- **Jobs:**
  - `source`: 52s (Job ID 117960664603)
  - `native`: 9m22s (Job ID 117961015715)
- **Total Duration:** 10m21s
- **Artifact:** `xyeena-island-alpha-windows-unsigned`
