# Security Audit Findings (S1–S9) — Phase 0

Audit conducted on 2026-10-20 against active repository checkout `5fcad08285633f11ef5992ef6d4eaf6ac4174a0b`.
In accordance with Phase 0 rules, no source modifications are made in this phase; findings serve as exact inputs for Phase 1 and later hardening.

---

## Reviewer-Reported Issues (S1–S5)

### S1: Session Key Lacks Window Identity
- **Status:** **CONFIRMED**
- **Location:** `apps/xyeena-island/src-tauri/src/agent_ipc/session.rs:20-32`, `apps/xyeena-island/src/core/session-store.mjs:121-125`
- **Evidence:**
  ```rust
  pub struct SessionKey {
      pub provider: String,
      pub session_id: String,
  }
  ```
- **Analysis:** The session key is strictly a 2-tuple `(provider, session_id)`. If two IDE instances or window processes execute with identical session IDs or without window handles, their session state, file tickers, and activity pills will collide and overwrite in `SessionRegistry`.
- **Minimal Reproduction / Test Idea:** Register two distinct events from `antigravity` with identical `session_id` but originating from different process PIDs or window titles; verify that `SessionRegistry.sessions` only retains a single entry.
- **Severity:** **HIGH** (State collision & cross-window telemetry ambiguity).

---

### S2: Approval Submission Not Forwarded to Provider
- **Status:** **CONFIRMED**
- **Location:** `apps/xyeena-island/src-tauri/src/lib.rs:1669-1685`, `apps/xyeena-island/src-tauri/src/agent_ipc/approval.rs:265-316`
- **Evidence:**
  In `lib.rs`:
  ```rust
  let resolved = approval_registry.submit_decision(...)?;
  let _ = app.emit("island:approval-resolved", &resolved);
  Ok(resolved)
  ```
- **Analysis:** `submit_approval_decision` mutates the in-memory `ApprovalRegistry` and emits an internal Tauri event to the frontend UI (`island:approval-resolved`). However, it never writes back to a named pipe, signals an OS event handle, or provides a bidirectional response back to the waiting agent CLI or IDE process. The agent process remains blocked or times out.
- **Minimal Reproduction / Test Idea:** Spawn a mock client waiting on approval; submit approval via `submit_approval_decision`; observe that no response frame or pipe ACK is delivered to the client handle.
- **Severity:** **HIGH** (Broken approval loop; non-functional interactive approvals).

---

### S3: Store Sets 'working' Unconditionally After PostToolUse
- **Status:** **CONFIRMED**
- **Location:** `apps/xyeena-island/src/core/session-store.mjs:220-224`
- **Evidence:**
  ```javascript
  case 'toolpost':
    session.state = 'active';
    session.status = 'working';
    break;
  ```
- **Analysis:** When a tool finishes execution (`PostToolUse`), the session state should transition to `thinking` (awaiting agent model reflection) or evaluate whether the turn is finished. Setting `session.status = 'working'` causes the UI and Xyn mascot to falsely display active tool execution indefinitely until another event arrives.
- **Minimal Reproduction / Test Idea:** Ingest a `PostToolUse` event with no subsequent events for 5 seconds; inspect `session.status`; assert it is `'working'` instead of `'thinking'` or `'idle'`.
- **Severity:** **MEDIUM** (Misleading visual state and mascot expression).

---

### S4: Pipe Security Descriptor Uses Owner Rights (OW)
- **Status:** **CONFIRMED**
- **Location:** `apps/xyeena-island/src-tauri/src/agent_ipc/pipe.rs:598, 707`
- **Evidence:**
  ```rust
  let sddl = HSTRING::from("D:P(A;;GRGW;;;OW)");
  ```
- **Analysis:** The SDDL string `D:P(A;;GRGW;;;OW)` uses the well-known SID `OW` (`Owner Rights`). While this restricts access to the object owner, Windows security best practices recommend binding explicitly to the specific user account SID (retrieved via `GetTokenInformation(TokenUser)`) to prevent unintended permission inheritance or elevation ambiguities in multi-session environments.
- **Minimal Reproduction / Test Idea:** Audit pipe DACL using Sysinternals `accesschk.exe \\.\pipe\xyeena-agent-<user>` to verify trustee identity.
- **Severity:** **LOW / MEDIUM** (Defense-in-depth authorization hardening).

---

### S5: Raw Payloads and Tool Inputs Carried into WebView
- **Status:** **CONFIRMED**
- **Location:** `apps/xyeena-island/src-tauri/src/agent_ipc/event.rs:267, 304`
- **Evidence:**
  ```rust
  pub struct NormalizedEvent {
      ...
      pub tool_input: Option<NormalizedToolInput>,
      pub tool_output: Option<String>,
      pub raw: serde_json::Value,
  }
  ```
