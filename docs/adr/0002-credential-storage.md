# ADR 0002: Native Credential Storage Architecture

## Status
Accepted

## Context
Xyeena Notch integrates with external AI providers (OpenAI, Anthropic, Gemini, Groq, OpenRouter, Mistral, Together, Perplexity, DeepSeek, Fireworks, Cohere, and local providers Ollama / LM Studio).

In the initial implementation (S8 audit finding):
1. `provider-credentials.mjs` held API keys in a JavaScript in-memory `Map` in the WebView.
2. `main.ts` retrieved keys with `providerCredentials.getKey(prov)` and passed them via `invoke_ai_proxy` as JavaScript string parameters.
3. API keys were thus resident in the WebView process memory, vulnerable to DOM-level scripts or WebView memory dumps.

## Options Considered

### Option 1: JavaScript In-Memory Map (Status Quo)
- **Pros:** Trivial implementation, zero native OS dependencies.
- **Cons:** Plaintext residency in Chromium/WebView2 renderer process memory. Leaks easily via inspect/dev tools or JS reflection. Lost on application restart unless persisted to `localStorage` (which is stored in plaintext on disk).
- **Verdict:** Rejected. Fails requirement S8 and Master Contract N3.

### Option 2: Plaintext File / Local `.env`
- **Pros:** Simple to read and write.
- **Cons:** Insecure disk persistence. Vulnerable to accidental git commit, filesystem scanning by unprivileged tools, and directory traversal. Fails the promise that secrets are not stored in unencrypted plaintext on disk.
- **Verdict:** Rejected for production. Permitted in `cfg(debug_assertions)` builds only for developer testing via gitignored `.env.local` or process environment variables (`XYEENA_<PROVIDER>_API_KEY`).

### Option 3: Windows Credential Manager (`wincred.h` / `CredWriteW`, `CredReadW`, `CredDeleteW`)
- **Pros:** Native Windows operating system secret store. Encrypted by DPAPI per-user. Survives reboots when user explicitly opts in (`persist: true`). Does not require third-party dependencies or external keyrings.
- **Cons:** Any code executing within the same Windows user session has access to Credential Manager items stored under that user account.
- **Verdict:** Accepted as the primary persistence mechanism for Windows.

### Option 4: Rust-Side In-Memory Storage (Session-Only Fallback)
- **Pros:** Default behavior when user does not check "Remember on this device" (`persist: false`). Secret never touches the disk. Erased when the application process terminates. Secret is never returned to JavaScript.
- **Cons:** Requires user to re-enter key on next launch.
- **Verdict:** Accepted as default non-persisted mode.

## Decision
1. **Authoritative Secret Boundary:** The Rust backend (`credentials.rs`) is the sole custodian of API keys.
2. **Persistence:**
   - When `persist: true` (user explicitly checks "Remember on this device"): store in Windows Credential Manager under target prefix `xyeena-island:<provider>`. Type: `CRED_TYPE_GENERIC`.
   - When `persist: false` (default): store in Rust-side in-memory `Mutex<HashMap<String, ZeroizingSecret>>`.
3. **No Key Retrieval in JS:** No Tauri command will ever return a stored key to JavaScript.
   - Tauri commands exposed:
     - `credential_status(provider: &str) -> { present: bool, persisted: bool }`
     - `credential_save(provider: &str, key: &str, persist: bool) -> Result<(), String>`
     - `credential_forget(provider: &str) -> Result<(), String>`
4. **Proxy Attachment:** `invoke_ai_proxy` in Rust resolves the API key internally from the credentials store right before executing the outbound curl/HTTP request. JavaScript does not provide or see the key.
5. **Debug vs Release:**
   - In `debug` builds (`cfg(debug_assertions)`): fallback to `XYEENA_<PROVIDER>_API_KEY` from process environment or `.env.local` is allowed for automated testing.
   - In `release` builds (`cfg(not(debug_assertions))`): strictly prohibited from reading `.env*` or arbitrary process environment secrets without explicit registration.
6. **Redaction:** Any formatted debug or display output of credential types must render `[REDACTED]`.

## Threat Model & Security Boundaries
- **Protected Against:**
  - Exposure of API keys to the WebView JavaScript runtime, DevTools inspect, or XSS in the frontend.
  - Plaintext secret storage on the local disk.
  - Accidental inclusion of secrets in crash reports, logs, or telemetry.
  - SSRF/endpoint confusion: Rust validates provider authority, scheme (HTTPS), port, and header policies before attaching the secret.
- **NOT Protected Against (Known Boundary):**
  - **Same-User Local Malware:** In the Windows security model, any arbitrary executable or script running as the same Windows user account can call `CredReadW` to query generic credentials stored by that user. DPAPI protects against offline disk theft and other user accounts on the machine, but does not isolate processes running under the identical user token.
  - **Memory Inspection of Host Process:** A process with `PROCESS_VM_READ` rights running under the same user token can inspect `xyeena-island.exe` virtual memory.
