# Changelog

All notable changes to the Xyeena Notch repository are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0-alpha.1-recovery] — 2026-10-19

### Post-Smoke-Test Product Recovery & Runtime Hardening

This release resolves user-reported defects from physical Windows smoke testing across Draft PR #8:

#### Fixed

- **AI Chat Context Integrity (P0 / F15):** Eliminated synthetic `'Hello'` message injection on input submit. Every request generates exactly one committed assistant turn. Streaming replies are managed via transient state rather than polluting conversation history. User-selected models persist across turns without resetting to default.
- **Chat Stop Cleanup & Cancellation (P0 / F15):** Consolidated cancellation into `stopActiveChat()`: invalidating sequence tokens immediately clears `activeStreamingReply`, commits partial text if present, aborts native transport child processes, and restores mascot to idle without leaving orphaned bubbles or stale speaking states across connecting, streaming, and retry phases.
- **Strict Image Model Validation & Consent Reset (P0 / F15):** Removed silent fallback to default image models. Unsupported model IDs produce an explicit validation error before any API request. Reset payment acknowledgment whenever provider or model changes and ensure users have explicit per-model cost information.
- **Strict RFC 4180 CSV Parsing (P1 / F19):** Built compliant tokenizer supporting multiline cells with embedded CRLF/LF, escaped double quotes `""`, commas inside quotes, empty values, and strict malformation rejection. Round-trips multiline JSON datasets losslessly.
- **Accurate RFC3339 Diagnostic Timestamps & OpenAI Model Extraction (P1 / F15):** Replaced epoch seconds in `ai_diagnostics::current_iso_timestamp()` with civil UTC RFC3339 timestamps (`YYYY-MM-DDTHH:MM:SS.mmmZ`). Extracted OpenAI model IDs directly from request payload metadata rather than guessing from URLs, keeping diagnostics secret-free and local.
- **Safe Generated Image Copy & Save (P1 / F15):** Validated media representations: base64 data URLs route to native image clipboard and downloads writer; remote HTTPS URLs copy the URL or trigger safe browser downloads without unsafe network fetches or passing URLs to base64 decoders.
- **AI Backend Diagnostic Tracing (P0 / F15):** Implemented opt-in developer-only rotating diagnostic logging in Rust (`ai_diagnostics.rs`) writing strictly to `%LOCALAPPDATA%\xyeena-island\logs\ai-diagnostics.log` (2 MiB bound, max 4 MiB total disk). Systematically redacts query credentials (`key=[REDACTED]`), logs zero prompts or bodies, and provides live status toggle in Settings.
- **Decoupled Image Generation (P0 / F15):** Fully decoupled Chat and Image provider configurations. Introduced modern image models (`gemini-nano-banana-2.1` via `generateContent`, `gemini-3.1-flash-image`, `gpt-image-2` via `openai_v1`). Enforced explicit cost acknowledgment consent checkbox for chargeable models.
- **Lossless Clipboard Image Preservation (P1 / F17, F18):** Registered native Windows `"PNG"` format prioritized over lossy bitmap transcoding, preserving exact original PNG bytes and transparency. DIBV5/DIB pixel data and dimensions preserved. Export saves using true detected format (`.png`, `.webp`, `.jpg`, `.bmp`) rather than hardcoded `.bmp`.
- **Atomic Island Motion Smoothness (P1 / F01):** Replaced dual `set_size` + `set_position` Tauri IPC calls with atomic Win32 `SetWindowPos` (`SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER`), eliminating visual jitter and edge tearing. Overrode CSS transitions during active geometry animations to establish native window geometry as the authoritative timeline.
- **Idle RAM and CPU Optimization (P1 / F33):** Suspended 2 hidden canvas animation loops in `@xyeena/xyn` (`XyeenaGuardian.start()` / `stop()`) when elements are not visible. Halted GSMTC master volume polling during compact and glance modes, eliminating continuous 250ms interval wakeups.
- **Native Explorer Drag-and-Drop (P1 / F19):** Wired `@tauri-apps/api/webview` `getCurrentWebview().onDragDropEvent` to handle actual Windows Explorer file drops, hover visual feedback, and path resolution.
- **Capability-Based File Conversions (P1 / F19):** Created truthful `CONVERSION_CAPABILITIES` matrix with verified local transformations (Image: WebP/PNG/JPEG; Text/Data: JSON/CSV/MD/TXT-B64) and honest `Conversion unavailable` reporting for unsupported documents without fake success claims.
- **Agent Hook Safety (P1 / F05, F07):** Added fail-closed checks for unverified provider hook contracts (`codex`, `gemini-cli`), returning explicit unverified status rather than generating fictional hook files.

## [1.0.0-alpha.1] — 2026-10-18

### Coucou Windows 0.5.0 Windows Parity Implementation & Hardening Prerelease

This prerelease implements the complete architectural foundation and core desktop capabilities across all 34 cataloged requirements (F01–F34) on Tauri 2, vanilla TypeScript, and Rust without any proprietary assets. Hardware-dependent backends (WASAPI audio capture, in-process speech engine) and mobile approval execution are explicitly documented with truthful pending/disabled states pending physical hardware and client acceptance.

