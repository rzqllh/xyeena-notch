# Security policy (alpha candidate)

**Xyeena Island 1.0.0-alpha.1 is experimental and has not received an independent security audit.** Do not use it to decide or approve production agent permissions.

## Scope and privacy
- Clipboard capture requires an explicit, current-session click and stores at most 25 text items in memory, no sync or disk history. A heuristic tries to omit sensitive values but is not a DLP guarantee.
- The native Xyeena snapshot reader accepts only explicitly supplied local absolute paths and returns bounded metadata; it does not modify the project.
- Media playback controls operate on Windows system-exposed sessions. Volume controls the default output endpoint; never microphone input.
- No automated hooks, command execution, agent approval transport, microphone capture, telemetry or background HTTP listener.
- No external brand/character assets are bundled.

## Security requirements before a public alpha
1. Native Windows CI compiles Rust with all target features, release NSIS packaging and tests.
2. Review every Tauri IPC command and capability; no remote URLs may host privileged pages.
3. Verify no secrets/tokens/path-dependent logs appear in a distributable or UI error surface.
4. Exercise tray, unpin, window shutdown, clipboard opt-out/clear, notification denial, media permission errors and malformed project path.
5. Create SBOM/dependency scan and review advisories; do not enable auto-update without signed artifacts and key control.
6. Any future approval relay requires request ID, session, provider, nonce, expiry, explicit user action, fallback-to-terminal behavior, and a separate threat-model review.

## Disclosure
Report a vulnerability via a private maintainer channel; do not post credentials or personally identifying logs in public issues. Until a security contact is established, treat release as unapproved.
