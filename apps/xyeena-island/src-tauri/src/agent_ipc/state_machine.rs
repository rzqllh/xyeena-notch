//! Authoritative Agent Activity State Machine (Pure Reducer)
//!
//! Evaluates session transitions strictly via pure function `reduce(state, event, now_ms)`.
//! Eliminates misleading UI states (e.g. S3 unconditional 'working' on PostToolUse).

use super::limits::{T_RECENT_MS, T_STALLED_MS, T_TTL_MS};
use serde::{Deserialize, Serialize};

/// Classification of tools.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolKind {
    Command,
    Edit,
    Read,
    Browser,
    Other,
}

impl ToolKind {
    pub fn copy_key(&self) -> &'static str {
        match self {
            ToolKind::Command => "agents.state.tool_running.command",
            ToolKind::Edit => "agents.state.tool_running.edit",
            ToolKind::Read => "agents.state.tool_running.read",
            ToolKind::Browser => "agents.state.tool_running.other",
            ToolKind::Other => "agents.state.tool_running.other",
        }
    }
}

/// Reason for session termination.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EndReason {
    Normal,
    Timeout,
    Error,
    Cancelled,
}

impl EndReason {
    pub fn copy_key(&self) -> &'static str {
        match self {
            EndReason::Normal => "agents.state.ended.normal",
            EndReason::Timeout => "agents.state.ended.timeout",
            EndReason::Error => "agents.state.error",
            EndReason::Cancelled => "agents.state.ended.normal",
        }
    }
}

/// Comprehensive state enum.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ActivityState {
    Idle,
    ToolRunning {
        tool_kind: ToolKind,
        started_at_ms: u64,
    },
    RecentlyActive {
        last_tool_finished_at_ms: u64,
    },
    AwaitingApproval {
        internal_request_id: String,
        armed_at_ms: u64,
    },
    Stalled {
        stalled_since_ms: u64,
    },
    Ended {
        reason: EndReason,
    },
    Error {
        message_key: String,
    },
}

impl ActivityState {
    /// Returns canonical localization copy key for this state.
    pub fn copy_key(&self) -> &'static str {
        match self {
            ActivityState::Idle => "agents.state.idle",
            ActivityState::ToolRunning { tool_kind, .. } => tool_kind.copy_key(),
            ActivityState::RecentlyActive { .. } => "agents.state.recently_active",
            ActivityState::AwaitingApproval { .. } => "agents.state.awaiting_approval",
            ActivityState::Stalled { .. } => "agents.state.stalled",
            ActivityState::Ended { reason } => reason.copy_key(),
            ActivityState::Error { .. } => "agents.state.error",
        }
    }

    /// Whether this state is terminal (ended or unrecoverable error).
    pub fn is_terminal(&self) -> bool {
        matches!(self, ActivityState::Ended { .. })
    }

    /// Whether this state represents active live operation.
    pub fn is_live(&self) -> bool {
        !self.is_terminal()
    }
}

/// Incoming transition events.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ActivityEvent {
    ToolPre {
        tool_kind: ToolKind,
    },
    ToolPost {
        exit_code: Option<i32>,
    },
    ApprovalRequested {
        internal_request_id: String,
        armed_at_ms: u64,
        interactive_allowed: bool,
    },
    ApprovalResolved {
        internal_request_id: String,
    },
    Tick {
        last_event_at_ms: u64,
    },
    Stop,
    ErrorEvent {
        message_key: String,
    },
}

