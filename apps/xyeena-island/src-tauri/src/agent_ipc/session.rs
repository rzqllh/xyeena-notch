//! Agent session model and registry.
//!
//! Tracks active and historical agent sessions identified by composite key
//! `(provider, session_id)`, records lifecycle state transitions, maintains
//! workspace context, and prunes stale sessions exceeding TTL.

use crate::agent_ipc::event::{NormalizedEvent, NormalizedEventType};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Lifecycle state of an agent session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    Active,
    Idle,
    Terminated,
}

/// Composite key uniquely identifying a session across providers.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SessionKey {
    pub provider: String,
    pub session_id: String,
}

impl SessionKey {
    pub fn new(provider: impl Into<String>, session_id: impl Into<String>) -> Self {
        Self {
            provider: provider.into(),
            session_id: session_id.into(),
        }
    }
}

/// A monitored agent session in the local registry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentSession {
    pub provider: String,
    pub session_id: String,
    pub state: SessionState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    pub started_at_ms: u64,
    pub last_activity_ms: u64,
    pub event_count: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_tool_command: Option<String>,
}

/// Result of processing an event in the session registry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionTransition {
    Created(AgentSession),
    Updated(AgentSession),
    Terminated(AgentSession),
}

/// In-memory registry of agent sessions.
#[derive(Debug, Default)]
pub struct SessionRegistry {
    sessions: HashMap<SessionKey, AgentSession>,
}

impl SessionRegistry {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    /// Process a normalized event, updating or creating the corresponding session.
    pub fn handle_event(&mut self, event: &NormalizedEvent) -> SessionTransition {
        let key = SessionKey::new(&event.provider, &event.session_id);
        let now = event.timestamp_ms;

        match event.event_type {
            NormalizedEventType::SessionStart => {
                let session = AgentSession {
                    provider: event.provider.clone(),
                    session_id: event.session_id.clone(),
                    state: SessionState::Active,
                    workspace_root: event.workspace_root.clone(),
                    cwd: event.cwd.clone(),
                    started_at_ms: now,
                    last_activity_ms: now,
                    event_count: 1,
                    last_tool_name: None,
                    last_tool_command: None,
                };
                self.sessions.insert(key, session.clone());
                SessionTransition::Created(session)
            }
            NormalizedEventType::SessionEnd => {
                if let Some(session) = self.sessions.get_mut(&key) {
                    session.state = SessionState::Terminated;
                    session.last_activity_ms = now;
                    session.event_count += 1;
                    SessionTransition::Terminated(session.clone())
                } else {
                    let session = AgentSession {
                        provider: event.provider.clone(),
                        session_id: event.session_id.clone(),
                        state: SessionState::Terminated,
                        workspace_root: event.workspace_root.clone(),
                        cwd: event.cwd.clone(),
                        started_at_ms: now,
                        last_activity_ms: now,
                        event_count: 1,
                        last_tool_name: None,
                        last_tool_command: None,
                    };
                    self.sessions.insert(key, session.clone());
                    SessionTransition::Terminated(session)
                }
            }
            _ => {
                let last_tool_command = event
                    .tool_input
                    .as_ref()
                    .and_then(|input| input.command.clone());

                if let Some(session) = self.sessions.get_mut(&key) {
                    session.state = SessionState::Active;
                    session.last_activity_ms = now;
                    session.event_count += 1;
                    if event.workspace_root.is_some() {
                        session.workspace_root = event.workspace_root.clone();
                    }
                    if event.cwd.is_some() {
                        session.cwd = event.cwd.clone();
                    }
                    if event.tool_name.is_some() {
                        session.last_tool_name = event.tool_name.clone();
                    }
                    if last_tool_command.is_some() {
                        session.last_tool_command = last_tool_command;
                    }
                    SessionTransition::Updated(session.clone())
                } else {
                    // Implicit session creation on first observed event
                    let session = AgentSession {
                        provider: event.provider.clone(),
                        session_id: event.session_id.clone(),
                        state: SessionState::Active,
                        workspace_root: event.workspace_root.clone(),
                        cwd: event.cwd.clone(),
                        started_at_ms: now,
                        last_activity_ms: now,
                        event_count: 1,
                        last_tool_name: event.tool_name.clone(),
                        last_tool_command,
                    };
                    self.sessions.insert(key, session.clone());
                    SessionTransition::Created(session)
                }
            }
        }
    }

    /// Retrieve an existing session by provider and session ID.
    pub fn get_session(&self, provider: &str, session_id: &str) -> Option<&AgentSession> {
        let key = SessionKey::new(provider, session_id);
        self.sessions.get(&key)
    }

    /// Get all currently active sessions.
    pub fn active_sessions(&self) -> Vec<AgentSession> {
        self.sessions
            .values()
            .filter(|s| s.state == SessionState::Active)
            .cloned()
            .collect()
    }

    /// Get all tracked sessions regardless of state.
    pub fn all_sessions(&self) -> Vec<AgentSession> {
        self.sessions.values().cloned().collect()
    }

