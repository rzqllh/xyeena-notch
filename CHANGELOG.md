# Changelog

All notable changes to the Xyeena Notch repository are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0-alpha.1] — 2026-10-16

This is the initial public experimental Windows prerelease of Xyeena Notch and Xyeena Island.

### Added

#### Island Window Shell
- Stationary top-notch docking with dual concave SVG shoulder curves blending into monitor bezels.
- Adaptive four-mode window geometry: Wake Strip (184×8px), Compact (400×92px), Glance (480×144px), and Expanded (620×396px).
- Fluid liquid spring animation mathematics adapted from Coucou under MIT license.
- Always-on-top toggle, pin mode, auto-collapse on pointer exit, and Windows system tray minimize/restore.

#### Xyn Lion Living Guardian (`@xyeena/xyn`)
- Canonical custom element `<xyeena-guardian>` powered by HTML5 Canvas 2D rig (`LivingLionRig`).
- Dedicated 54×54px mascot framing inside a balanced 58px header, anchored with a subtle physical contact shadow.
- Parallax eye and head cursor gaze tracking via Windows Win32 cursor sampling.
- WeakMap-based Direct2D gradient caching eliminating redundant brush allocations on every frame.
- Adaptive frame-rate throttling: ~30 FPS on low-motion idle; 60 FPS bursting during user interaction or active gestures.
- Multi-instance lifecycle synchronization: inactive mode canvases are explicitly suspended (`stop()`).
- Concept-art accessory wardrobe: Standard (Aegis Shield), Cyber Visor, Golden Crown, Studio Headset, and Silver Shield.

#### Media & Audio Transport
- Windows GSMTC integration monitoring real-time playback sessions (Spotify, Chrome, Edge).
- Track transport controls: play/pause, next/previous, progress seek, shuffle, and repeat.
- Windows master output volume slider via Windows Core Audio APIs, with mute toggle.
- Explicit manual meeting timer with elapsed duration counter (no microphone capture).

#### Privacy-First Unified Clipboard
- In-memory session store supporting plain text, image data URLs (BMP/PNG), and dropped file paths.
- Strict resource bounds: 64 MiB total heap memory cap and 20 MiB per-image ceiling.
- Read-Once destructive copy, item pinning, search filtering, one-click purge, and automatic memory wipe on exit.

#### Multi-Provider Companion AI Chat
- Multi-provider BYOK companion chat supporting Google Gemini, Anthropic Claude, OpenAI, OpenRouter, and local offline models (Ollama and LM Studio).
- Non-blocking native curl transport in Rust with atomic request cancellation.
- Strict URL authority allowlists, loopback host enforcement (`localhost`/`127.0.0.1`) for local providers, and 3xx redirect rejection.
- Session-only in-memory credential storage: API keys are never persisted to disk or localStorage.

#### Local Weekly Recap Engine (`@xyeena/recap`)
- Local aggregation engine calculating weekly activity summaries from authenticated run snapshots.
- Privacy-guaranteed metrics: strips sensitive paths, excludes untrusted providers, and maintains a rolling 12-week archive.
- Exportable standalone 1080×1920 SVG infographic card and clean ASCII markdown report.

#### Settings & Theming
- Low-chroma Dark, crisp Light, and automatic System appearance themes conforming to WCAG AA contrast.
- Full accessibility support for `prefers-reduced-motion` and manual toggle to freeze all motion.
- Synthesized Web Audio feedback with configurable volume.
- English and Bahasa Indonesia display language options.

### Security & Packaging
- Monorepo package consolidation with `@xyeena/island`, `@xyeena/xyn`, and `@xyeena/recap`.
- 105 automated unit/integration tests in Node.js and 10 Rust native tests.
- Automated release verification script (`npm run release:audit`) and CI workflow (`.github/workflows/ci.yml`).
- Automated NSIS packaging workflow (`.github/workflows/release.yml`) with SHA-256 checksum generation.
- Complete public documentation: `README.md`, `ARCHITECTURE.md`, `FEATURE_STATUS.md`, `SECURITY.md`, `RELEASE_GATES.md`, and `GITHUB_RELEASE.md`.
