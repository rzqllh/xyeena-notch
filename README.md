# Xyeena Notch

A Windows-first Xyeena desktop companion and its **original Lion Guardian mascot**, kept separate from the `xyeena-agent` CLI/harness package. This is a **Windows smoke-test candidate for `1.0.0-alpha.1`**; changes to native gaze and window lifecycle are unverified on a physical Windows machine. It is not a stable release.

## Canonical layout

- `apps/xyeena-island/`: the production Tauri 2 Island alpha application (top-center Island, system tray, Windows GSMTC media, master volume, in-memory clipboard, opt-in notifications, and integrated Xyeena Guardian mascot).
- `packages/xyeena-mascot/`: the canonical Lion Guardian custom element (`<xyeena-guardian>`), motion controller, and state mapping package consumed via npm workspaces.
- `examples/guardian-playground/`: browser-only development harness for testing Guardian states, accessories, and emotes. Approvals and agent cards in this harness are simulated.
- `docs/`: architecture specifications, feature status truth table, release gates, and manual smoke test procedures.

Only `apps/xyeena-island` is the authoritative desktop app host.

## Development and Verification on Windows

Prerequisites: Node.js 22.14+, Rust stable (MSVC toolchain), Visual Studio Build Tools with C++ desktop workload, Windows 10/11 SDK.

```powershell
npm ci                          # Install locked dependencies
npm test                        # Run all workspace unit tests (Island, Mascot, Playground)
npm run build                   # Build TypeScript and Vite web assets
npm run doctor                  # Verify Windows toolchain prerequisites
npm run release:audit           # Audit versions, licenses, and lockfiles
.\scripts\verify-alpha.ps1      # Authoritative 11-step Windows verification and NSIS packaging
npm run desktop                 # Run native Tauri dev instance
```

Manual smoke test procedures and verification checklist are documented in [`docs/SMOKE-TEST-WINDOWS.md`](docs/SMOKE-TEST-WINDOWS.md).

See also [`docs/FEATURE_STATUS.md`](docs/FEATURE_STATUS.md) and [`docs/RELEASE_GATES.md`](docs/RELEASE_GATES.md).

## Upstream and licensing

Xyeena source, UI, icons, and Guardian art are original. The Island's geometry motion mathematics were adapted from Coucou MIT source, with copyright and permission notices retained in `THIRD_PARTY_NOTICES.md` and `apps/xyeena-island/licenses/COUCOU-CODE-MIT.txt`. No protected Coucou/Mochi characters, names, media, sounds, or icons are distributed.

## Release scope

`1.0.0-alpha.1` is the fixed stabilization target. Multi-agent hooks/approvals, AI chat, live diff, true Teams presence, GitHub/service integrations, and global hotkeys are not implemented in this alpha and remain explicit future release gates.
