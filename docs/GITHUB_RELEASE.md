# Prepare a Windows prerelease

This guide is for maintainers. The published `v1.0.0-alpha.1` tag already exists; do not recreate it or overwrite its assets. A new release needs an owner-approved version and source commit.

## Prepare the candidate

Complete [release requirements](RELEASE_GATES.md) on the exact commit. Keep npm, Cargo, Tauri, and genuine lockfile versions consistent. Record command results and unresolved native Windows checks in the release review rather than copying historical pass counts.

The supported tag format is `v1.0.0-alpha.N`. Choose the next version deliberately; `N` is a placeholder, not a command argument. After approval, create and push the matching annotated tag using the repository's normal review process.

## Build a draft

The [release workflow](../.github/workflows/release.yml) runs only through `workflow_dispatch` with an explicit existing tag. A tag push alone does not trigger it.

In GitHub Actions, select **Manual draft alpha release**, choose **Run workflow**, and supply the approved tag. The Windows job checks dependencies and source, runs Rust tests and lint, builds the NSIS installer, computes SHA-256, and creates a draft prerelease.

A requested workflow is not a successful build. Inspect its terminal result and the actual attached artifacts.

## Review the artifact

Confirm the draft refers to the approved tag and commit. Check that it contains the generated Windows installer and `SHA256SUMS.txt`, with matching filenames and hashes. The existing alpha asset is named `Xyeena.Island_1.0.0-alpha.1_x64-setup.exe`; use the actual new artifact name for a later candidate.

Verify install, launch, tray, media, clipboard, upgrade/uninstall, themes, and display scaling on the target Windows machine. Record pending or failed checks. State that the installer is unsigned and explain checksum verification. Do not present an alpha as enterprise-certified.

## Publish after approval

Review the feature scope, known limitations, download instructions, attribution, and owner approval before publishing the draft prerelease in GitHub Releases. Do not change repository visibility as part of publication; this repository is already public.

After publication, verify the release page and downloadable assets. Keep the published tag immutable. A checksum verifies artifact consistency, not publisher identity or application safety.
