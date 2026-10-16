# GitHub Prerelease Publication Guide

This document describes the exact procedure for packaging, verifying, and publishing an unsigned experimental Windows prerelease (`v1.0.0-alpha.1`) for `rzqllh/xyeena-notch`.

---

## 1. Release Architecture & Contracts

- **Target Repository:** `https://github.com/rzqllh/xyeena-notch`
- **Default Branch:** `main`
- **Release Version:** `1.0.0-alpha.1` (Tag: `v1.0.0-alpha.1`)
- **Workflow Trigger Contract:**
  The release workflow (`.github/workflows/release.yml`) operates exclusively via **`workflow_dispatch`** with an explicit `tag` input.
  > [!IMPORTANT]
  > Pushing a Git tag does **not** automatically trigger the release build. An annotated tag must first be pushed to GitHub, after which the maintainer triggers the release workflow manually.

---

## 2. Release Prerequisites Checklist

Before creating a release tag:

1. [x] Working tree is clean (`git status` shows no unstaged or unintended changes).
2. [x] All 105 monorepo JS/TS tests pass (`npm test`).
3. [x] All 10 Rust backend tests pass (`cargo test --locked`).
4. [x] Rust linter and formatter pass (`cargo fmt --all -- --check`, `cargo clippy --locked --all-targets -- -D warnings`).
5. [x] Release audit script succeeds (`npm run release:audit`).
6. [x] Web client builds with zero warnings (`npm run build`).
7. [x] Monorepo full verification check passes (`npm run check`).

---

## 3. Step-by-Step Publication Procedure

### Step 1: Commit and Push to `main`
Ensure all verified changes are committed cleanly to the `main` branch:

```powershell
# Verify diff
git status
git diff --check

# Push to origin main
git push origin main
```

### Step 2: Create and Push an Annotated Tag
Create an annotated Git tag matching the version defined in `package.json` (`1.0.0-alpha.1`):

```powershell
# Create annotated tag
git tag -a v1.0.0-alpha.1 -m "Xyeena Island v1.0.0-alpha.1 (experimental Windows prerelease)"

# Push tag to GitHub
git push origin v1.0.0-alpha.1
```

### Step 3: Trigger the GitHub Release Workflow
Invoke the release workflow via the GitHub CLI or GitHub web interface:

```powershell
gh workflow run release.yml -f tag=v1.0.0-alpha.1
```

### Step 4: Monitor the Build & Verify Draft Release
The workflow will:
1. Validate the tag format (`^v1\.0\.0-alpha\.[0-9]+$`).
2. Run `npm ci`, `npm run check`, `cargo test --locked`, and `cargo clippy`.
3. Build the native Windows NSIS installer using `npm run tauri -- build --bundles nsis`.
4. Generate `SHA256SUMS.txt`.
5. Create a **Draft Prerelease** on GitHub containing the `.exe` installer and `SHA256SUMS.txt`.

Check workflow progress:
```powershell
gh run list --workflow=release.yml
gh run watch
```

### Step 5: Verify the Draft Prerelease
Inspect the generated draft release:
```powershell
gh release view v1.0.0-alpha.1
```
Verify that:
- The installer executable `xyeena-island_1.0.0-alpha.1_x64-setup.exe` is attached.
- `SHA256SUMS.txt` is attached and the checksum matches the binary.

### Step 6: Make Repository Public (Maintainer Action)
Using authenticated GitHub administration:
```powershell
gh repo edit rzqllh/xyeena-notch --visibility public
```

### Step 7: Publish the Prerelease
Publish the draft release as a public prerelease:
```powershell
gh release edit v1.0.0-alpha.1 --draft=false --prerelease
```

Verify public accessibility:
```powershell
gh release view v1.0.0-alpha.1 --web
```
