# Release requirements

These requirements apply to a new Xyeena Island Windows alpha candidate. The published [v1.0.0-alpha.1](https://github.com/rzqllh/xyeena-notch/releases/tag/v1.0.0-alpha.1) has an installer and checksum file. Their existence does not verify a newer source checkout or every Windows configuration.

Record the exact candidate commit, tool versions, command results, and manual observations in the release or pull request. Historical counts and unchecked assumptions are not current pass results.

## Automated checks

Run from a clean checkout with Node.js 22.14+:

```sh
npm ci
npm run check
```

This checks workspace consistency, JavaScript tests, TypeScript/web build, and release manifest requirements. It does not run every Rust or physical Windows check.

From `apps/xyeena-island/src-tauri`, run:

```sh
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
```

Check actual output. Do not copy an old test count into a new release. The Windows packaging environment needs Rust, Microsoft C++ Build Tools, Windows SDK, and WebView2.

## Security and data

Verify that clipboard capture defaults off, clearing and exit remove session history, and item/byte bounds hold. Confirm that API keys are not persisted, local-model requests remain loopback-only, and cloud requests use the selected supported endpoint.

Verify cancellation and error handling without exposing keys in logs, snapshots, or issue reports. The read-only project view must not acquire script execution or hook-writing authority. These tests do not provide a security certification or protect against a compromised same-user OS process.

## Windows acceptance

Use the [Windows smoke test guide](SMOKE-TEST-WINDOWS.md). Record results on the actual target machine for:

- Installation, launch, restart, and uninstall.
- Single-window behavior, tray restore, pinning, and monitor changes.
- Media transport and volume with supported applications.
- Clipboard opt-in, clearing, and session exit.
- Theme changes, keyboard access, and reduced motion.
- Multiple monitors and 125%-200% DPI.

A Tauri configuration or browser screenshot alone does not prove native behavior. Keep a failed or untested requirement visible. Teams automatic detection and global shortcuts remain deferred features, not completed acceptance items.

## Packaging and publication

Run `npm run release:audit` and build the NSIS package from the approved source. Confirm versions agree across npm, Cargo, and Tauri configuration. Retain licenses, notices, genuine lockfiles, and required icons; exclude keys, local settings, debug output, and duplicate desktop hosts.

Generate SHA-256 for the actual installer and publish its matching `SHA256SUMS.txt`. The current alpha installer is unsigned; disclose this on the download page and in installation instructions.

The [manual release workflow](../.github/workflows/release.yml) accepts an existing approved alpha tag and creates a draft prerelease. Review the artifact, checksums, limitations, and owner approval before publishing the draft. [GitHub release guide](GITHUB_RELEASE.md) describes the steps.

## Release decision

An alpha can be offered with explicit support limits and recorded unresolved checks. A stable or enterprise-readiness claim needs additional evidence for its declared devices, safety boundary, support, and recovery expectations. Documentation changes do not close those gates.