- **Analysis:** `NormalizedEvent` clones the entire unparsed, unredacted incoming JSON `raw` payload and includes full `raw_args`. When emitted to the WebView via `app.emit("agent-event", &event)` or returned in queries, any sensitive content in the raw event (e.g. environment variables, file buffers, private paths) is directly accessible in the browser JavaScript context.
- **Minimal Reproduction / Test Idea:** Send an event with a hidden sensitive field `{"api_token": "secret123"}`; inspect the JavaScript payload received by `listen('agent-event')`; verify `event.payload.raw.api_token` contains `"secret123"`.
- **Severity:** **HIGH** (Sensitive data exposure to WebView).

---

## Additional System Audits (S6–S9)

### S6: Tauri Capability Files & Custom Command Allowlist
- **Status:** **CONFIRMED**
- **Location:** `apps/xyeena-island/src-tauri/capabilities/default.json`, `apps/xyeena-island/src-tauri/src/lib.rs:1754-1828`
- **Audit Findings:**
  1. `capabilities/default.json` defines permissions for the `"main"` window, permitting `core:default`, notification permissions, and clipboard read/write text.
  2. However, Tauri 2's `core:default` enables `invoke` of all 35 custom commands registered in `lib.rs`:
     - File system access: `read_dropped_file`
     - External process execution: `open_in_editor`, `open_in_terminal`
     - Audio hardware: `start_consented_recording`, `export_consented_recording`
     - Hook writing: `install_provider_hooks`, `uninstall_provider_hooks`
     - Credentials: `invoke_ai_proxy`
  3. No custom permission sets or command-level origin filters are defined. Any script running in `index.html` has unrestricted access to all 35 native commands.
- **Severity:** **HIGH** (Unbounded custom command surface in WebView).

---

### S7: Pipe Name Derivation & Server Integrity Validation
- **Status:** **CONFIRMED**
- **Location:** `apps/xyeena-island/src-tauri/src/agent_ipc/pipe.rs:58-66`, `apps/xyeena-island/src-tauri/src/bin/relay.rs:188-230`
- **Audit Findings:**
  1. Pipe name derivation relies on `std::env::var("USERNAME")` or `std::env::var("USER")`:
     ```rust
     format!(r"\\.\pipe\xyeena-agent-{}", sanitized)
     ```
     Environment variables can be overridden or spoofed by malicious local processes in user space.
  2. The relay binary (`xyeena-agent-relay.exe`) calls `CreateFileW` directly and writes frames over the named pipe. It performs **no validation** of the server endpoint (does not query server PID via `GetNamedPipeServerProcessId` or verify executable signing/path). A malicious process creating the same pipe name could harvest relay events.
- **Severity:** **MEDIUM** (Local pipe spoofing vulnerability).

---

### S8: Secret & Hook Payload Exposure Surfaces
- **Status:** **CONFIRMED**
- **Location:** `apps/xyeena-island/src/core/provider-credentials.mjs`, `apps/xyeena-island/src/main.ts:2173, 2241`, `apps/xyeena-island/src-tauri/src/ai_diagnostics.rs`
- **Audit Findings:**
  1. `provider-credentials.mjs` stores API keys in a JavaScript in-memory `Map`.
  2. `main.ts` retrieves keys with `providerCredentials.getKey(prov)` and passes them through `invoke_ai_proxy`. Keys reside in WebView memory and are exposed to any JavaScript memory inspection.
  3. `ai_diagnostics.rs` is properly hardened: it implements `sanitize_url` (redacting query keys) and strictly avoids logging prompts, headers, or bodies.
  4. Contract N3 requires stored keys to be held in Rust (Windows Credential Manager) and never returned to JS.
- **Severity:** **HIGH** (In-memory credential residency in JavaScript).

---

### S9: Hook Installer Filesystem Write Scope & Backup Guarantees
- **Status:** **CONFIRMED (Behaves safely as implemented)**
- **Location:** `apps/xyeena-island/src-tauri/src/agent_ipc/provider.rs:676-843`
- **Audit Findings:**
  1. **Write Paths:** Writes strictly to the target configuration file (`.agents/hooks.json` in workspace or `~/.gemini/config/hooks.json` in user global profile).
  2. **Backup Guarantees:** Creates an exact backup file `{path}.xyeena-notch.bak` prior to modifying any file.
  3. **Atomic Modification:** Writes updated JSON to a temporary file `{path}.xyeena-tmp` first, then executes an atomic rename.
  4. **Preservation:** Preserves all existing groups verbatim (e.g. `xyeena-rig-guided`).
  5. **Uninstall:** `uninstall_agy_hooks` creates a backup and surgically removes only the `xyeena-notch` group.
- **Severity:** **LOW / INFORMATIONAL** (Safe implementation; requires user consent before execution).
