// Session store for real-time coding agent monitoring in Xyeena Notch.
// Tracks concurrent sessions (Antigravity, Claude Code, Codex, Gemini CLI, etc.),
// manages focus, computes deterministic aggregate state for Xyn mascot,
// and prunes stale sessions.

/**
 * @typedef {'idle' | 'working' | 'thinking' | 'approval' | 'finished' | 'error'} AgentVisualStatus
 * @typedef {'active' | 'idle' | 'terminated'} AgentLifecycleState
 *
 * @typedef {{
 *   eventType: string,
 *   timestamp: number,
 *   toolName?: string,
 *   command?: string,
 *   summary?: string
 * }} SessionEventRecord
 *
 * @typedef {{
 *   key: string,
 *   provider: string,
 *   sessionId: string,
 *   state: AgentLifecycleState,
 *   status: AgentVisualStatus,
 *   workspaceRoot?: string,
 *   cwd?: string,
 *   startedAt: number,
 *   lastActivity: number,
 *   eventCount: number,
 *   activeTool?: string,
 *   lastCommand?: string,
 *   lastSummary?: string,
 *   recentEvents: SessionEventRecord[]
 * }} MonitoredSession
 *
 * @typedef {{
 *   event_type: string | { unknown?: string },
 *   provider: string,
 *   session_id: string,
 *   timestamp_ms?: number,
 *   cwd?: string,
 *   workspace_root?: string,
 *   tool_name?: string,
 *   tool_input?: {
 *     command?: string,
 *     path?: string,
 *     query?: string,
 *     summary?: string,
 *     raw_args?: unknown
 *   },
 *   tool_output?: string
 * }} NativeAgentEvent
 *
 * @typedef {{
 *   provider: string,
 *   session_id: string,
 *   state: AgentLifecycleState,
 *   workspace_root?: string,
 *   cwd?: string,
 *   started_at_ms: number,
 *   last_activity_ms: number,
 *   event_count: number,
 *   last_tool_name?: string,
 *   last_tool_command?: string
 * }} NativeSessionSnapshot
 */

const MAX_RECENT_EVENTS = 20;
const IDLE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const FINISHED_DISPLAY_MS = 8 * 1000; // 8 seconds

/**
 * Creates a unique composite key for a session.
 * @param {string} provider
 * @param {string} sessionId
 * @returns {string}
 */
export function sessionKey(provider, sessionId) {
  return `${(provider || 'unknown').toLowerCase()}:${sessionId || 'unknown'}`;
}

export class SessionStore {
  constructor() {
    /** @type {Map<string, MonitoredSession>} */
    this.sessions = new Map();
    /** @type {string | null} */
    this.focusedKey = null;
    /** @type {Set<(store: SessionStore) => void>} */
    this.listeners = new Set();
    /** @type {number} */
    this.lastFinishedTimestamp = 0;
  }

  /**
   * Subscribe to session state updates.
   * @param {(store: SessionStore) => void} listener
   * @returns {() => void} unsubscribe function
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch (err) {
        console.error('SessionStore listener error:', err);
      }
    }
  }

  /**
   * Ingest a normalized native agent event emitted from Tauri.
   * @param {NativeAgentEvent} event
   */
  ingestEvent(event) {
    if (!event || typeof event !== 'object' || !event.provider || !event.session_id) {
      return;
    }

    const key = sessionKey(event.provider, event.session_id);
    const now = event.timestamp_ms || Date.now();
    const eventTypeStr = normalizeEventType(event.event_type);

    let session = this.sessions.get(key);
    if (!session) {
      session = {
        key,
        provider: event.provider,
        sessionId: event.session_id,
        state: 'active',
        status: 'thinking',
        workspaceRoot: event.workspace_root,
        cwd: event.cwd,
        startedAt: now,
        lastActivity: now,
        eventCount: 0,
        recentEvents: []
      };
      this.sessions.set(key, session);
    }

    session.lastActivity = now;
    session.eventCount += 1;
    if (event.workspace_root) session.workspaceRoot = event.workspace_root;
    if (event.cwd) session.cwd = event.cwd;

    const toolName = event.tool_name;
    const command = event.tool_input?.command;
    const summary = event.tool_input?.summary;

    if (toolName) session.activeTool = toolName;
    if (command) session.lastCommand = command;
    if (summary) session.lastSummary = summary;

    // Record bounded event history
    session.recentEvents.unshift({
      eventType: eventTypeStr,
      timestamp: now,
      toolName,
      command,
      summary
    });
    if (session.recentEvents.length > MAX_RECENT_EVENTS) {
      session.recentEvents.pop();
    }

    // Update status based on event type
    switch (eventTypeStr) {
      case 'sessionstart':
        session.state = 'active';
        session.status = 'thinking';
        break;

      case 'prompt':
        session.state = 'active';
        session.status = 'thinking';
        break;

      case 'toolpre':
        session.state = 'active';
        session.status = 'working';
        break;

      case 'toolpost':
        session.state = 'active';
        session.status = 'working';
        break;

      case 'error':
        session.state = 'active';
        session.status = 'error';
        break;

      case 'sessionend':
        session.state = 'terminated';
        session.status = 'idle';
        this.lastFinishedTimestamp = now;
        break;

      default:
        session.state = 'active';
        break;
    }

    // Auto-focus if no focused session exists or if previous focused session terminated
    if (!this.focusedKey || !this.sessions.has(this.focusedKey)) {
      this.focusedKey = key;
    }

    this.notify();
  }

