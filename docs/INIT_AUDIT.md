# Xyeena Notch — source reconciliation and init audit

## Incoming source snapshots

- `xyeena-island(1).zip`: 81 files; includes CI/release configs and ignored dist output.
- `Xyeena-Island-current-source.zip`: 71 files; **all 71** are byte-identical to corresponding files in the first archive.
- `xyeena-notch-source(1).zip`: 40 files; original Guardian package plus separate prototype UI and Tauri host.

## Evidence and blockers

- Island Alpha JavaScript suite: **40/40 PASS** (Node 22.16 on sandbox). Notch source: **10/10 PASS**; old isolated preview build PASS.
- Original Island's npm `package-lock.json` was still `0.5.0`, omitted the clipboard plugin, while `package.json` is `1.0.0-alpha.1`.
- Original `src-tauri/Cargo.lock` had `xyeena-island@0.5.0` while Cargo.toml is `1.0.0-alpha.1`.
- Those stale locks were **excluded** from this candidate; regenerate them from actual package managers on Windows. A release audit must remain BLOCKED until both authentic locks match.
- Original ZIP carried ignored `dist/`, Tauri `gen/schemas/`, and `agent-events.before-hotfix.mjs.bak`; none is in this init tree.
- The old Notch preview had fake approvals and uploads. Its native Tauri shell is not shipped; the browser demo is isolated under examples.
- The Island's *Fold* mascot and the Guardian lion are **distinct**. Guardian is a standalone package only until its final integration and UX review. No false claim of mascot completion.
- `Cargo`, Windows WebView2 / MSVC and a real GUI session are needed for native verification. They were unavailable in the authoring environment; Rust tests, clippy and NSIS release have not been proven.
- Feature status and native QA requirements are recorded in `apps/xyeena-island/docs/FEATURE_STATUS.md` and `apps/xyeena-island/docs/RELEASE_GATES.md`. Their open gates are not waived by passing JS tests.

## Safe Git initialization policy

- Target: existing `rzqllh/xyeena-notch` repository, not `rzqllh/xyeena`.
- Create a **new feature branch from the existing main**, do not rewrite history or force-push.
- Explicitly stage only the source tree. `node_modules`, Tauri target, generated schemas, dist, `.env`, logs and backups must remain ignored.
- CI may remain blocked until genuine locks exist. Do not push a release tag or publish an installer before complete Windows acceptance.
- Do not treat the static Guardian preview as an authorized agent permission interface.
