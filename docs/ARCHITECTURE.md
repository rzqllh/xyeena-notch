# Architecture

## Separation
- **Xyeena Agentic:** independent npm package `xyeena-agent` in `rzqllh/xyeena`; not bundled, modified or invoked by Island automatically.
- **Xyeena Island:** independent Tauri 2 + TypeScript app, with native Windows IPC and state machine.
- **Upstream Coucou:** MIT source reference for motion mathematics only; protected assets/branding excluded.

## Trust boundaries
1. WebView2 frontend has local UI and Tauri capability-scoped plugin calls; do not load arbitrary webpages.
2. Rust commands handle window geometry, Windows media sessions, output audio and bounded read-only Xyeena run metadata.
3. Clipboard plugin is available only in the app origin, with in-app opt-in for background observation; history is in memory.
4. Notifier uses OS permission, and app-generated events only; no Windows notification interception.
5. There is **no** agent relay or hook installer, no remote service, no privileged filesystem writing, and no cloud chat.

## Release constraints
- Tauri window properties: transparent, topmost, skip taskbar, tray. Bundle is NSIS current-user, unsigned in alpha.
- CI on Windows must compile both frontend and Rust and upload only audited artifacts.
- Monitor and DPI placement, hitboxes, native resize pacing and fractional-scale behavior need manual Windows acceptance.
- Lock exact JS and Rust dependencies before releasing; commit generated `package-lock.json` and `src-tauri/Cargo.lock`.

## Future architectural extensions (not implemented)
- Inbound agent events: isolated per-agent adapter, allowlisted event schema, previewed config patch, backup, explicit consent, reversible uninstall, no automatic allow.
- Chat: BYOK secrets via Windows Credential Manager, URL allowlist, local model handling, sandboxed tool dispatch and redacted diagnostics.
- OAuth integrations: separate grants per provider and scopes, backoff, opt-in data retention and revocation UI.
- Mobile relay: separate security design, encrypted pairing, certificate rotation, mutual trust, on/off switch; no default listening port.
