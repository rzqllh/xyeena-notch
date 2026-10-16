# @xyeena/island

**Desktop Island companion for Xyeena workflows, media controls, in-memory clipboard, and living Xyn Lion Guardian.**

---

## Overview

`@xyeena/island` is the primary desktop application package in the Xyeena Notch monorepo, built with Tauri 2, vanilla TypeScript, and Rust. It docks to the top edge of Windows displays, providing an adaptive notch instrument panel with:

- **Stationary Top Notch Shell:** Wake, Compact, Glance, and Expanded window states with liquid spring dynamics.
- **Xyn Lion Guardian (`@xyeena/xyn`):** Integrated 54×54px mascot framing in a 58px header, parallax cursor gaze tracking, and WeakMap Direct2D gradient caching.
- **Windows Media & Audio:** Real-time GSMTC session monitoring, playback controls, and master default-output volume slider.
- **In-Memory Unified Clipboard:** 64 MiB session-only store supporting text, image data URLs, and file paths with Read-Once destruction.
- **Multi-Provider AI Companion:** BYOK chat supporting Gemini, Claude, OpenAI, OpenRouter, Ollama, and LM Studio via non-blocking native curl runner in Rust.
- **Local Weekly Recap (`@xyeena/recap`):** Local activity aggregation and 1080×1920 SVG card generation.

---

## Development

Prerequisites: Node.js 22.14+, Rust stable MSVC, Visual Studio 2022 C++ Build Tools, Windows 10/11 SDK.

```powershell
# From monorepo root:
npm ci
npm test
npm run build
npm run doctor
npm run desktop
```

For architecture specifications, security boundaries, and release documentation, see:
- [Architecture](../../docs/ARCHITECTURE.md)
- [Feature Status](../../docs/FEATURE_STATUS.md)
- [Security Policy](../../SECURITY.md)
- [Release Gates](../../docs/RELEASE_GATES.md)
- [Third-Party Notices](../../THIRD_PARTY_NOTICES.md)

---

## License

MIT License. Motion mathematics adapted under MIT from Coucou (Copyright © 2026 Louis Raillé). See [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
