# System Architecture

**Product:** Xyeena Notch / Xyeena Island
**Version:** 1.0.0-alpha.1
**Stack:** Tauri 2 (Rust) + Vanilla TypeScript (Vite) + Vanilla CSS

---

## 1. System Overview

Xyeena Notch is engineered as a local-first Windows companion application. The architecture strictly separates the desktop presentation layer from native operating system integrations and external AI providers:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Xyeena Island Frontend                          │
│                               (WebView2, DOM)                               │
│                                                                             │
│  ┌─────────────────────────┐  ┌───────────────────────┐  ┌───────────────┐  │
│  │     Adaptive Shell      │  │   Panel Viewports     │  │   Xyn Lion    │  │
│  │ (Wake, Compact, Glance, │  │ (Now, Clips, Activity,│  │ (<xyeena-     │  │
│  │   Expanded, Pinned)     │  │   Chat, Settings)     │  │   guardian>)  │  │
│  └────────────┬────────────┘  └───────────┬───────────┘  └───────┬───────┘  │
│               │                           │                      │          │
│  ┌────────────▼───────────────────────────▼──────────────────────▼───────┐  │
│  │                           Core Services Layer                         │  │
│  │  ClipboardHistory · ChatEngine · RunChangeFeed · ProviderCredentials  │  │
│  └────────────────────────────────────┬──────────────────────────────────┘  │
└───────────────────────────────────────┼─────────────────────────────────────┘
                                        │ Tauri IPC (Commands & Events)
┌───────────────────────────────────────▼─────────────────────────────────────┐
│                          Rust Native Core (src-tauri)                       │
│                                                                             │
│  ┌──────────────────────┐  ┌─────────────────────────┐  ┌────────────────┐  │
│  │   Window & Geometry  │  │  Media & Core Audio     │  │  Native AI     │  │
│  │ - Physical Placement │  │ - Windows GSMTC Sessions│  │  Transport     │  │
│  │ - Scale & Monitor    │  │ - Master Output Volume  │  │ - Curl Runner  │  │
│  │ - Hitbox & Framing   │  │ - Playback Transport    │  │ - Cancel Reg.  │  │
│  └──────────────────────┘  └─────────────────────────┘  └────────────────┘  │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                        │ Win32 & Network
                                        ▼
                  [ Windows OS (Win32, GSMTC, Audio) ]
                  [ Loopback AI (Ollama, LM Studio) ]
                  [ Cloud AI (Gemini, Claude, OpenAI) ]
```

---

## 2. Component Architecture

### A. Adaptive Island Window Shell
- **Single Window Architecture:** Exactly one native window (`main`) exists. Window creation, resizing, and monitor positioning are managed natively by Rust (`set_island_frame`).
- **Geometry Physics:** The transition between display modes (Compact, Glance, Expanded) is driven by `GeometryMotion`, utilizing damped harmonic spring mathematics adapted from Coucou under MIT.
- **Hitbox Boundary:** Window sizing and placement are calculated relative to the primary monitor's top center, bounding the physical hitbox strictly to the visible notch geometry.

### B. Xyn Lion Living Guardian (`@xyeena/xyn`)
- **Web Component Primitive:** Packaged as `<xyeena-guardian>` in `@xyeena/xyn`, encapsulating a custom HTML5 Canvas 2D rig (`LivingLionRig`).
- **WeakMap Gradient Caching:** Eliminates Direct2D brush churn by caching linear and radial gradient objects in a `WeakMap` keyed by 2D context.
- **Adaptive Frame Pacing:** Idle breathing and blinking pace at ~30 FPS (interval >= 32ms), reducing GPU composite cycles by over 50%. Active gestures (hops, salutes, active cursor tracking) seamlessly burst to 60 FPS.
- **Multi-Instance Lifecycle:** While the DOM maintains separate guardian slots for Compact, Glance, and Expanded modes, `syncActiveGuardian()` ensures only the currently visible mode's canvas loop is running (`start()`), while inactive instances are suspended (`stop()`).

### C. Unified Clipboard Manager (`ClipboardHistory`)
- **Session-Only Memory:** Clips are held in an in-memory array (`ClipItem[]`). No disk databases, local storage, or network sync mechanisms are attached.
- **Format Normalization:** Ingests text strings, image data URLs (BMP/PNG), and dropped file paths.
- **Cap Enforcement:** Automatically evicts older items to maintain a strict 64 MiB total heap threshold and 20 MiB per-image ceiling.
- **Read-Once Capability:** Allows destructive single-read retrieval: copying a Read-Once item purges it immediately from history.

### D. Multi-Provider AI Chat (`ChatEngine` & Rust Transport)
- **Credential Storage:** `ProviderCredentialStore` holds BYOK keys in private JavaScript Map instances in memory.
- **Non-Blocking Native Transport:** All completions are executed by Rust spawning `curl.exe` with process pipes:
  - Stdin delivers payload securely without command-line exposure.
  - Cancellations are registered atomically via request ID and killed via process handles.
  - Endpoints are validated against a strict authority allowlist. Loopback hosts (`localhost`/`127.0.0.1`) are required for local models.

### E. Weekly Recap Engine (`@xyeena/recap`)
- Independent workspace package aggregating local project events.
- Produces deterministic weekly counts, deduplicated runs, and renders standalone 1080×1920 SVG cards.

---

## 3. Trust Boundaries & Security Enforcements

1. **Local Content Security Policy:** The frontend executes exclusively from bundled local assets (`dist/`). No remote web pages or scripts can be loaded.
2. **Read-Only Project Boundary:** Run summaries only inspect `.xyeena/runs/*/snapshot.json` files. The application has no authority to write files or execute scripts in user project repositories.
3. **Loopback Isolation:** Ollama and LM Studio endpoints are hard-restricted to loopback hosts to prevent SSRF against internal network assets.
4. **Zero Ambient Listening:** Media tracking operates strictly through passive Windows GSMTC events. No microphone or audio input stream is ever opened.
