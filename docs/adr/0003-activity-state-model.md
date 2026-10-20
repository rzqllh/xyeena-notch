# ADR 0003: Agent Activity State Model & Reducer

## Status
Accepted

## Context
Upstream Coucou Windows 0.5.0 and earlier Xyeena Notch implementations exhibited several state tracking flaws (audit finding S3):
1. Receiving a `PostToolUse` event set session state to `working` unconditionally, leading to permanent "working" status if no subsequent event arrived.
2. Status was loosely tracked and recomputed in JavaScript frontend code without authoritative timestamp tracking or clock injection.
3. State transitions failed to distinguish between tool execution, idle waiting, user approval required, stalled/unresponsive turns, and clean termination.
4. "Finished running" was conflated with "succeeded" even when the provider event carried no exit code or result status.

## Decision

### 1. Authoritative Rust State Machine
The state of every agent session is computed by a pure reducer in Rust (`agent_ipc/state_machine.rs`).
The reducer signature is:
```rust
pub fn reduce(state: ActivityState, event: ActivityEvent, now_ms: u64) -> ActivityState
```
JavaScript never computes or infers activity status; it receives a sanitized `ActivityStatusDto` from Rust.

### 2. State Enum
```rust
pub enum ActivityState {
    Idle,
    ToolRunning { tool_kind: ToolKind, started_at_ms: u64 },
    RecentlyActive { last_tool_finished_at_ms: u64 },
    AwaitingApproval { internal_request_id: String, armed_at_ms: u64 },
    Stalled { stalled_since_ms: u64 },
    Ended { reason: EndReason },
    Error { message_key: String },
}
```

### 3. Transition Table

| From State | Event / Trigger | Next State | Rationale & Rules |
|---|---|---|---|
| Any non-ended | `ToolPre` (tool execution begins) | `ToolRunning` | Record `tool_kind` (command, edit, read, other) and start timestamp. |
| `ToolRunning` | `ToolPost` (tool execution ends) | `RecentlyActive` | Transition to `RecentlyActive`, NOT `working` or `idle`. Record `last_tool_finished_at_ms`. Do not assert success unless verified by exit code. |
| `RecentlyActive` | Timer tick (`now_ms >= last_tool_finished_at_ms + T_recent`) | `Idle` | Derived by periodic timer tick, not by an explicit provider event. |
| `RecentlyActive` / `Idle` | `ToolPre` | `ToolRunning` | New tool starts. |
| Any live state | `ApprovalRequested` (verified origin only) | `AwaitingApproval` | Session has interactive approval capability and request is authenticated. |
| `AwaitingApproval` | `ApprovalResolved` / Expired / Cancelled | `RecentlyActive` or `Idle` | Returns to active workflow or idle upon resolution. |
| Live `ToolRunning` | Timer tick (`now_ms >= started_at_ms + T_stalled`) | `Stalled` | Indicates "no new activity received", not a verified failure. |
| Any live state | `Stop` event | `Ended(Normal)` | Agent completed turn or session ended. |
| Any live state | Timer tick (`now_ms >= last_activity_ms + T_ttl`) | `Ended(Timeout)` | Orphan session cleanup when agent process exited without sending Stop. |
| Any live state | `Error` event | `Error` | Provider signaled explicit failure. |

### 4. Tunable Timing Constants & Rationale

- **`T_recent = 8_000 ms` (8 seconds):**
  - *Rationale:* After a tool finishes executing, the LLM model typically takes 2–6 seconds to ingest tool output and plan the next invocation. 8 seconds prevents flickering between active and idle between rapid successive tool calls while keeping UI responsive.
  - *Tunability:* Tunable constant in `agent_ipc/limits.rs`.
- **`T_stalled = 120_000 ms` (120 seconds / 2 minutes):**
  - *Rationale:* Long-running compiler commands, docker builds, or large file downloads can take up to 2 minutes. If no telemetry frame is received in 120 seconds during tool execution, marking as `Stalled` alerts the user without killing the session.
  - *Tunability:* Tunable constant in `agent_ipc/limits.rs`.
- **`T_ttl = 600_000 ms` (600 seconds / 10 minutes):**
  - *Rationale:* Sessions that receive no events for 10 minutes are assumed orphaned (e.g. IDE was closed abruptly, agent crashed without sending Stop). Evicts stale memory structures while preserving timeline history up to the ring buffer limit.
  - *Tunability:* Tunable constant in `agent_ipc/limits.rs`.

### 5. Localization Copy Keys (EN + ID)
All states map to translation keys instead of hardcoded English strings:
- `agents.state.idle`: "Idle" / "Siaga"
- `agents.state.tool_running.command`: "Running command" / "Menjalankan perintah"
- `agents.state.tool_running.edit`: "Editing file" / "Mengubah berkas"
- `agents.state.tool_running.read`: "Reading file" / "Membaca berkas"
- `agents.state.tool_running.other`: "Executing tool" / "Menjalankan alat"
- `agents.state.recently_active`: "Recently active" / "Baru saja aktif"
- `agents.state.awaiting_approval`: "Awaiting approval" / "Menunggu persetujuan"
- `agents.state.stalled`: "No recent activity" / "Tidak ada aktivitas baru"
- `agents.state.ended.normal`: "Completed" / "Selesai"
- `agents.state.ended.timeout`: "Timed out" / "Batas waktu habis"
- `agents.state.error`: "Error" / "Kesalahan"
