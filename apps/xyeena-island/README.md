# Xyeena Island

**1.0.0-alpha.1 candidate · Windows · Local-first · Not a stable or enterprise-certified release**

Xyeena Island is a separate desktop companion to [Xyeena Agentic](https://github.com/rzqllh/xyeena). The desktop application does not change or install Xyeena Agentic itself. It combines an always-on-top Island, tray controls, Xyeena local run summaries, Windows playback transport, a manual meeting timer, opt-in clipboard history and opt-in notifications. Xyeena Fold is an original vector mascot; no protected Coucou/Mochi media or artwork is distributed.

**Current integration boundaries:** Windows media transport does not detect Teams calls; meeting mode is manual. There is no agent hook relay, permission approval, AI chat, GitHub token integration, encrypted phone link, live diff or multi-agent orchestration yet. See [Feature truth table](docs/FEATURE_STATUS.md). These are release/product work, not hidden functionality.

## Local development (Windows, workspace root)

Prerequisites: Node.js 22.14+, Rust stable MSVC, Visual Studio Build Tools with **Desktop development with C++** (x64/x86), Windows SDK, WebView2.

```powershell
npm install
npm test
npm run build
npm run doctor
npm run desktop
```

Use `npm ci` from the **monorepo root** once the **real generated** root `package-lock.json` is committed. The release audit refuses final packaging without a lockfile; it must come from `npm install` on a machine with npm registry access. Do not handcraft a lockfile.

## Safety and capabilities

- All network-free features work without accounts or tokens.
- Clipboard capture defaults **off** and is not persisted; only a deliberately enabled session can record text. Sensitive-text filtering is heuristic, not infallible.
- Local `.xyeena/runs/*/snapshot.json` summaries are read only after entering a project directory; no journal, hooks or agent tools are executed.
- Notifications require OS opt-in; test toasts are reported in local activity.
- Media shows Windows GSMTC playback sessions; seek/shuffle/repeat depend on each player; volume controls the **Windows default output**, not per-app volume.
- No Xyeena Agentic hooks or approvals are installed. There is no ambient listener, telemetry or cloud upload in this candidate.

For architectural boundaries, threats and citations see [Architecture](docs/ARCHITECTURE.md), [Security](SECURITY.md), [Third-party notices](THIRD_PARTY_NOTICES.md), and [Coucou capability audit](docs/COUCOU-CAPABILITY-AUDIT.md).

## GitHub alpha release

A **pre-release** with unsigned Windows installation artifacts is permitted only after passing [Release gates](docs/RELEASE_GATES.md). CI and a release workflow are included but cannot run until this source is pushed into its own GitHub repository. We do not equate passing Node tests with a working Windows binary. Read the [release instructions](docs/GITHUB_RELEASE.md); a tag should never be pushed before those gates pass.

## Upstream and license

Xyeena Island's source is MIT (`LICENSE`). Its spring mathematics were adapted from Coucou Windows under MIT, copyright © 2026 Louis Raillé; preserve `THIRD_PARTY_NOTICES.md` and `licenses/COUCOU-CODE-MIT.txt`. **Coucou/Mochi characters, names, sounds, icons and media are excluded** by the upstream assets license; this project does not bundle them. See `UPSTREAM.md`.
