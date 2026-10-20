# ADR 0004: Window Architecture — Single Island Window Baseline & Optional Multi-Window Feasibility

- **Status:** Proposed (Baseline Single Window Accepted; D3 Secondary Window Proposed Pending Explicit Owner Consent)
- **Date:** 2026-10-20
- **Author:** Xyeena Engineering
- **Deciders:** Hafizh Rizqullah, Xyeena Axazeela
- **Context:** Parity & UI Rebuild Pack v2, Phase 2 W4 & W5.

---

## 1. Context & Problem Statement

Xyeena Island currently operates as a compact Windows desktop notch companion rendered within a single Tauri 2 webview window (`label: "main"`). The application provides transport controls, clipboard management, agent monitoring, AI chat, and comprehensive desktop preferences (Settings).

In desktop UX audits (Coucou reference), standalone popup or secondary dialog windows are frequently used for complex preference pages to avoid cramping the primary companion notch. However, in Windows environments running Tauri 2 / WebView2, creating a secondary webview window has non-trivial operational implications:
1. **Memory Overhead:** Spawning a second WebView2 window instantiates an additional child process tree (Renderer, GPU/Utility processes), typically requiring +40–70 MiB of working set RAM.
2. **IPC & Authorization Boundaries:** Secondary webviews run in separate JavaScript runtime realms that cannot share in-memory module state (e.g. `sessionStore`, `providerCredentials`). Authoritative state must reside in Rust (`settings_store.rs`), and privileged IPC commands must enforce caller-window authorization (not just static capability manifests).
3. **Window Lifecycle on Windows:** Floating secondary windows require explicit monitor affinity matching, focus restoration, taskbar visibility management, and graceful teardown (`destroy()` vs `hide()`) to prevent ghost processes.

---

## 2. Decision

### Baseline (Active & Shipped):
1. **Preserve Single-Window Island Architecture as Default:** The existing in-island Settings route (`#page-preferences`) remains fully functional and accessible within the primary notch window.
2. **Modularize Settings Primitives:** Settings controls are refactored into reusable, typed UI primitives (`SecretField`, `Toggle`, `Select`, `Button`, `Row`, `SectionHeader`, `ScrollArea`) that can mount either in-island or inside a standalone webview without code duplication.
3. **Authoritative State in Rust:** All persistent preferences (theme, language, reduced-motion, sound) remain authoritatively managed by Rust `settings_store.rs` (Phase 1) via `settings_get` and `settings_patch`. No redundant JS stores are introduced.

### Proposed Secondary Window Extension (D3 — Approval Gate Pending):
1. **Multi-Entry Vite Configuration:** Provide `settings.html` sharing `src/ui`, `src/styles`, `src/core` with `index.html`.
2. **Lazy Window Initialization:** The `settings` window is created lazily upon explicit user action via `open_settings()`, positioned on the same monitor as the Island notch, resizable within strict bounds (min 420x480, default 540x620).
3. **Strict Caller-Label Authorization in Rust:** Every privileged IPC command checks the caller webview label (`window.label()`). Commands requiring elevated agent or credential authority are denied if originating from unauthorized secondary windows.
4. **Activation Gate:** The secondary window will NOT be enabled in production until the repository owner explicitly consents to D3.

---

## 3. Evaluated Options

### Option A: Immediate Forced Secondary Window (Migrate and Delete In-Island Settings)
- **Trade-offs:** Forces all users to pay +50 MiB RAM overhead just to tweak theme or volume; risks breaking single-monitor notch workflows if secondary window positioning glitches on multi-DPI displays.
- **Verdict:** **Rejected.** Violates Master Contract Safeguard D3 and non-destructive phase boundaries.

### Option B: Monolithic In-Island Settings Forever
- **Trade-offs:** Avoids memory overhead, but cramps complex settings (developer relay, hook diff preview, AI model lists) within the 380px notch panel.
- **Verdict:** **Rejected as exclusive long-term model; retained as baseline.**

### Option C: Reusable Component Layer with Single-Window Default and Multi-Window Seam (CHOSEN)
- **Trade-offs:** Zero added idle memory overhead in production; modular components are ready to mount into `settings.html` the instant D3 is approved; complete backwards compatibility.
- **Verdict:** **Accepted.**

---

## 4. Multi-Entry Vite Feasibility Design

Vite configuration (`vite.config.js`) multi-entry blueprint:
```javascript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        settings: resolve(__dirname, 'settings.html')
      }
    }
  }
});
```

Shared directories across both entry points:
- `src/ui/**`: Modular UI primitives (`Button`, `SecretField`, `Tabs`, `Row`, etc.)
- `src/styles/**`: Design tokens (`tokens.css`, `base.css`, `layout.css`)
- `src/core/**`: IPC communication, i18n dictionaries, and state clients

---

## 5. Security & IPC Authorization Contract

If a secondary window is instantiated:
1. Tauri capability manifests scope permissions per window label:
   - `capabilities/desktop.json`: applies only to `main`.
   - `capabilities/settings.json`: grants only `settings_get`, `settings_patch`, `get_app_version`, `open_url`.
2. Rust backend enforces defense-in-depth authorization in command handlers:
   ```rust
   #[tauri::command]
   pub async fn save_credential(window: tauri::WebviewWindow, provider: String, key: String) -> Result<(), String> {
       if window.label() != "main" && window.label() != "settings" {
           return Err("Unauthorized window caller".into());
       }
       // ...
   }
   ```
3. Secret Protection: Stored API keys are never transmitted to the frontend webview. `SecretField` receives only a boolean `isConfigured` status.

---

## 6. Resource Measurement Projection

Baseline Island (Single Window):
- Host Rust Process: ~14–18 MiB private bytes.
- Total WebView2 Tree (Host + GPU + Renderers): ~65–85 MiB working set.

Projected with Secondary Settings Window Open (UNVERIFIED until native benchmark run):
- Additional Dedicated Renderer Process: ~35–45 MiB working set.
- Total Combined Footprint: ~105–130 MiB working set.
- On Close (`destroy()`): Reclaims ~35–45 MiB back to single-window baseline within 1–2 GC cycles.