/// Pure reducer evaluating state transitions.
pub fn reduce(state: ActivityState, event: ActivityEvent, now_ms: u64) -> ActivityState {
    // Terminal states reject subsequent operational events unless re-initialized
    if state.is_terminal() {
        return state;
    }

    match event {
        ActivityEvent::Stop => ActivityState::Ended {
            reason: EndReason::Normal,
        },

        ActivityEvent::ErrorEvent { message_key } => ActivityState::Error { message_key },

        ActivityEvent::ToolPre { tool_kind } => ActivityState::ToolRunning {
            tool_kind,
            started_at_ms: now_ms,
        },

        ActivityEvent::ToolPost { .. } => {
            // S3 fix: PostToolUse MUST NOT set working or idle, but RecentlyActive
            ActivityState::RecentlyActive {
                last_tool_finished_at_ms: now_ms,
            }
        }

        ActivityEvent::ApprovalRequested {
            internal_request_id,
            armed_at_ms,
            interactive_allowed,
        } => {
            if interactive_allowed {
                ActivityState::AwaitingApproval {
                    internal_request_id,
                    armed_at_ms,
                }
            } else {
                // If interactive approval is not allowed, remain in current state
                state
            }
        }

        ActivityEvent::ApprovalResolved { .. } => {
            if matches!(state, ActivityState::AwaitingApproval { .. }) {
                ActivityState::RecentlyActive {
                    last_tool_finished_at_ms: now_ms,
                }
            } else {
                state
            }
        }

        ActivityEvent::Tick { last_event_at_ms } => {
            // 1. Check TTL expiry for live sessions
            if now_ms.saturating_sub(last_event_at_ms) >= T_TTL_MS {
                return ActivityState::Ended {
                    reason: EndReason::Timeout,
                };
            }

            // 2. State-specific timeouts
            match state {
                ActivityState::RecentlyActive {
                    last_tool_finished_at_ms,
                } => {
                    if now_ms.saturating_sub(last_tool_finished_at_ms) >= T_RECENT_MS {
                        ActivityState::Idle
                    } else {
                        state
                    }
                }
                ActivityState::ToolRunning { started_at_ms, .. } => {
                    if now_ms.saturating_sub(started_at_ms) >= T_STALLED_MS {
                        ActivityState::Stalled {
                            stalled_since_ms: now_ms,
                        }
                    } else {
                        state
                    }
                }
                _ => state,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initial_to_tool_running() {
        let state = ActivityState::Idle;
        let event = ActivityEvent::ToolPre {
            tool_kind: ToolKind::Command,
        };
        let next = reduce(state, event, 1000);
        assert_eq!(
            next,
            ActivityState::ToolRunning {
                tool_kind: ToolKind::Command,
                started_at_ms: 1000,
            }
        );
        assert_eq!(next.copy_key(), "agents.state.tool_running.command");
    }

    #[test]
    fn test_s3_post_tool_use_transitions_to_recently_active() {
        let state = ActivityState::ToolRunning {
            tool_kind: ToolKind::Edit,
            started_at_ms: 1000,
        };
        let event = ActivityEvent::ToolPost { exit_code: Some(0) };
        let next = reduce(state, event, 2500);
        assert_eq!(
            next,
            ActivityState::RecentlyActive {
                last_tool_finished_at_ms: 2500,
            }
        );
        assert_eq!(next.copy_key(), "agents.state.recently_active");
    }

    #[test]
    fn test_recently_active_expires_to_idle_on_tick() {
        let state = ActivityState::RecentlyActive {
            last_tool_finished_at_ms: 1000,
        };
        // Tick before T_RECENT
        let tick1 = ActivityEvent::Tick {
            last_event_at_ms: 1000,
        };
        let next1 = reduce(state.clone(), tick1, 1000 + T_RECENT_MS - 1);
        assert_eq!(next1, state);

        // Tick at or after T_RECENT
        let tick2 = ActivityEvent::Tick {
            last_event_at_ms: 1000,
        };
        let next2 = reduce(state, tick2, 1000 + T_RECENT_MS);
        assert_eq!(next2, ActivityState::Idle);
        assert_eq!(next2.copy_key(), "agents.state.idle");
    }

    #[test]
    fn test_tool_running_becomes_stalled_on_tick() {
        let state = ActivityState::ToolRunning {
            tool_kind: ToolKind::Command,
            started_at_ms: 1000,
        };
        // Tick at stalled threshold
        let tick = ActivityEvent::Tick {
            last_event_at_ms: 1000,
        };
        let next = reduce(state, tick, 1000 + T_STALLED_MS);
        assert_eq!(
            next,
            ActivityState::Stalled {
                stalled_since_ms: 1000 + T_STALLED_MS,
            }
        );
        assert_eq!(next.copy_key(), "agents.state.stalled");
    }

    #[test]
    fn test_ttl_expiry_ends_session() {
        let state = ActivityState::Idle;
        let tick = ActivityEvent::Tick {
            last_event_at_ms: 1000,
        };
        let next = reduce(state, tick, 1000 + T_TTL_MS);
        assert_eq!(
            next,
            ActivityState::Ended {
                reason: EndReason::Timeout,
            }
        );
        assert_eq!(next.copy_key(), "agents.state.ended.timeout");
        assert!(next.is_terminal());
    }

    #[test]
    fn test_approval_lifecycle() {
        let state = ActivityState::Idle;
        let req = ActivityEvent::ApprovalRequested {
            internal_request_id: "req-123".to_string(),
            armed_at_ms: 1600,
            interactive_allowed: true,
        };
        let awaiting = reduce(state, req, 1000);
        assert_eq!(
            awaiting,
            ActivityState::AwaitingApproval {
                internal_request_id: "req-123".to_string(),
                armed_at_ms: 1600,
            }
        );

        let resolve = ActivityEvent::ApprovalResolved {
            internal_request_id: "req-123".to_string(),
        };
        let after_resolve = reduce(awaiting, resolve, 2000);
        assert_eq!(
            after_resolve,
            ActivityState::RecentlyActive {
                last_tool_finished_at_ms: 2000,
            }
        );
    }

    #[test]
    fn test_approval_requested_rejected_when_not_interactive() {
        let state = ActivityState::Idle;
        let req = ActivityEvent::ApprovalRequested {
            internal_request_id: "req-123".to_string(),
            armed_at_ms: 1600,
            interactive_allowed: false,
        };
        let next = reduce(state.clone(), req, 1000);
        assert_eq!(
            next, state,
            "Must reject transition if interactive not allowed"
        );
    }

    #[test]
    fn test_terminal_state_rejects_subsequent_events() {
        let ended = ActivityState::Ended {
            reason: EndReason::Normal,
        };
        let event = ActivityEvent::ToolPre {
            tool_kind: ToolKind::Command,
        };
        let next = reduce(ended.clone(), event, 5000);
        assert_eq!(
            next, ended,
            "Terminal state cannot be modified by tool events"
        );
    }
}
