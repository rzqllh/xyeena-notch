# GitHub alpha release procedure

1. Create a **separate** repository (suggested `rzqllh/xyeena-desktop`). Do not push this project into `rzqllh/xyeena` or change the Agentic package version.
2. Commit this source including genuine npm `package-lock.json` and Rust `src-tauri/Cargo.lock`. Never commit `node_modules`, `dist`, `src-tauri/target`, local settings, provider tokens or generated logs.
3. Enable GitHub Actions with Windows runner and run `ci.yml`. Fix failures *before* tagging. Confirm native app GUI acceptance locally.
4. Run `npm run release:audit` and review `docs/RELEASE_GATES.md`; only then create an annotated `v1.0.0-alpha.1` tag on the verified commit.
5. Push the tag to trigger `release.yml`. It builds an **unsigned** NSIS installer, writes SHA-256, and uploads to a **draft prerelease**. Review checksum and binaries; publish the draft only with maintainer approval.
6. Do not announce enterprise production readiness or change release to stable 1.0 based only on this alpha.

CI is intentionally designed to fail before release if the two lockfiles are absent.

Example commands after initial GitHub repository creation:

```powershell
npm install
# Ensure src-tauri/Cargo.lock exists from a native cargo check/test.
node .\scripts\release-audit.mjs
git status --short
git add -A
git commit -m "chore: prepare Xyeena Island 1.0 alpha candidate"
git push -u origin main
# ONLY AFTER every automated and manual gate is green:
git tag -a v1.0.0-alpha.1 -m "Xyeena Island 1.0 alpha.1"
git push origin v1.0.0-alpha.1
```

Avoid `--force`, don't overwrite unknown repos, and never commit a generated installer inside source control.
