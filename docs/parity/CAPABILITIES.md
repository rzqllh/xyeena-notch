# Tauri Window & Command Capabilities Audit (Phase 1 / W9)

**Document:** `docs/parity/CAPABILITIES.md`  
**Scope:** Authoritative capability mapping per window, custom command allowlist, plugin permissions, least-privilege analysis, and README claims audit.  
**Phase:** Phase 1 (Core P0: Session identity, Activity state, Approval pipeline, Secrets/Credentials, Pipe & CI hardening).

---

## 1. Window Definitions

| Window Label | URL / Entry | Dimensions | Decorations | Transparent | Always-On-Top | Skip Taskbar | Focusable | Drag/Drop | Purpose |
|---|---|---|---|---|---|---|---|---|---|
| `main` | `index.html` | 352 × 52 (dynamic up to 500 × 520) | `false` | `true` | `true` | `true` | `false` (default) | `true` | Sole desktop window: Notch overlay island, multi-agent status, approval dialog, quick actions, settings. |

*Note: Per master contract invariant, Xyeena Notch in alpha maintains strictly **one window** (`main`). No secondary detached windows or separate desktop overlays are spawned.*

---

## 2. Tauri Plugin Permissions (`capabilities/default.json`)

The `main` window is granted the following Tauri v2 plugin capabilities:

| Permission Identifier | Plugin | Purpose | Least-Privilege Assessment |
|---|---|---|---|
| `core:default` | Tauri Core | Event listener/emitter, window label resolution, lifecycle | **Required** for fundamental IPC. |
| `notification:allow-is-permission-granted` | Notifications | Check OS notification permissions | **Required** for opt-in alert system. |
| `notification:allow-request-permission` | Notifications | Request OS notification permission | **Required** on first user opt-in. |
| `notification:allow-notify` | Notifications | Emit OS desktop toast notifications | **Required** for background agent alerts. |
| `clipboard-manager:allow-read-text` | Clipboard | Read plain text from Windows clipboard | **Required** for clipboard snippet integration. |
| `clipboard-manager:allow-write-text` | Clipboard | Write plain text to Windows clipboard | **Required** for copy actions. |

### Prohibited / Omitted Plugin Permissions
- `fs:*`: No arbitrary file system access from JavaScript. File operations are mediated exclusively through bounded native Rust commands (`save_file_to_downloads`, `read_dropped_file` with size bounds).
- `shell:*`: No arbitrary shell execution from JavaScript.
- `http:*`: No raw JavaScript network sockets bypassing security/redaction gates.
- `global-shortcut:*`: Handled natively or restricted.

---

## 3. Custom Native IPC Commands Allowlist (`src-tauri/src/lib.rs`)

The `invoke_handler` registers the following authoritative commands:

### A. Window Geometry & Island Motion
| Command | Input Arguments | Output | Security & Bounds Enforcement |
|---|---|---|---|
| `set_island_mode` | `mode: Mode` | `Result<(), String>` | Validates enum; rejects arbitrary modes fail-closed. |
| `set_island_frame` | `frame: FrameDimensions` | `Result<(), String>` | Enforces `MIN_ISLAND_WIDTH` (320), `MAX_ISLAND_WIDTH` (500), `MAX_ISLAND_HEIGHT` (520). Rejects NaN / negative. |
| `set_window_priority` | `topmost: bool` | `Result<(), String>` | Sets HWND Z-order via Win32 API. |
| `hide_island_window` | None | `Result<(), String>` | Hides main window safely. |
| `recenter_island` | None | `Result<(), String>` | Re-centers notch on primary monitor work area. |

### B. System Telemetry & Media
| Command | Input Arguments | Output | Security & Bounds Enforcement |
|---|---|---|---|
| `read_island_cursor` | None | `Option<CursorPos>` | Win32 `GetCursorPos` bounded. |
| `read_native_clipboard` | None | `Result<ClipboardPayload, String>` | BMP/DIB conversion, size bounded (5MB cap). |
| `write_native_image` | `payload: WriteImagePayload` | `Result<(), String>` | Validates BMP/PNG magic headers before clipboard write. |
| `clipboard::get_clipboard_sequence_number` | None | `u32` | Win32 `GetClipboardSequenceNumber`. |
| `save_file_to_downloads` | `filename: String, data_base64: String` | `Result<String, String>` | Sanitizes filename (strips `..`, separators); writes strictly into user Downloads directory. |
| `read_dropped_file` | `path: String` | `Result<DroppedFilePayload, String>` | Max 5MB file size bound; truthful format validation. |
| `media::get_media_session` | None | `Option<MediaSessionInfo>` | Windows GSMTC read-only metadata. |
| `media::get_media_sessions` | None | `Vec<MediaSessionInfo>` | Max 8 bounded playback sessions. |
| `media::media_transport` | `action: MediaAction` | `Result<(), String>` | Play/pause/next/previous controls via GSMTC. |
| `media::media_seek` | `position_ms: u64` | `Result<(), String>` | GSMTC timeline seeking. |
| `media::media_shuffle` | `enabled: bool` | `Result<(), String>` | GSMTC shuffle toggle. |
| `media::media_repeat` | `mode: String` | `Result<(), String>` | GSMTC repeat mode. |
| `volume::get_master_volume` | None | `Result<VolumeStatus, String>` | WASAPI master volume read. |
| `volume::set_master_volume` | `level: f32` | `Result<(), String>` | Clamped 0.0 ..= 1.0. |
| `volume::set_master_mute` | `mute: bool` | `Result<(), String>` | WASAPI mute toggle. |

