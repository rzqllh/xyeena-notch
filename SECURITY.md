# Security Policy

**Product:** Xyeena Notch / Xyeena Island
**Version:** 1.0.0-alpha.1 (Experimental Windows Prerelease)
**Status:** Independent security audit pending. Self-audited with automated verification.

---

## 1. Threat Model & Trust Boundaries

Xyeena Notch runs locally on Windows as a Tauri 2 desktop application hosting a WebView2 frontend. The core security design minimizes blast radius and enforces strict trust boundaries:

```
[ Local User Desktop ]
         │
         ▼
┌───────────────────────────────────────────────┐
│              WebView2 Frontend                │
│  - No remote page loads (local dist only)    │
│  - CSP: script-src 'self'; connect-src 'self' │
│  - In-memory BYOK credentials only            │
└───────────────────────┬───────────────────────┘
                        │ IPC (Strict Allowlist)
                        ▼
┌───────────────────────────────────────────────┐
│               Rust Native Core                │
│  - Strict URL authority & scheme validation   │
│  - Loopback-only routing for local models     │
│  - 3xx Redirect rejection                     │
│  - Bounded memory buffers (64 MiB total cap)  │
│  - Windows Win32 GSMTC & Core Audio APIs      │
└───────────────────────────────────────────────┘
```

---

## 2. Specific Security Controls

### A. Session-Only BYOK (Bring-Your-Own-Key)
- API keys entered for cloud providers (Google Gemini, Anthropic Claude, OpenAI, OpenRouter) are stored exclusively in an in-memory session store (`#keys` private Map).
- **Never Persisted:** Keys are never written to `localStorage`, `sessionStorage`, IndexedDB, configuration files, or Windows Registry.
- **Never Logged:** Keys are omitted from diagnostics, telemetry, UI error surfaces, and debug output.
- **Immediate Expiry:** Closing the application completely frees all keys from memory.

### B. Native AI Transport & Endpoint Validation
All AI completions are proxied through a non-blocking native curl runner in Rust (`invoke('run_ai_completion')`) with strict enforcement:
- **Authority Whitelist:** Only canonical API hosts are permitted:
  - `generativelanguage.googleapis.com` (Gemini)
  - `api.anthropic.com` (Claude)
  - `api.openai.com` (OpenAI)
  - `openrouter.ai` (OpenRouter)
- **Local Model Routing:** Ollama and LM Studio endpoints MUST resolve to `http://localhost:<port>` or `http://127.0.0.1:<port>`. Port 0 is rejected. Cloud credentials are hard-rejected on local endpoints.
- **Redirects Prohibited:** Any HTTP 3xx redirect response is treated as an immediate protocol violation and rejected (`Redirects are forbidden for native AI transport`).
- **Header Isolation:** Cloud provider headers are isolated per provider (e.g. `x-goog-api-key` is only permitted for Gemini; `x-api-key` and `anthropic-version` only for Anthropic; `Authorization: Bearer` only for OpenAI/OpenRouter).

### C. Clipboard Privacy & Memory Bounds
- **Explicit Consent:** Clipboard history capture defaults to **DISABLED** at startup. It activates only upon deliberate user toggle in the running session.
- **Ephemeral Storage:** Clips exist strictly in heap memory; nothing is written to disk or transmitted over the network.
- **Resource Limits:**
  - Max total clipboard buffer: **64 MiB**.
  - Max single image size: **20 MiB** (larger images are discarded with a notification).
  - Max history entries: Configurable 20, 50, or 100 items.
- **Read Once Mode:** Sensitive items can be captured with single-read destruction: copying the item purges it immediately from history.
- **Full Purge:** Clicking "Clear history" or closing the application zeroes the clipboard buffer.

### D. Filesystem & Run Summaries Scope
- The application has **read-only** access to project run snapshots (`.xyeena/runs/*/snapshot.json`).
- Path traversal outside the chosen directory is blocked.
- The application cannot modify, overwrite, execute, or delete files in user project workspaces.

### E. Diagnostic Log Sanitization
- The diagnostic log exporter (`btn-export-diagnostics`) redacts user names, local absolute file paths, and potential API token patterns (`sk-...`, `AIza...`, `Bearer ...`).

---

## 3. Security Limitations of the Alpha Prerelease

- **Unsigned Binaries:** Alpha installers and executables are unsigned. They are distributed with SHA-256 checksums on GitHub Releases.
- **Heuristic Secret Detection:** While the clipboard manager includes filtering for common token patterns, it is not an enterprise Data Loss Prevention (DLP) system.
- **Local Device Security:** Any process running with current-user privileges on the same Windows session can inspect process memory. Protect your desktop environment accordingly.

---

## 4. Vulnerability Disclosure

If you discover a security vulnerability in Xyeena Notch, please report it responsibly:

1. **Email:** Send details to `hrizqullah484@gmail.com` with the subject `[SECURITY] Xyeena Notch Vulnerability`.
2. **Details to Include:**
   - Detailed description of the issue and potential impact.
   - Minimal reproducible proof-of-concept.
   - Operating system and version information.
3. **Coordinated Disclosure:** Please allow up to 72 hours for an initial response before public disclosure. Fixes will be published in an updated GitHub prerelease with appropriate credit.
