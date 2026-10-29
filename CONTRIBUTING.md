# Contributing to Xyeena Notch

This repository hosts the Windows-first desktop Island companion (`apps/xyeena-island`) and the canonical Xyn Lion Guardian mascot package (`packages/xyn`).

---

## 1. Development Principles

- **Windows-First Native Experience:** The application is built for Windows 10/11 using Tauri 2. Ensure native Win32 window behaviors, topmost positioning, and tray operations are tested.
- **Strict Privacy & Local-First Boundaries:**
  - Never store API keys or secrets in `localStorage`, files, or persistent disk storage. All credentials must use in-memory session handling.
  - Clipboard history must remain opt-in and in-memory only.
  - Zero telemetry, tracking pixels, or background listeners.
- **Clean Architecture & Small Changes:** Make focused, minimal edits. Avoid broad framework additions or unnecessary abstractions.
- **Licensing & Asset Provenance:** All mascot art, icons, and UI are original Xyeena designs. Spring mathematics are adapted from Coucou under MIT; no Coucou or Mochi restricted assets may be added.

---

## 2. Setting Up Your Environment

### Prerequisites
- Node.js 22.14.0 or newer
- Rust stable (`x86_64-pc-windows-msvc`)
- Visual Studio 2022 Build Tools (with C++ desktop development workload)
- Windows 10/11 SDK

### Setup Commands
```powershell
# Clone the repository
git clone https://github.com/rzqllh/xyeena-notch.git
cd xyeena-notch

# Install locked monorepo dependencies
npm ci

# Run verification suite
npm test
npm run build
npm run doctor

# Start local Tauri dev instance
npm run desktop
```

---

## 3. Code Standards & Verification

Before opening a pull request or submitting code, ensure all local verification gates pass:

```powershell
# 1. Monorepo automated test suite (105 tests)
npm test

# 2. Release integrity audit
npm run release:audit

# 3. Rust formatting and clippy
cd apps/xyeena-island/src-tauri
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
cd ../../

# 4. Whitespace and Git check
git diff --check
```

---

## 4. Pull Request Guidelines

- Branch names should follow conventional prefix format: `feat/`, `fix/`, `docs/`, `refactor/`.
- PR titles should follow Conventional Commits (e.g. `feat(island): add ...`, `fix(mascot): resolve ...`).
- PRs must maintain lockfile integrity: do not modify `package-lock.json` or `Cargo.lock` unless adding or updating vetted dependencies.
