//! Agent IPC subsystem for Xyeena Notch.
//!
//! Provides bounded message framing, event normalization across CLI/IDE agents,
//! and session lifecycle tracking for observation.

pub mod event;
pub mod framing;
pub mod pipe;
pub mod session;

pub use event::{
    parse_and_normalize, EventParseError, NormalizedEvent, NormalizedEventType,
    NormalizedToolInput, MAX_FIELD_LEN, MAX_IDENTIFIER_LEN,
};
pub use framing::{encode_frame, FrameBuffer, FramingError, MAX_PAYLOAD_SIZE};
pub use pipe::{get_pipe_name, start_agent_pipe_server, NamedPipeServerHandle};
pub use session::{AgentSession, SessionKey, SessionRegistry, SessionState, SessionTransition};

use std::sync::{Arc, Mutex};

/// Thread-safe shared handle to the session registry.
#[derive(Debug, Clone, Default)]
pub struct SharedSessionRegistry {
    inner: Arc<Mutex<SessionRegistry>>,
}

impl SharedSessionRegistry {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(SessionRegistry::new())),
        }
    }

    /// Process a normalized event through the registry.
    pub fn handle_event(&self, event: &NormalizedEvent) -> SessionTransition {
        let mut reg = self.inner.lock().expect("session registry mutex poisoned");
        reg.handle_event(event)
    }

    /// Snapshot of all active sessions.
    pub fn active_sessions(&self) -> Vec<AgentSession> {
        let reg = self.inner.lock().expect("session registry mutex poisoned");
        reg.active_sessions()
    }

    /// Snapshot of all tracked sessions.
    pub fn all_sessions(&self) -> Vec<AgentSession> {
        let reg = self.inner.lock().expect("session registry mutex poisoned");
        reg.all_sessions()
    }

    /// Prune stale sessions.
    pub fn prune_stale(&self, idle_ttl_ms: u64, retain_terminated_ms: u64, now_ms: u64) {
        let mut reg = self.inner.lock().expect("session registry mutex poisoned");
        reg.prune_stale(idle_ttl_ms, retain_terminated_ms, now_ms);
    }
}
