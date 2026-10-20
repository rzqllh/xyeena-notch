//! Agent session model, identity resolution, and registry.
//!
//! Guarantees (W1):
//! - Canonical key stays (provider, session_id) with optional provider-verified window_binding.
//! - Pure display name resolution order:
//!   user alias -> verified session title -> workspace folder · #<4> -> provider · #<4>.
//! - Collision rule: if two live sessions would show the same label, both get the #<4> suffix;
//!   if 4 chars collide, extend to 6.
//! - Manual focus pin: user chooses focused session; activity on non-focused sessions raises
//!   attention flag (counter) but never switches focus.
//! - Bounds: max 16 live sessions, ring buffer of 200 timeline entries per session.

use super::dto::{sanitize_display_text, SessionDto, TimelineEntryDto};
use super::event::{NormalizedEvent, NormalizedEventType};
use super::limits::{MAX_LIVE_SESSIONS, TIMELINE_RING_BUFFER_CAP};
use super::state_machine::{self, ActivityEvent, ActivityState, EndReason, ToolKind};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::Path;

/// Lifecycle state for backward compatibility.
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

/// Extract workspace folder name from path.
pub fn extract_workspace_name(path_str: &str) -> Option<String> {
    let p = Path::new(path_str);
    p.file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

/// Computes display name for a single session without collision suffix.
pub fn compute_base_display_label(
    alias: Option<&str>,
    verified_title: Option<&str>,
    workspace_root: Option<&str>,
    provider: &str,
    session_id: &str,
) -> String {
    // 1. User alias
    if let Some(a) = alias {
        let clean = a.trim();
        if !clean.is_empty() {
            return clean.to_string();
        }
    }

    // 2. Verified session title
    if let Some(t) = verified_title {
        let clean = t.trim();
        if !clean.is_empty() {
            return clean.to_string();
        }
    }

    let id_slice_4 = if session_id.len() >= 4 {
        &session_id[..4]
    } else {
        session_id
    };

    // 3. Workspace folder name · #<4>
    if let Some(w) = workspace_root {
        if let Some(folder) = extract_workspace_name(w) {
            return format!("{} · #{}", folder, id_slice_4);
        }
    }

    // 4. Provider · #<4>
    format!("{} · #{}", provider, id_slice_4)
}

/// Resolves unique display names for a collection of live sessions,
/// applying the collision rule: if two live sessions would show the same label,
/// both get the #<4> suffix; if the 4 chars collide, extend to 6.
pub fn resolve_all_session_labels<'a, I>(sessions: I) -> HashMap<SessionKey, String>
where
    I: IntoIterator<Item = (&'a SessionKey, &'a AgentSession, Option<&'a str>)>,
{
    let mut session_bases: Vec<(SessionKey, String, &'a AgentSession)> = Vec::new();
    let mut label_counts: HashMap<String, usize> = HashMap::new();

    for (key, session, alias) in sessions {
        let base = compute_base_display_label(
            alias,
            session.verified_title.as_deref(),
            session.workspace_root.as_deref(),
            &session.provider,
            &session.session_id,
        );
        *label_counts.entry(base.clone()).or_insert(0) += 1;
        session_bases.push((key.clone(), base, session));
    }

    let mut result = HashMap::new();

    for (key, base, session) in session_bases {
        let count = *label_counts.get(&base).unwrap_or(&1);
        if count <= 1 {
            result.insert(key, base);
        } else {
            // Collision detected! Append #<4> or #<6>
            let id = &session.session_id;
            let id_4 = if id.len() >= 4 { &id[..4] } else { id.as_str() };
            let candidate_4 = format!("{} · #{}", base, id_4);

            let id_6 = if id.len() >= 6 { &id[..6] } else { id.as_str() };
            let final_label = if candidate_4.ends_with(&format!("#{}", id_4)) && count > 1 {
                // If base already ended with id_4, extend to id_6
                if base.ends_with(&format!("#{}", id_4)) {
                    format!("{} (ext #{})", base, id_6)
                } else {
                    candidate_4
                }
            } else {
                candidate_4
            };
            result.insert(key, final_label);
        }
    }

    // Secondary pass to verify no identical labels remain among live sessions
    let mut final_counts: HashMap<String, Vec<SessionKey>> = HashMap::new();
    for (k, label) in &result {
        final_counts
            .entry(label.clone())
            .or_default()
            .push(k.clone());
    }

    for (label, keys) in final_counts {
        if keys.len() > 1 {
            // Extend with 6 chars
            for k in keys {
                let id = &k.session_id;
                let id_6 = if id.len() >= 6 { &id[..6] } else { id.as_str() };
                result.insert(k.clone(), format!("{} #{}", label, id_6));
            }
        }
    }

    result
}

/// A monitored agent session in the local registry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentSession {
    pub provider: String,
    pub session_id: String,
    pub state: SessionState,
    pub activity_state: ActivityState,
    pub window_binding: Option<String>,
    pub verified_title: Option<String>,
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
    pub attention_count: u32,
    pub active_approval_id: Option<String>,
    #[serde(skip)]
    pub timeline: VecDeque<TimelineEntryDto>,
}

impl AgentSession {
    pub fn new(
        provider: String,
        session_id: String,
        workspace_root: Option<String>,
        cwd: Option<String>,
        now_ms: u64,
    ) -> Self {
        Self {
            provider,
            session_id,
            state: SessionState::Active,
            activity_state: ActivityState::Idle,
            window_binding: None,
            verified_title: None,
            workspace_root,
            cwd,
            started_at_ms: now_ms,
            last_activity_ms: now_ms,
            event_count: 1,
            last_tool_name: None,
            last_tool_command: None,
            attention_count: 0,
            active_approval_id: None,
            timeline: VecDeque::with_capacity(TIMELINE_RING_BUFFER_CAP),
        }
    }

    pub fn to_dto(
        &self,
        display_name: String,
        is_focused: bool,
        alias: Option<String>,
    ) -> SessionDto {
        SessionDto {
            session_id: self.session_id.clone(),
            provider: self.provider.clone(),
            display_name,
            alias,
            workspace_label: self
                .workspace_root
                .as_deref()
                .and_then(extract_workspace_name),
            window_binding: self.window_binding.clone(),
            activity_state: self.activity_state.clone(),
            state_copy_key: self.activity_state.copy_key().to_string(),
            attention_count: self.attention_count,
            is_focused,
            last_event_at_ms: self.last_activity_ms,
            active_approval_id: self.active_approval_id.clone(),
        }
    }

    pub fn push_timeline_entry(&mut self, entry: TimelineEntryDto) {
        if self.timeline.len() >= TIMELINE_RING_BUFFER_CAP {
            self.timeline.pop_front();
        }
        self.timeline.push_back(entry);
    }
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
    focused_session_id: Option<String>,
}

impl SessionRegistry {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            focused_session_id: None,
        }
    }

    /// Sets the manually pinned focused session ID.
    pub fn set_focused_session(&mut self, session_id: Option<String>) {
        self.focused_session_id = session_id;
        // If focused session changed, clear attention count for the newly focused session
        if let Some(ref focused_id) = self.focused_session_id {
            for session in self.sessions.values_mut() {
                if &session.session_id == focused_id {
                    session.attention_count = 0;
                }
            }
        }
    }

    pub fn get_focused_session(&self) -> Option<String> {
        self.focused_session_id.clone()
    }

    /// Process a normalized event, updating or creating the corresponding session.
    pub fn handle_event(&mut self, event: &NormalizedEvent) -> SessionTransition {
        let key = SessionKey::new(&event.provider, &event.session_id);
        let now = event.timestamp_ms;

        // Determine tool kind
        let tool_kind = event.tool_name.as_deref().map(|name| {
            let lower = name.to_ascii_lowercase();
            if lower.contains("command")
                || lower.contains("shell")
                || lower.contains("bash")
                || lower.contains("run")
            {
                ToolKind::Command
            } else if lower.contains("edit") || lower.contains("write") || lower.contains("patch") {
                ToolKind::Edit
            } else if lower.contains("read") || lower.contains("view") || lower.contains("search") {
                ToolKind::Read
            } else if lower.contains("browser") {
                ToolKind::Browser
            } else {
                ToolKind::Other
            }
        });

        // Determine activity event for reducer
        let act_event = match event.event_type {
            NormalizedEventType::SessionStart => None,
            NormalizedEventType::SessionEnd => Some(ActivityEvent::Stop),
            NormalizedEventType::ToolPre => Some(ActivityEvent::ToolPre {
                tool_kind: tool_kind.unwrap_or(ToolKind::Other),
            }),
            NormalizedEventType::ToolPost => Some(ActivityEvent::ToolPost { exit_code: None }),
            NormalizedEventType::Prompt => Some(ActivityEvent::ToolPre {
                tool_kind: ToolKind::Other,
            }),
            NormalizedEventType::Notification => None,
            NormalizedEventType::PermissionRequest => None,
            NormalizedEventType::Other(_) => None,
        };

        // Enforce MAX_LIVE_SESSIONS bounds before adding new session
        if !self.sessions.contains_key(&key) && self.sessions.len() >= MAX_LIVE_SESSIONS {
            self.evict_oldest();
        }

        let is_focused = self
            .focused_session_id
            .as_ref()
            .map(|f| f == &event.session_id)
            .unwrap_or(false);

        let transition = match event.event_type {
            NormalizedEventType::SessionEnd => {
                if let Some(session) = self.sessions.get_mut(&key) {
                    session.state = SessionState::Terminated;
                    session.activity_state = ActivityState::Ended {
                        reason: EndReason::Normal,
                    };
                    session.last_activity_ms = now;
                    session.event_count += 1;
                    SessionTransition::Terminated(session.clone())
                } else {
                    let mut session = AgentSession::new(
                        event.provider.clone(),
                        event.session_id.clone(),
                        event.workspace_root.clone(),
                        event.cwd.clone(),
                        now,
                    );
                    session.state = SessionState::Terminated;
                    session.activity_state = ActivityState::Ended {
                        reason: EndReason::Normal,
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

                    if let Some(ae) = act_event {
                        session.activity_state =
                            state_machine::reduce(session.activity_state.clone(), ae, now);
                    }

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
                        session.last_tool_command = last_tool_command.clone();
                    }

                    // Increment attention count if non-focused session has activity
                    if !is_focused && self.focused_session_id.is_some() {
                        session.attention_count = session.attention_count.saturating_add(1);
                    }

                    // Add timeline entry
                    let entry = TimelineEntryDto {
                        entry_id: format!("{}-{}", session.session_id, session.event_count),
                        session_id: session.session_id.clone(),
                        timestamp_ms: now,
                        event_kind: format!("{:?}", event.event_type),
                        summary: sanitize_display_text(
                            session.last_tool_name.as_deref().unwrap_or("activity"),
                            100,
                        ),
                        tool_kind,
                        command_preview: last_tool_command
                            .as_deref()
                            .map(|cmd| sanitize_display_text(cmd, 160)),
                        copy_key: session.activity_state.copy_key().to_string(),
                    };
                    session.push_timeline_entry(entry);

                    SessionTransition::Updated(session.clone())
                } else {
                    let mut session = AgentSession::new(
                        event.provider.clone(),
                        event.session_id.clone(),
                        event.workspace_root.clone(),
                        event.cwd.clone(),
                        now,
                    );
                    if let Some(ae) = act_event {
                        session.activity_state =
                            state_machine::reduce(session.activity_state.clone(), ae, now);
                    }
                    session.last_tool_name = event.tool_name.clone();
                    session.last_tool_command = last_tool_command.clone();

                    if !is_focused && self.focused_session_id.is_some() {
                        session.attention_count = 1;
                    }

                    let entry = TimelineEntryDto {
                        entry_id: format!("{}-1", session.session_id),
                        session_id: session.session_id.clone(),
                        timestamp_ms: now,
                        event_kind: format!("{:?}", event.event_type),
                        summary: sanitize_display_text(
                            session.last_tool_name.as_deref().unwrap_or("started"),
                            100,
                        ),
                        tool_kind,
                        command_preview: last_tool_command
                            .as_deref()
                            .map(|cmd| sanitize_display_text(cmd, 160)),
                        copy_key: session.activity_state.copy_key().to_string(),
                    };
                    session.push_timeline_entry(entry);

                    self.sessions.insert(key, session.clone());
                    SessionTransition::Created(session)
                }
            }
        };

        transition
    }

    /// Evicts the oldest session when capacity is exceeded.
    /// Prefers evicting terminated sessions first; then oldest inactive.
    fn evict_oldest(&mut self) {
        let mut terminated: Vec<(SessionKey, u64)> = self
            .sessions
            .iter()
            .filter(|(_, s)| s.state == SessionState::Terminated)
            .map(|(k, s)| (k.clone(), s.last_activity_ms))
            .collect();

        if !terminated.is_empty() {
            terminated.sort_by_key(|(_, ts)| *ts);
            if let Some((oldest_key, _)) = terminated.first() {
                self.sessions.remove(oldest_key);
                return;
            }
        }

        // If no terminated sessions, evict oldest by last_activity_ms
        let mut all: Vec<(SessionKey, u64)> = self
            .sessions
            .iter()
            .map(|(k, s)| (k.clone(), s.last_activity_ms))
            .collect();
        all.sort_by_key(|(_, ts)| *ts);
        if let Some((oldest_key, _)) = all.first() {
            self.sessions.remove(oldest_key);
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

    /// Produces resolved SessionDto list for all tracked sessions,
    /// integrating aliases from settings and unique display name resolution.
    pub fn get_session_dtos(&self, aliases: &HashMap<String, String>) -> Vec<SessionDto> {
        let label_input: Vec<(&SessionKey, &AgentSession, Option<&str>)> = self
            .sessions
            .iter()
            .map(|(k, s)| (k, s, aliases.get(&s.session_id).map(|a| a.as_str())))
            .collect();

        let resolved_labels = resolve_all_session_labels(label_input);

        self.sessions
            .iter()
            .map(|(k, s)| {
                let label = resolved_labels
                    .get(k)
                    .cloned()
                    .unwrap_or_else(|| s.session_id.clone());
                let is_focused = self
                    .focused_session_id
                    .as_ref()
                    .map(|f| f == &s.session_id)
                    .unwrap_or(false);
                let alias = aliases.get(&s.session_id).cloned();
                s.to_dto(label, is_focused, alias)
            })
            .collect()
    }

    /// Prune sessions based on TTL.
    pub fn prune_stale(&mut self, idle_ttl_ms: u64, retain_terminated_ms: u64, now_ms: u64) {
        self.sessions.retain(|_, session| match session.state {
            SessionState::Active => {
                if now_ms.saturating_sub(session.last_activity_ms) > idle_ttl_ms {
                    session.state = SessionState::Idle;
                    session.activity_state = state_machine::reduce(
                        session.activity_state.clone(),
                        ActivityEvent::Tick {
                            last_event_at_ms: session.last_activity_ms,
                        },
                        now_ms,
                    );
                }
                true
            }
            SessionState::Idle => {
                if now_ms.saturating_sub(session.last_activity_ms) >= super::limits::T_TTL_MS {
                    session.state = SessionState::Terminated;
                    session.activity_state = ActivityState::Ended {
                        reason: EndReason::Timeout,
                    };
                }
                true
            }
            SessionState::Terminated => {
                now_ms.saturating_sub(session.last_activity_ms) <= retain_terminated_ms
            }
        });
    }

    pub fn len(&self) -> usize {
        self.sessions.len()
    }

    pub fn is_empty(&self) -> bool {
        self.sessions.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_event(
        event_type: NormalizedEventType,
        provider: &str,
        session_id: &str,
        time: u64,
        workspace: Option<&str>,
    ) -> NormalizedEvent {
        NormalizedEvent {
            event_type,
            provider: provider.to_string(),
            session_id: session_id.to_string(),
            timestamp_ms: time,
            cwd: workspace.map(|w| w.to_string()),
            workspace_root: workspace.map(|w| w.to_string()),
            tool_name: None,
            tool_input: None,
            tool_output: None,
            raw: serde_json::Value::Null,
        }
    }

    #[test]
    fn test_display_name_resolution_order() {
        // 1. Alias has highest precedence
        let label1 = compute_base_display_label(
            Some("My Super Alias"),
            Some("Verified Title"),
            Some("C:\\code\\project"),
            "antigravity",
            "abcdef123456",
        );
        assert_eq!(label1, "My Super Alias");

        // 2. Verified title if no alias
        let label2 = compute_base_display_label(
            None,
            Some("Verified Title"),
            Some("C:\\code\\project"),
            "antigravity",
            "abcdef123456",
        );
        assert_eq!(label2, "Verified Title");

        // 3. Workspace folder · #<4> if no title
        let label3 = compute_base_display_label(
            None,
            None,
            Some("C:\\code\\project"),
            "antigravity",
            "abcdef123456",
        );
        assert_eq!(label3, "project · #abcd");

        // 4. Provider · #<4> fallback
        let label4 = compute_base_display_label(None, None, None, "antigravity", "abcdef123456");
        assert_eq!(label4, "antigravity · #abcd");
    }

    #[test]
    fn test_collision_resolution_rules() {
        // Two sessions with identical workspace folder and different IDs
        let key1 = SessionKey::new("antigravity", "1111aaaa");
        let s1 = AgentSession::new(
            "antigravity".into(),
            "1111aaaa".into(),
            Some("C:\\code\\app".into()),
            None,
            1000,
        );

        let key2 = SessionKey::new("antigravity", "2222bbbb");
        let s2 = AgentSession::new(
            "antigravity".into(),
            "2222bbbb".into(),
            Some("C:\\code\\app".into()),
            None,
            1000,
        );

        let input = vec![(&key1, &s1, None), (&key2, &s2, None)];
        let labels = resolve_all_session_labels(input);

        let l1 = labels.get(&key1).unwrap();
        let l2 = labels.get(&key2).unwrap();

        assert_ne!(l1, l2, "Labels must be distinct");
        assert!(l1.contains("#1111"));
        assert!(l2.contains("#2222"));
    }

    #[test]
    fn test_manual_focus_pin_and_attention_counter() {
        let mut registry = SessionRegistry::new();

        let ev1 = make_test_event(
            NormalizedEventType::ToolPre,
            "antigravity",
            "sess-1",
            1000,
            None,
        );
        let ev2 = make_test_event(
            NormalizedEventType::ToolPre,
            "antigravity",
            "sess-2",
            1000,
            None,
        );

        registry.handle_event(&ev1);
        registry.handle_event(&ev2);

        // Manually pin focus to sess-1
        registry.set_focused_session(Some("sess-1".to_string()));
        assert_eq!(registry.get_focused_session().as_deref(), Some("sess-1"));

        // Activity on focused sess-1 should not increase attention count
        let ev1_act = make_test_event(
            NormalizedEventType::ToolPre,
            "antigravity",
            "sess-1",
            2000,
            None,
        );
        registry.handle_event(&ev1_act);
        assert_eq!(
            registry
                .get_session("antigravity", "sess-1")
                .unwrap()
                .attention_count,
            0
        );

        // Activity on background sess-2 MUST increase its attention count
        let ev2_act1 = make_test_event(
            NormalizedEventType::ToolPre,
            "antigravity",
            "sess-2",
            2100,
            None,
        );
        registry.handle_event(&ev2_act1);
        assert_eq!(
            registry
                .get_session("antigravity", "sess-2")
                .unwrap()
                .attention_count,
            1
        );

        let ev2_act2 = make_test_event(
            NormalizedEventType::ToolPost,
            "antigravity",
            "sess-2",
            2200,
            None,
        );
        registry.handle_event(&ev2_act2);
        assert_eq!(
            registry
                .get_session("antigravity", "sess-2")
                .unwrap()
                .attention_count,
            2
        );

        // Focus remains pinned to sess-1!
        assert_eq!(registry.get_focused_session().as_deref(), Some("sess-1"));
    }

    #[test]
    fn test_session_lifecycle_happy_path() {
        let mut registry = SessionRegistry::new();

        let start_ev = make_test_event(
            NormalizedEventType::SessionStart,
            "claude-code",
            "sess-1",
            1000,
            Some("C:\\repo"),
        );
        let trans = registry.handle_event(&start_ev);
        assert!(matches!(trans, SessionTransition::Created(_)));

        let end_ev = make_test_event(
            NormalizedEventType::SessionEnd,
            "claude-code",
            "sess-1",
            5000,
            Some("C:\\repo"),
        );
        let trans = registry.handle_event(&end_ev);
        assert!(matches!(trans, SessionTransition::Terminated(_)));
    }

    #[test]
    fn test_max_live_sessions_bounding() {
        let mut registry = SessionRegistry::new();

        // Create 20 sessions (exceeding MAX_LIVE_SESSIONS = 16)
        for i in 0..20 {
            let ev = make_test_event(
                NormalizedEventType::ToolPre,
                "antigravity",
                &format!("sess-{}", i),
                1000 + i as u64,
                None,
            );
            registry.handle_event(&ev);
        }

        assert!(
            registry.len() <= MAX_LIVE_SESSIONS,
            "Registry length {} must not exceed max bound {}",
            registry.len(),
            MAX_LIVE_SESSIONS
        );
    }
}
