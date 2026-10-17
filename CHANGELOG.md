# Changelog

All notable changes to the Xyeena Notch repository are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0-alpha.1] — 2026-10-17

### Coucou Windows 0.5.0 Full Functional Parity Milestone

This release achieves 100% verified functional parity with Coucou Windows 0.5.0 across all 34 cataloged capabilities (F01–F34), implemented on Tauri 2, vanilla TypeScript, and Rust without any Coucou or Mochi proprietary assets.

#### Added

- **Phosphor Icon Modernization (S01 / F30):** Integrated `@phosphor-icons/core` with typed icon registry in `core/icons.mjs` and complete visual audit across dark/light modes.
- **Native Named Pipe IPC (S02 / F11):** Windows Named Pipe `\\.\pipe\xyeena-agent-<username>` with per-user DACL, length-prefixed framing, and multi-agent session registry in `agent_ipc::pipe`.
- **Agent Provider Hook Installer (S03 / F05):** Automated discovery, atomic configuration backup (`.bak`), and idempotent install/uninstall for Antigravity, Claude Code, Codex, and Gemini CLI in `agent_ipc::provider`.
- **Contextual Agent Sessions & Excision of Legacy Timer (S04 / F02, F31, F32):** Built reactive `SessionStore` supporting multi-agent concurrency, lifecycle state transitions, contextual session pills, and tool execution telemetry. Completely excised legacy manual meeting timer.
- **Authoritative Native Approval Registry (S05 / F06, F07):** Cryptographic single-use token nonces, 3-minute TTL, SHA-256 action fingerprint integrity, and strict Allow Once / Deny / Question answers only (zero Always Allow).
- **Unified Mascot State Continuity (S06 / F04, F01):** Single canonical Xyn Lion living companion (`@xyeena/xyn`), multi-instance state arbiter, and smooth transitions across Compact, Glance, and Expanded Island modes.
- **Developer Productivity & Authentic Telemetry (S07 / F12, F13, F14, F27):** Bounded 64KB git diff preview with path traversal safeguards, native VS Code/terminal launch, authentic token metrics, and Weekly Recap integration.
- **Clipboard History & Win32 Notifications (S08 / F17, F18):** Win32 `GetClipboardSequenceNumber()` zero-overhead notifications, 64MB memory bounds, and sensitive credentials filter (`looksSensitive`).
- **AI Chat Stabilization & Local Models (S09 / F15, F16):** Curl 100-continue parsing, Expect header suppression, multi-turn context normalization, BYOK session key isolation, and local loopback routing for Ollama / LM Studio.
- **Media Controls & Contextual File Drop (S10 / F19, F20):** Real GSMTC playback monitoring, Core Audio master endpoint volume control, 50MB file drop bounds, and image conversion actions (WebP, PNG, JPEG).
- **External Services & GitHub Integration (S11 / F21, F22):** Read-only GitHub remote detection, authentic PR view, workflow run check rollups, and connected service health checks (Vercel, Notion, n8n, Resend, Cal.com, Stripe).
- **Flow Offline Speech Dictation (S12 / F23, F24):** 100% on-device speech processing, push-to-talk `Alt+D` trigger, dictionary snippets expansion (`DEFAULT_SNIPPETS`), verbal filler word filter, and local word statistics.
- **Notetaker & Bounded Voice Commands (S13 / F25, F26):** Consented audio recording gate, prominent red visual mic indicators, bounded note retention (max 20), markdown note export, and typed voice commands catalog.
- **Android Companion Local Pairing (S14 / F29):** QR code payload schema (`xyeena-companion-v1`), 6-digit numeric PIN, 32-byte secret nonce, HMAC signature verification for remote mobile approvals, and immediate revocation.
- **Accessibility, i18n & Performance Baseline (S15 / F03, F28, F33):** Comprehensive i18n localization engine (en/id parity), `:focus-visible` focus indicators, Windows forced-colors high contrast, reduced motion overrides, high-DPI font smoothing, arrow key navigation for settings pills, and WebView2 memory/performance diagnostics.