#### Added

- **Phosphor Icon Modernization (S01 / F30):** Integrated `@phosphor-icons/core` with typed icon registry in `core/icons.mjs` and complete visual audit across dark/light modes.
- **Native Named Pipe IPC (S02 / F11):** Windows Named Pipe `\\.\pipe\xyeena-agent-<username>` with per-user DACL, length-prefixed framing, and multi-agent session registry in `agent_ipc::pipe`.
- **Agent Provider Hook Installer (S03 / F05):** Automated discovery, atomic configuration backup (`.bak`), and idempotent install/uninstall for Antigravity, Claude Code, Codex, and Gemini CLI in `agent_ipc::provider`.
- **Contextual Agent Sessions & Excision of Legacy Timer (S04 / F02, F31, F32):** Built reactive `SessionStore` supporting multi-agent concurrency, lifecycle state transitions, contextual session pills, and tool execution telemetry. Completely excised legacy manual meeting timer.
- **Authoritative Native Approval Registry (S05 / F06, F07):** Cryptographic single-use token nonces (fail-closed OS CSPRNG, 64 hex characters), 3-minute TTL, SHA-256 action fingerprint integrity, and strict Allow Once / Deny / Question answers only (zero Always Allow).
- **Unified Mascot State Continuity (S06 / F04, F01):** Single canonical Xyn Lion living companion (`@xyeena/xyn`), multi-instance state arbiter, and smooth transitions across Compact, Glance, and Expanded Island modes.
- **Developer Productivity & Authentic Telemetry (S07 / F12, F13, F14, F27):** Bounded 64KB git diff preview with path traversal safeguards, native VS Code/terminal launch, authentic token metrics, and Weekly Recap integration.
- **Clipboard History & Win32 Notifications (S08 / F17, F18):** Win32 `GetClipboardSequenceNumber()` zero-overhead notifications, 64MB memory bounds, and sensitive credentials filter (`looksSensitive`).
- **AI Chat Stabilization & Local Models (S09 / F15, F16):** Curl 100-continue parsing, Expect header suppression, multi-turn context normalization, BYOK session key isolation, and local loopback routing for Ollama / LM Studio.
- **Media Controls & Contextual File Drop (S10 / F19, F20):** Real GSMTC playback monitoring, Core Audio master endpoint volume control, 50MB file drop bounds, and image conversion actions (WebP, PNG, JPEG).
- **External Services & GitHub Integration (S11 / F21, F22):** Read-only GitHub remote detection, authentic PR view, workflow run check rollups, and connected service health checks (Vercel, Notion, n8n, Resend, Cal.com, Stripe).
- **Flow Offline Speech Dictation (S12 / F23, F24):** Privacy-first offline dictation framework, push-to-talk `Alt+D` trigger, dictionary snippets expansion (`DEFAULT_SNIPPETS`), verbal filler word filter, and local word statistics. Delegates to OS Voice Typing (`Win+H`); in-process engine pending.
- **Notetaker & Bounded Voice Commands (S13 / F25, F26):** Consented audio recording session controller, prominent visual session indicators, bounded note retention (max 20), markdown note export, and typed voice commands catalog. Low-level WASAPI audio stream pending.
- **Android Companion Local Pairing (S14 / F29):** QR code payload schema (`xyeena-companion-v1`), unbiased CSPRNG 6-digit numeric PIN, 32-byte secret nonce (64 hex), RFC 4231 HMAC-SHA256 constant-time verification, replay protection, and immediate revocation. Remote execution fail-closed disabled pending physical Android client acceptance.
- **Accessibility, i18n & Performance Baseline (S15 / F03, F28, F33):** Comprehensive i18n localization engine (en/id parity), `:focus-visible` focus indicators, Windows forced-colors high contrast, reduced motion overrides, high-DPI font smoothing, arrow key navigation for settings pills, and WebView2 memory/performance diagnostics.
- **Windows-Native WASAPI Audio Capture (S17 / F25):** Production-quality minimal Windows Core Audio capture backend via `IMMDeviceEnumerator` and `IAudioClient` (`AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM`). Captures real hardware PCM audio frames in a dedicated thread, supports pause/resume, and exports standard 16-bit PCM RIFF/WAVE files directly to Downloads folder.
- **WinRT Speech Recognizer Evaluation (S17 / F23):** Empirically investigated and tested WinRT `SpeechRecognizer` on host OS. Supports English (`en-US`) in-process offline; truthfully documents that Indonesian (`id-ID`) requires the host OS speech pack with fallback to Windows Voice Typing (`Win+H`).
- **Native AI Streaming & Inline Image Generation (S17 / F15, F16):** Implemented unbuffered streaming transport (`native_ai_stream`) using stdin-configured curl processes and Tauri event bus emission (`ai-stream:{id}`), dynamic model selectors in Chat and Settings synchronized with provider catalogs, and inline image generation with DALL-E, Imagen, and Local SD. Generated images render directly in chat with Copy and Save to Downloads actions.

