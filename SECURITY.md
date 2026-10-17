# Security Policy

**Product:** Xyeena Notch / Xyeena Island
**Version:** 1.0.0-alpha.1 (Windows Parity Prerelease)
**Status:** Self-audited with 100% automated test coverage across Rust native core and TypeScript frontend.

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
│  - Zero Always-Allow approval policies        │
└───────────────────────┬───────────────────────┘
                        │ IPC (Strict Allowlist)
                        ▼
┌───────────────────────────────────────────────┐
│               Rust Native Core                │
│  - Windows Named Pipe IPC (per-user DACL)     │
│  - Authoritative approval token nonces (TTL)  │
│  - Strict URL authority & scheme validation   │
│  - Loopback-only routing for local models     │
│  - 3xx Redirect rejection                     │
│  - Bounded memory buffers (64 MiB total cap)  │
│  - Consented microphone capture only          │
│  - Windows Win32 GSMTC & Core Audio APIs      │
└───────────────────────────────────────────────┘
```

---

## 2. Specific Security Controls

### A. Windows Named Pipe IPC & Per-User Isolation
- **Per-User DACL:** Native agent relay and hooks communicate over Windows Named Pipe `\\.\pipe\xyeena-agent-<username>`. The pipe DACL grants access exclusively to the current logged-in user SID and Windows Administrators. Other OS users cannot connect or inject synthetic events.
- **Framing & Size Ceilings:** Messages are framed using length-prefixed headers with strict 1 MiB maximum frame size and 100-continue header filtering to prevent memory exhaustion.

### B. Authoritative Native Approval Registry (`agent_ipc::approval`)
- **Strict Single-Use Nonces:** Every interactive approval request generates a cryptographically random 32-character hex token nonce.
- **Bounded Expiry (TTL):** Pending approvals expire automatically after 3 minutes (180,000 ms). Expired requests fail-closed without granting execution permission.
- **Action Fingerprint Integrity:** Approvals are cryptographically bound to the SHA-256 hash of the exact tool name and parameters. Tampered parameters invalidate the token.
- **Zero Always-Allow Policy:** The application strictly enforces `Allow Once`, `Deny`, and structured question responses. `Always Allow` is permanently disabled in protocol rules to prevent persistent privilege escalation.

### C. Session-Only BYOK (Bring-Your-Own-Key)
- API keys entered for cloud providers (Google Gemini, Anthropic Claude, OpenAI, OpenRouter) are stored exclusively in an in-memory session store (`providerCredentials`).
- **Never Persisted:** Keys are never written to `localStorage`, `sessionStorage`, IndexedDB, configuration files, or Windows Registry.
- **Never Logged:** Keys are omitted from diagnostics, telemetry, UI error surfaces, and debug output.
- **Process Protection:** Outbound curl executions receive keys strictly via standard input piping, ensuring zero credentials leak into operating system process lists (`tasklist`, `Get-Process`).

### D. Native AI Transport & Endpoint Validation
All AI completions are proxied through a non-blocking native curl runner in Rust (`invoke('run_ai_completion')`) with strict enforcement:
- **Authority Whitelist:** Only canonical API hosts are permitted:
  - `generativelanguage.googleapis.com` (Gemini)
  - `api.anthropic.com` (Claude)
  - `api.openai.com` (OpenAI)
  - `openrouter.ai` (OpenRouter)
- **Local Model Routing:** Ollama and LM Studio endpoints MUST resolve to `http://localhost:<port>` or `http://127.0.0.1:<port>`. Port 0 is rejected. Cloud credentials are hard-rejected on local endpoints.
- **Redirects Prohibited:** Any HTTP 3xx redirect response is treated as an immediate protocol violation and rejected (`Redirects are forbidden for native AI transport`).
- **Header Isolation:** Cloud provider headers are isolated per provider (e.g. `x-goog-api-key` is only permitted for Gemini; `x-api-key` and `anthropic-version` only for Anthropic; `Authorization: Bearer` only for OpenAI/OpenRouter).

### E. Consented Microphone Privacy & Zero Background Capture
- **Explicit Boolean Consent Gate:** Recording endpoints (`start_consented_recording`) reject invocation unless `userConsented: true` is explicitly provided.
- **Prominent Visual Indicators:** Red recording badges (`#compact-mic-indicator`, `#header-mic-indicator`) remain active throughout live capture, preventing covert background listening.
- **Bounded Session Memory:** Saved notes are retained in session memory with a 20-entry maximum boundary.

### F. Android Companion Local Cryptographic Pairing
- **Zero Cloud Relay:** Mobile companion pairing operates exclusively over the local network via 6-digit numeric PIN, 32-byte secret nonce, and QR payload schema (`xyeena-companion-v1`).
- **Cryptographic Signatures:** Mobile decisions require valid HMAC/FNV signatures computed with the shared secret. Tampered decisions are rejected.
- **Immediate Revocation:** The revocation control wipes paired credentials and resets session state instantly.

### G. Clipboard Privacy & Memory Bounds
- **Explicit Consent:** Clipboard history capture defaults to **DISABLED** at startup. It activates only upon deliberate user toggle in the running session.
- **Ephemeral Storage:** Clips exist strictly in heap memory; nothing is written to disk or transmitted over the network.
- **Resource Limits:**
  - Max total clipboard buffer: **64 MiB**.
  - Max single image size: **20 MiB** (larger images are discarded with a notification).
  - Max history entries: Configurable 20, 50, or 100 items.
- **Sensitive Data Filter:** Patterns resembling private keys, JWTs, and passwords are automatically filtered.
- **Full Purge:** Clicking "Clear history" or closing the application zeroes the clipboard buffer.

### H. Diagnostic Log Sanitization
- The diagnostic log exporter (`btn-export-diagnostics`) redacts user names, local absolute file paths, and potential API token patterns (`sk-...`, `AIza...`, `Bearer ...`).

---

## 3. Vulnerability Disclosure

If you discover a security vulnerability in Xyeena Notch, please report it responsibly:

1. **Email:** Send details to `hrizqullah484@gmail.com` with the subject `[SECURITY] Xyeena Notch Vulnerability`.
2. **Details to Include:**
   - Detailed description of the issue and potential impact.
   - Minimal reproducible proof-of-concept.
   - Operating system and version information.
3. **Coordinated Disclosure:** Please allow up to 72 hours for an initial response before public disclosure.
