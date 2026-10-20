//! System and Protocol Limits for Agent IPC
//!
//! Centralizes all bounds, ring-buffer sizes, timeouts, and delays for Phase 1 and beyond.

/// Maximum number of concurrently tracked live agent sessions.
/// Oldest ended sessions are evicted when this limit is reached.
pub const MAX_LIVE_SESSIONS: usize = 16;

/// Capacity of the per-session timeline entry ring buffer.
pub const TIMELINE_RING_BUFFER_CAP: usize = 200;

/// Default misclick protection delay before an approval decision can be submitted.
pub const ARM_DELAY_MS: u64 = 600;

/// Maximum time-to-live for a pending approval request (120 seconds).
pub const APPROVAL_TTL_MS: u64 = 120_000;

/// Duration after a tool finishes where a session remains `RecentlyActive` (8 seconds).
pub const T_RECENT_MS: u64 = 8_000;

/// Inactivity duration while a tool is executing before a session is marked `Stalled` (120 seconds).
pub const T_STALLED_MS: u64 = 120_000;

/// Inactivity duration before an unclosed session is marked `Ended(Timeout)` (10 minutes).
pub const T_TTL_MS: u64 = 600_000;

/// Maximum length of general display strings (characters).
pub const MAX_FIELD_LENGTH_CHARS: usize = 2048;

/// Maximum length for summary lines displayed in pills / cards.
pub const MAX_SUMMARY_LENGTH_CHARS: usize = 256;

/// Maximum length for action previews in approval cards.
pub const MAX_PREVIEW_LENGTH_CHARS: usize = 512;

/// Maximum payload size allowed for IPC frames (512 KB).
pub const MAX_FRAME_SIZE_BYTES: usize = 512 * 1024;

/// Maximum allowed length for tool command line preview.
pub const MAX_COMMAND_PREVIEW_CHARS: usize = 160;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[allow(clippy::assertions_on_constants)]
    fn test_limits_constants_sanity() {
        assert!(MAX_LIVE_SESSIONS >= 4 && MAX_LIVE_SESSIONS <= 64);
        assert!(TIMELINE_RING_BUFFER_CAP >= 50 && TIMELINE_RING_BUFFER_CAP <= 1000);
        assert!(ARM_DELAY_MS >= 300 && ARM_DELAY_MS <= 2000);
        assert!(APPROVAL_TTL_MS >= 30_000 && APPROVAL_TTL_MS <= 300_000);
        assert!(T_RECENT_MS >= 3_000 && T_RECENT_MS <= 30_000);
        assert!(T_STALLED_MS >= 30_000 && T_STALLED_MS <= 600_000);
        assert!(T_TTL_MS >= 60_000 && T_TTL_MS <= 3_600_000);
        assert!(MAX_FRAME_SIZE_BYTES >= 64 * 1024 && MAX_FRAME_SIZE_BYTES <= 2 * 1024 * 1024);
    }
}