### C. Agent Sessions & IPC Pipeline (Phase 1 Authoritative)
| Command | Input Arguments | Output | Security & Bounds Enforcement |
|---|---|---|---|
| `get_agent_ipc_pipe_name` | None | `String` | Returns canonical named pipe URI `\\.\pipe\xyeena-notch-agent-ipc`. |
| `get_agent_sessions` | None | `Vec<SessionDto>` | Sanitized DTO allowlist (W5). Excludes `raw` and `tool_input`. Max 16 sessions. Unique display name resolution with collision rules. |
| `detect_agent_providers` | None | `Vec<ProviderDetectionResult>` | Scans local filesystem/config for installed agent CLI binaries. |
| `preview_provider_hooks` | `provider: String` | `Result<HookPreview, String>` | Dry-run diff of hooks config file. No persistent change. |
| `install_provider_hooks` | `provider: String` | `Result<HookInstallResult, String>` | Atomic backup + update of provider hooks configuration. |
| `uninstall_provider_hooks`| `provider: String` | `Result<HookUninstallResult, String>` | Restores pre-installation backup safely. |

### D. Approvals & Credentials (Phase 1 Authoritative)
| Command | Input Arguments | Output | Security & Bounds Enforcement |
|---|---|---|---|
| `get_pending_approvals` | None | `Vec<ApprovalDto>` | Authoritative pending approval queue. Max 32 bounded entries. Strips raw payload, validates origin and nonce. |
| `submit_approval_decision`| `internal_request_id: String, decision: ApprovalDecision, auth_token: String` | `Result<ApprovalDecisionResponse, ApprovalError>` | Fail-closed gate: armed delay (600ms), nonce verification, single-use idempotent token, verified provider response contract. |
| `credential_status` | `provider: String` | `Result<CredentialStatusDto, String>` | Reports `configured: bool` and `storage_type: "wincred" \| "memory"`. **Never returns the stored secret.** |
| `credential_save` | `provider: String, secret: String, persist: bool` | `Result<(), String>` | Writes to Windows Credential Manager (`xyeena-island:<provider>`) or in-memory zeroizing secret. |
| `credential_forget` | `provider: String` | `Result<(), String>` | Purges credential from both Windows Credential Manager and memory. |

### E. Settings & Session Management
| Command | Input Arguments | Output | Security & Bounds Enforcement |
|---|---|---|---|
| `settings_set_alias` | `session_id: String, alias: String` | `Result<Option<String>, String>` | Sanitizes alias (strips control chars, path delimiters, max 32 chars). Atomic file write. |
| `settings_get_alias` | `session_id: String` | `Result<Option<String>, String>` | Reads user alias from atomic settings store. |
| `settings_set_focus` | `session_id: Option<String>` | `Result<(), String>` | Updates manual focus pin in settings store. |
| `settings_get_focus` | None | `Result<Option<String>, String>` | Reads manual focus pin. |