  /**
   * Hydrate session store from native Rust `get_agent_sessions` snapshot.
   * @param {NativeSessionSnapshot[]} snapshots
   */
  hydrateSessions(snapshots) {
    if (!Array.isArray(snapshots)) return;

    for (const snap of snapshots) {
      if (!snap || !snap.provider || !snap.session_id) continue;
      const key = sessionKey(snap.provider, snap.session_id);
      const existing = this.sessions.get(key);

      const status = snap.state === 'terminated'
        ? 'idle'
        : snap.last_tool_name ? 'working' : 'thinking';

      if (!existing) {
        this.sessions.set(key, {
          key,
          provider: snap.provider,
          sessionId: snap.session_id,
          state: snap.state,
          status,
          workspaceRoot: snap.workspace_root,
          cwd: snap.cwd,
          startedAt: snap.started_at_ms,
          lastActivity: snap.last_activity_ms,
          eventCount: snap.event_count,
          activeTool: snap.last_tool_name,
          lastCommand: snap.last_tool_command,
          recentEvents: []
        });
      } else {
        existing.state = snap.state;
        if (snap.workspace_root) existing.workspaceRoot = snap.workspace_root;
        if (snap.cwd) existing.cwd = snap.cwd;
        existing.eventCount = Math.max(existing.eventCount, snap.event_count);
        existing.lastActivity = Math.max(existing.lastActivity, snap.last_activity_ms);
        if (snap.last_tool_name) existing.activeTool = snap.last_tool_name;
        if (snap.last_tool_command) existing.lastCommand = snap.last_tool_command;
      }
    }

    if (!this.focusedKey || !this.sessions.has(this.focusedKey)) {
      this.focusedKey = this.autoSelectFocusedKey();
    }

    this.notify();
  }

  /**
   * Set user focus to a specific session key.
   * @param {string | null} key
   */
  setFocus(key) {
    if (key && !this.sessions.has(key)) return;
    this.focusedKey = key;
    this.notify();
  }

  /**
   * Returns the focused session or falls back to the most active session.
   * @returns {MonitoredSession | null}
   */
  getFocusedSession() {
    if (this.focusedKey) {
      const sess = this.sessions.get(this.focusedKey);
      if (sess) return sess;
    }

    const autoKey = this.autoSelectFocusedKey();
    return autoKey ? this.sessions.get(autoKey) || null : null;
  }

  /**
   * Selects the most relevant active session deterministically.
   * Priority: Active sessions with most recent activity, then idle, then terminated.
   * @returns {string | null}
   */
  autoSelectFocusedKey() {
    const all = Array.from(this.sessions.values());
    if (!all.length) return null;

    all.sort((a, b) => {
      // 1. Working / thinking first
      const aWorking = a.state === 'active' && (a.status === 'working' || a.status === 'thinking');
      const bWorking = b.state === 'active' && (b.status === 'working' || b.status === 'thinking');
      if (aWorking !== bWorking) return aWorking ? -1 : 1;

      // 2. Active over terminated
      const aActive = a.state === 'active';
      const bActive = b.state === 'active';
      if (aActive !== bActive) return aActive ? -1 : 1;

      // 3. Most recent activity
      return b.lastActivity - a.lastActivity;
    });

    return all[0].key;
  }

  /**
   * Returns all sessions sorted by activity.
   * @returns {MonitoredSession[]}
   */
  getAllSessions() {
    const list = Array.from(this.sessions.values());
    list.sort((a, b) => b.lastActivity - a.lastActivity);
    return list;
  }

  /**
   * Returns active sessions.
   * @returns {MonitoredSession[]}
   */
  getActiveSessions() {
    return this.getAllSessions().filter(s => s.state === 'active');
  }

  /**
   * Prune stale sessions exceeding TTL.
   * @param {number} now
   */
  pruneStale(now = Date.now()) {
    let changed = false;
    for (const session of this.sessions.values()) {
      if (session.state === 'active' && now - session.lastActivity > IDLE_TTL_MS) {
        session.state = 'idle';
        session.status = 'idle';
        changed = true;
      }
    }
    if (changed) {
      this.notify();
    }
  }

  /**
   * Computes the aggregate state for Xyn Lion companion priority arbiter.
   * Priority:
   * 1. 'approval' if any session needs approval
   * 2. 'error' if any active session is in error
   * 3. 'working' if any session is executing a tool
   * 4. 'thinking' if any session is in prompt/thinking
   * 5. 'finished' if a session recently ended (< 8s)
   * 6. 'idle'
   * @param {number} now
   * @returns {AgentVisualStatus}
   */
  getAggregateState(now = Date.now()) {
    const sessions = Array.from(this.sessions.values());
    const active = sessions.filter(s => s.state === 'active');

    if (active.some(s => s.status === 'approval')) return 'approval';
    if (active.some(s => s.status === 'error')) return 'error';
    if (active.some(s => s.status === 'working')) return 'working';
    if (active.some(s => s.status === 'thinking')) return 'thinking';

    if (this.lastFinishedTimestamp > 0 && now - this.lastFinishedTimestamp < FINISHED_DISPLAY_MS) {
      return 'finished';
    }

    return 'idle';
  }
}

/**
 * Normalizes event type values across Rust serialization variants.
 * @param {unknown} eventType
 * @returns {string}
 */
function normalizeEventType(eventType) {
  if (typeof eventType === 'string') {
    return eventType.toLowerCase();
  }
  if (eventType && typeof eventType === 'object') {
    const keys = Object.keys(eventType);
    if (keys.length > 0) return keys[0].toLowerCase();
  }
  return 'unknown';
}

export const sessionStore = new SessionStore();
