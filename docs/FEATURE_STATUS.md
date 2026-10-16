# Feature Status Matrix — 1.0.0-alpha.1

This document is the authoritative user-facing source of truth for capabilities implemented in Xyeena Notch / Xyeena Island.

Status definitions:
- **Implemented & Tested:** Source code exists, passes automated unit/integration tests, and has been verified in the local runtime.
- **Implemented (Manual QA Pending):** Implemented in code and passes unit tests; relies on physical Windows OS hardware for final interactive confirmation.
- **Deferred / Roadmap:** Planned for future milestones; not present in the current build.
- **Excluded by Design:** Intentionally omitted to protect user security, privacy, or product boundaries.

---

## Capabilities Matrix

| Area | Feature | Status | Notes |
|---|---|---|---|
| **Island Shell** | Stationary Top Notch | Implemented & Tested | Docks to top center display; 4 distinct presentation modes (Wake, Compact, Glance, Expanded). |
| **Island Shell** | Dual Concave Shoulder Wings | Implemented & Tested | SVG concave shoulder curves blend the Island into the monitor bezel. |
| **Island Shell** | Fluid Spring Physics | Implemented & Tested | Numerical damped-spring integration adapted from Coucou under MIT. |
| **Island Shell** | Topmost & Tray Management | Implemented & Tested | `always-on-top` toggle, pin mode, auto-collapse on pointer exit, system tray minimize/restore. |
| **Xyn Mascot** | Living Lion Canvas Rig | Implemented & Tested | 2D soft-3D rig in `@xyeena/xyn`, 20+ expression states, autonomous breathing & blinking. |
| **Xyn Mascot** | Expanded Header Integration | Implemented & Tested | 54×54px mascot framing in 58px header with subtle physical contact shadow. |
| **Xyn Mascot** | Cursor Gaze Tracking | Implemented & Tested | Parallax eye/head follow using Win32 cursor sampling; dead-zone and distance falloff. |
| **Xyn Mascot** | Rendering Performance | Implemented & Tested | WeakMap gradient cache, adaptive frame-rate throttling (30 FPS idle, 60 FPS active), multi-instance loop suspension. |
| **Xyn Mascot** | Concept Wardrobe | Implemented & Tested | 5 accessory presets: Standard, Cyber Visor, Golden Crown, Studio Headset, Silver Shield. |
| **Media & Audio** | GSMTC Session Monitoring | Implemented & Tested | Detects active Windows playback sessions (Spotify, browsers, media players). |
| **Media & Audio** | Transport Controls | Implemented & Tested | Play/pause, track skip, seek bar, shuffle, and repeat toggles. |
| **Media & Audio** | Master Volume Endpoint | Implemented & Tested | Controls Windows default output endpoint via Core Audio APIs; volume level & mute toggle. |
| **Media & Audio** | Meeting Timer | Implemented & Tested | Manual focus/meeting timer with elapsed duration display. |
| **Media & Audio** | Teams Auto-Detection | Deferred / Roadmap | Requires Microsoft 365 Graph presence API authorization; not inferred from media. |
| **Clipboard** | Multi-Format History | Implemented & Tested | In-memory session store supporting plain text, image data URLs (BMP/PNG), and file paths. |
| **Clipboard** | Memory & Item Limits | Implemented & Tested | Strict 64 MiB total heap cap, 20 MiB per-image cap, configurable 20/50/100 item bounds. |
| **Clipboard** | Privacy Controls | Implemented & Tested | Read-Once destructive copy, item pinning, search filtering, one-click purge, auto-clear on exit. |
| **AI Companion** | Cloud Providers (BYOK) | Implemented & Tested | Google Gemini, Anthropic Claude, OpenAI, and OpenRouter with session-only in-memory key storage. |
| **AI Companion** | Local Offline Models | Implemented & Tested | Ollama and LM Studio endpoints, hard-restricted to loopback (`localhost`/`127.0.0.1`). |
| **AI Companion** | Native HTTP Transport | Implemented & Tested | Non-blocking Rust curl runner with cancellation registry and strict URL authority allowlists. |
| **Project Tracking** | Run Summaries Feed | Implemented & Tested | Read-only inspection of `.xyeena/runs/*/snapshot.json` files; status badge and event feed. |
| **Project Tracking** | Local Weekly Recap | Implemented & Tested | Local aggregation via `@xyeena/recap`; weekly metrics and exportable 1080×1920 SVG card. |
| **File Handling** | Native Drag-and-Drop | Implemented & Tested | `tauri://drag-drop` listener inspecting file metadata and data URLs without disk writes. |
| **Settings & UI** | Theme System | Implemented & Tested | Low-chroma Dark, crisp Light, and System themes conforming to WCAG AA contrast. |
| **Settings & UI** | Reduced Motion | Implemented & Tested | Respects OS `prefers-reduced-motion` and manual toggle to freeze all spring and mascot motion. |
| **Settings & UI** | Audio Feedback | Implemented & Tested | Synthesized Web Audio chimes for tap, salute, and alert feedback with volume slider. |
| **System** | Global Shortcuts | Deferred / Roadmap | Deferred to avoid keybinding collisions with active editors and operating systems. |
| **System** | Desktop Pet / Floating Window | Excluded by Design | Notch-first policy: character remains integrated inside the Island surface; no floating pet. |
| **System** | Automatic Hook Writing | Excluded by Design | Island companion maintains a strict read-only boundary over user repositories. |
| **System** | Remote Telemetry | Excluded by Design | Zero tracking pixels, analytics SDKs, or cloud telemetry. |