### F. Developer & Diagnostics
| Command | Input Arguments | Output | Security & Bounds Enforcement |
|---|---|---|---|
| `developer::get_workspace_diff` | `workspace_root: String, max_bytes: Option<usize>` | `Result<WorkspaceDiffResult, String>` | Path traversal check (`validate_path_within_root`), bounded diff size (max 256KB). |
| `developer::open_in_editor` | `workspace_root: String, file_path: Option<String>` | `Result<(), String>` | Validates workspace root exists; executes known editor launcher (`code`, `cursor`). |
| `developer::open_in_terminal` | `workspace_root: String` | `Result<(), String>` | Opens terminal in verified directory. |
| `github::get_github_status` | `workspace_root: String` | `Result<GitHubStatusResult, String>` | Runs `gh pr view` / `gh run list` read-only; sanitizes output. |
| `integrations::list_supported_integrations` | None | `Vec<IntegrationCatalogEntry>` | Static integration catalog. |
| `integrations::check_integration_status` | `provider: String` | `Result<IntegrationStatus, String>` | Validates endpoints without sending credentials. |
| `ai_diagnostics::set_ai_diagnostics_enabled` | `enabled: bool` | `Result<(), String>` | Opt-in ring buffer toggle. |
| `ai_diagnostics::get_ai_diagnostics_status` | None | `Result<AiDiagnosticsStatus, String>` | Ring buffer summary. |
| `ai_diagnostics::clear_ai_diagnostics` | None | `Result<(), String>` | Flushes ring buffer. |

### G. Voice & Companion
| Command | Input Arguments | Output | Security & Bounds Enforcement |
|---|---|---|---|
| `voice::get_microphone_status` | None | `Result<MicrophoneStatus, String>` | Checks default capture device via WASAPI. |
| `voice::start_consented_recording` | `consent: bool` | `Result<(), String>` | Enforces explicit boolean user consent; fails closed otherwise. |
| `voice::pause_consented_recording` | None | `Result<(), String>` | WASAPI capture pause. |
| `voice::resume_consented_recording` | None | `Result<(), String>` | WASAPI capture resume. |
| `voice::stop_consented_recording` | None | `Result<RecordingResult, String>` | Stops capture, writes to temporary PCM/WAV buffer. |
| `voice::export_consented_recording` | `destination: String` | `Result<(), String>` | Exports recorded audio with path boundary check. |
| `voice::parse_voice_intent` | `transcript: String` | `VoiceIntentResult` | Pure heuristic text command parser. |
| `companion::get_companion_state` | None | `Result<CompanionStateDto, String>` | Read-only pairing status. |
| `companion::request_companion_pairing` | None | `Result<PairingRequestDto, String>` | Generates 6-digit code and CSPRNG pairing secret. |
| `companion::confirm_companion_pairing` | `code: String, secret: String` | `Result<bool, String>` | Constant-time HMAC comparison. |
| `companion::revoke_companion_device` | None | `Result<(), String>` | Revokes companion secret. |
| `companion::verify_mobile_approval_decision` | `decision: MobileApprovalDto` | `Result<bool, String>` | Cryptographic signature verification. |
| `companion::execute_mobile_approval_decision` | `decision: MobileApprovalDto` | `Result<(), String>` | Delegates to authoritative approval pipeline. |

---

## 4. README Claims Audit (Phase 1)

In accordance with Phase 1 W9 instructions, we record repository claims in `README.md` that are currently false, misleading, or pending later phases. *(Per contract, `README.md` is NOT modified in Phase 1; it will be formally updated in Phase 6).*

1. **Claim: "Production-ready Windows Dynamic Island"**
   - *Current Reality:* Currently in `1.0.0-alpha.1` prerelease. Core IPC, approvals, and credential store have been hardened in Phase 1, but UI rebuild (Phase 2–4) and multi-provider parity (Phase 3) remain in progress.
2. **Claim: "Instant real-time approvals for Claude Code, Codex, and Gemini CLI"**
   - *Current Reality:* Antigravity relay hooks are fully verified and tested. Claude Code, Codex, and Gemini CLI hooks are planned for Phase 3 and must not claim live bidirectional interactive approval support until verified response contracts are implemented.
3. **Claim: "Local offline whisper transcription"**
   - *Current Reality:* Audio capture uses WASAPI native capture with explicit consent. Dictation uses Windows WinRT speech recognition when available, with clean fallback. Offline whisper model integration is planned for later enhancement.
4. **Claim: "Unlimited concurrent session monitoring"**
   - *Current Reality:* Formally bounded to `MAX_LIVE_SESSIONS = 16` with a ring buffer of 200 timeline entries to prevent memory exhaustion and UI thrashing.

---

## 5. Security & Isolation Summary
- **Credential Storage:** Secrets are stored in Windows Credential Manager (`xyeena-island:<provider>`) or ephemeral memory. JavaScript never receives stored secrets.
- **Outbound Telemetry (DTO Boundary):** `raw` provider payloads and `tool_input` argument dictionaries are completely stripped. Text is sanitized (C0/C1 control chars stripped, bidi overrides removed, secrets redacted, bounded to 160 chars).
- **Fail-Closed Approvals:** Nonces are cryptographically generated with 600ms armed delay protection. Approvals without verified interactive providers are rejected with explicit failure.
