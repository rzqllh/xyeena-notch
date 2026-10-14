# Release gates — 1.0.0-alpha.1 (Windows)

A prerequisite checklist, **not** a certification or a claim that these items already passed.

## Automated (must pass on an immutable commit)
- [ ] `npm ci` from a genuine committed `package-lock.json`.
- [ ] `npm test` and `npm run build` (strict TypeScript + Vite).
- [ ] `npm run doctor` reports required native toolchain.
- [ ] `npm run release:audit` enforces version synchronization, manifests, license, lack of private artifacts and lockfiles.
- [ ] `cargo fmt --all -- --check`, `cargo test --locked`, `cargo clippy --locked --all-targets -- -D warnings` on Windows.
- [ ] `npm run tauri build -- --bundles nsis` succeeds on clean Windows runner with locked dependencies.
- [ ] Run Windows Defender and dependency/license review on the actual installer.

## Manual Windows (must be recorded)
- [ ] Tray-only application, no taskbar, topmost on supported desktops; focus and alt-tab tested.
- [ ] Compact/expanded/hidden with pointer hitboxes at 100%,125%,150% scaling, two monitors.
- [ ] Reduced motion/auto hide/relaunch and last screen behaviour.
- [ ] Profile 60/120Hz frame pacing; no guaranteed FPS without measurement.
- [ ] Real playback sources, seek/repeat/shuffle rejected cases, output volume/mute.
- [ ] Clipboard start OFF, on/off, memory-only, clear, secret handling and OS denial.
- [ ] Notification permissions and toast from the packaged app.
- [ ] Connected Xyeena project with actual `.xyeena/runs` snapshots; no journal reads or edits.
- [ ] Crash/shutdown/restart behaviour and no orphan background listeners.
- [ ] Installer install/upgrade/uninstall and no retained privileged processes.

## Owner-required functional parity — blocking (not waived)
- [ ] Multi-agent session lifecycle: Claude Code, Codex, Gemini CLI, Cursor, Antigravity, Copilot, OpenCode and others with provider-specific adapters.
- [ ] Safe permission/question/approval relay: preview, backups, explicit install/uninstall, fail-closed terminal fallback, consent replay prevention.
- [ ] Agent tool events, file diffs, navigation to current terminal/editor, plan usage and real session stats.
- [ ] AI chat (cloud BYOK and local models) with credential storage, provider authorization, secret redaction and streaming.
- [ ] Advanced file drop and attachments, GitHub CI/review, opt-in third-party integrations and appropriate error states.
- [ ] Weekly recap, configurable global shortcuts, multilingual/accessibility, privacy controls and durable local settings.
- [ ] Media source capability verification, artwork/progress where allowed, output volume, call/meeting presence from authorized APIs—not media inference.
- [ ] Owned mascot rig and native motion meet usability requirements without Coucou asset reuse.
- [ ] Windows-first installer lifecycle and desktop reliability; optional Linux/mobile if owner confirms in target product scope.

**All-feature parity requested by the maintainer is NOT yet complete.** The alpha source candidate cannot be promoted to a public release simply because CI passes. Functional parity acceptance must be explicitly completed or the maintainer must explicitly adjust the alpha scope.

## Security and product
- [ ] Feature truth table and README contain no false claims.
- [ ] NOTICE and MIT upstream copyright included, proprietary Coucou assets excluded.
- [ ] Dependency versions, license inventory, SBOM and vulnerability handling reviewed.
- [ ] GitHub repository exists; branch protected; release workflow limited to version tag.
- [ ] Explicit maintainer approval; create **pre-release**, not stable GitHub release.
- [ ] No npm publish of Island; no change to Xyeena Agentic npm package.

**BLOCKED until recorded evidence exists.** Passing 35 local JavaScript tests is not a substitute for these gates.