    /// Prune sessions based on TTL:
    /// - Active sessions whose `last_activity_ms + idle_ttl_ms < now_ms` become `Idle`.
    /// - Terminated sessions whose `last_activity_ms + retain_terminated_ms < now_ms` are removed entirely.
    pub fn prune_stale(&mut self, idle_ttl_ms: u64, retain_terminated_ms: u64, now_ms: u64) {
        self.sessions.retain(|_, session| match session.state {
            SessionState::Active => {
                if now_ms.saturating_sub(session.last_activity_ms) > idle_ttl_ms {
                    session.state = SessionState::Idle;
                }
                true
            }
            SessionState::Idle => true,
            SessionState::Terminated => {
                now_ms.saturating_sub(session.last_activity_ms) <= retain_terminated_ms
            }
        });
    }

    /// Total count of sessions in the registry.
    pub fn len(&self) -> usize {
        self.sessions.len()
    }

    /// Check if registry has no sessions.
    pub fn is_empty(&self) -> bool {
        self.sessions.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_ipc::event::NormalizedToolInput;

    fn make_test_event(
        event_type: NormalizedEventType,
        provider: &str,
        session_id: &str,
        time: u64,
    ) -> NormalizedEvent {
        NormalizedEvent {
            event_type,
            provider: provider.to_string(),
            session_id: session_id.to_string(),
            timestamp_ms: time,
            cwd: Some("C:\\repo".into()),
            workspace_root: Some("C:\\repo".into()),
            tool_name: None,
            tool_input: None,
            tool_output: None,
            raw: serde_json::Value::Null,
        }
    }

    #[test]
    fn test_session_lifecycle_happy_path() {
        let mut registry = SessionRegistry::new();

        // 1. Session Start
        let start_ev = make_test_event(
            NormalizedEventType::SessionStart,
            "claude-code",
            "sess-1",
            1000,
        );
        let trans = registry.handle_event(&start_ev);
        assert!(matches!(trans, SessionTransition::Created(_)));
        let sess = registry
            .get_session("claude-code", "sess-1")
            .expect("must exist");
        assert_eq!(sess.state, SessionState::Active);
        assert_eq!(sess.event_count, 1);

        // 2. Tool Event
        let mut tool_ev =
            make_test_event(NormalizedEventType::ToolPre, "claude-code", "sess-1", 1500);
        tool_ev.tool_name = Some("Bash".into());
        tool_ev.tool_input = Some(NormalizedToolInput {
            command: Some("git status".into()),
            ..Default::default()
        });
        let trans = registry.handle_event(&tool_ev);
        assert!(matches!(trans, SessionTransition::Updated(_)));
        let sess = registry.get_session("claude-code", "sess-1").unwrap();
        assert_eq!(sess.event_count, 2);
        assert_eq!(sess.last_tool_name.as_deref(), Some("Bash"));
        assert_eq!(sess.last_tool_command.as_deref(), Some("git status"));

        // 3. Session End
        let end_ev = make_test_event(
            NormalizedEventType::SessionEnd,
            "claude-code",
            "sess-1",
            2000,
        );
        let trans = registry.handle_event(&end_ev);
        assert!(matches!(trans, SessionTransition::Terminated(_)));
        let sess = registry.get_session("claude-code", "sess-1").unwrap();
        assert_eq!(sess.state, SessionState::Terminated);
    }

    #[test]
    fn test_concurrent_sessions_isolated() {
        let mut registry = SessionRegistry::new();

        let s1 = make_test_event(
            NormalizedEventType::SessionStart,
            "claude-code",
            "sess-A",
            100,
        );
        let s2 = make_test_event(NormalizedEventType::SessionStart, "codex", "sess-B", 100);

        registry.handle_event(&s1);
        registry.handle_event(&s2);

        assert_eq!(registry.len(), 2);
        assert_eq!(registry.active_sessions().len(), 2);

        // Terminate s1, s2 should remain active
        let end1 = make_test_event(
            NormalizedEventType::SessionEnd,
            "claude-code",
            "sess-A",
            200,
        );
        registry.handle_event(&end1);

        assert_eq!(
            registry.get_session("claude-code", "sess-A").unwrap().state,
            SessionState::Terminated
        );
        assert_eq!(
            registry.get_session("codex", "sess-B").unwrap().state,
            SessionState::Active
        );
        assert_eq!(registry.active_sessions().len(), 1);
    }

    #[test]
    fn test_ttl_expiry_and_pruning() {
        let mut registry = SessionRegistry::new();

        // Session 1: Started at 1000, now is 4000 (idle delta 3000)
        let s1 = make_test_event(NormalizedEventType::SessionStart, "agent1", "sess-1", 1000);
        registry.handle_event(&s1);

        // Session 2: Terminated at 1000
        let s2_start = make_test_event(NormalizedEventType::SessionStart, "agent2", "sess-2", 500);
        let s2_end = make_test_event(NormalizedEventType::SessionEnd, "agent2", "sess-2", 1000);
        registry.handle_event(&s2_start);
        registry.handle_event(&s2_end);

        assert_eq!(registry.len(), 2);

        // Idle TTL = 2000 ms, Terminated retain = 2500 ms, now = 4000 ms
        // s1: 4000 - 1000 = 3000 > 2000 -> Active becomes Idle
        // s2: 4000 - 1000 = 3000 > 2500 -> Terminated is pruned
        registry.prune_stale(2000, 2500, 4000);

        assert_eq!(registry.len(), 1);
        let s1_cur = registry.get_session("agent1", "sess-1").unwrap();
        assert_eq!(s1_cur.state, SessionState::Idle);
        assert!(registry.get_session("agent2", "sess-2").is_none());
    }
}
