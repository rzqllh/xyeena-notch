# Xyeena Notch

A Windows-first Xyeena desktop companion and its **original Lion Guardian mascot**, kept separate from the `xyeena-agent` CLI/harness package. This is an **init candidate for `1.0.0-alpha.1`**, not an enterprise certification or a published GitHub release.

## Canonical layout

- `apps/xyeena-island/`: the real Tauri 2 Island alpha application (tray, local media, clipboard, notifications, original Fold mascot).
- `packages/xyeena-mascot/`: the original Lion Guardian custom element and optional React client package. **It is not yet wired into the real Island UI.**
- `examples/guardian-playground/`: isolated browser-only demonstration of the Lion Guardian. Approvals, transfers and agent cards in this example are **simulated**; the example is never used for production permissions.

Only `apps/xyeena-island` is the authoritative desktop app. The older Tauri preview from Xyeena Notch has been intentionally omitted rather than creating a second native host.

## Init on Windows

1. Use a clean clone of [`rzqllh/xyeena-notch`](https://github.com/rzqllh/xyeena-notch). The existing `main` currently contains only a README; **do not use `git init` or `gh repo create` on that existing remote**.
2. Extract this archive's contents into the clone **on a feature branch**.
3. Generate both genuine dependency locks using `npm install` (workspace root) and `cargo generate-lockfile` in `apps/xyeena-island/src-tauri`.
4. Run `powershell -File .\scripts\verify-alpha.ps1` (Windows PowerShell from repo root), and record results. Do not publish or tag until the release gates pass.
5. Submit as a pull request; do not overwrite the Xyeena Agentic repository.

```powershell
npm install
npm test
npm run build
npm run release:audit
npm run desktop  # Windows; genuine Tauri + Rust toolchain required
npm run preview:guardian # separate preview at localhost:4181
```

See [`docs/INIT_AUDIT.md`](docs/INIT_AUDIT.md), [`apps/xyeena-island/docs/FEATURE_STATUS.md`](apps/xyeena-island/docs/FEATURE_STATUS.md) and [`apps/xyeena-island/docs/RELEASE_GATES.md`](apps/xyeena-island/docs/RELEASE_GATES.md).

## Upstream and licensing

Xyeena source, UI, icons, and Guardian art are original. The Island's geometry motion math was adapted from Coucou MIT source, with copyright and permission notice kept in `THIRD_PARTY_NOTICES.md` and `apps/xyeena-island/licenses/COUCOU-CODE-MIT.txt`. No protected Coucou/Mochi characters, names, media, sounds or icons are distributed.

## Release scope

`1.0.0-alpha.1` is the fixed stabilization target. No per-fix version bumps. Multi-agent hooks/approvals, AI chat, live diff, true Teams presence, GitHub/service integrations, global hotkeys and a unified Guardian renderer are **not yet implemented** and remain explicit release gates.
