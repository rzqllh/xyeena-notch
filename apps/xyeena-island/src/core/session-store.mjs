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
        touchedFiles: [],
        recentEvents: []
      };
      this.sessions.set(key, session);
    }

    if (!session.touchedFiles) {
      session.touchedFiles = [];
    }

    session.lastActivity = now;
    session.eventCount += 1;
    if (event.workspace_root) session.workspaceRoot = event.workspace_root;
    if (event.cwd) session.cwd = event.cwd;

    const toolName = event.tool_name;
    const command = event.tool_input?.command;
    const summary = event.tool_input?.summary;
    const filePath = event.tool_input?.path;

    if (toolName) session.activeTool = toolName;
    if (command) session.lastCommand = command;
    if (summary) session.lastSummary = summary;

    if (filePath && typeof filePath === 'string') {
      const cleanPath = filePath.trim();
      if (cleanPath && !session.touchedFiles.includes(cleanPath)) {
        session.touchedFiles.push(cleanPath);
        if (session.touchedFiles.length > 20) {
          session.touchedFiles.shift();
        }
      }
    }

    // Honest usage telemetry extraction
    const rawObj = event.raw;
    if (rawObj && typeof rawObj === 'object') {
      const rawUsage = rawObj.usage || rawObj.token_usage || rawObj.stats;
      if (rawUsage && typeof rawUsage === 'object') {
        session.usage = {
          inputTokens: rawUsage.input_tokens || rawUsage.prompt_tokens || rawUsage.inputTokens,
          outputTokens: rawUsage.output_tokens || rawUsage.completion_tokens || rawUsage.outputTokens,
          totalTokens: rawUsage.total_tokens || rawUsage.totalTokens,
          totalCost: rawUsage.total_cost || rawUsage.cost,
          model: rawObj.model || rawUsage.model
        };
      }
    }

    // Record bounded event history
    session.recentEvents.unshift({
      eventType: eventTypeStr,
      timestamp: now,
      toolName,
      command,
      path: filePath,
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

      case 'permissionrequest':
      case 'approvalrequest':
      case 'askuser':
        session.state = 'active';
        session.status = 'approval';
        this.focusedKey = key;
        break;

      case 'sessionend':
        session.state = 'terminated';
        session.status = 'idle';
        session.pendingApproval = undefined;
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

      let activityState = snap.activity_state;
      let status = 'thinking';
      let state = 'active';

      if (activityState) {
        if (activityState === 'awaiting_approval') status = 'approval';
        else if (activityState === 'tool_running' || activityState === 'recently_active') status = 'working';
        else if (activityState === 'stalled') status = 'thinking';
        else if (activityState === 'idle' || activityState === 'ended') status = 'idle';
        else if (activityState === 'error') status = 'error';
        state = activityState === 'ended' ? 'terminated' : (activityState === 'idle' ? 'idle' : 'active');
      } else {
        status = snap.state === 'terminated'
          ? 'idle'
          : (snap.last_tool_name || snap.last_tool_kind ? 'working' : 'thinking');
        state = snap.state || (status === 'idle' ? 'idle' : 'active');
        activityState = status === 'working' ? 'tool_running' : (status === 'idle' ? 'idle' : 'idle');
      }

      const touchedFiles = Array.isArray(snap.touched_files)
        ? snap.touched_files.map(f => (typeof f === 'string' ? f : f?.path)).filter(Boolean)
        : [];

      if (!existing) {
        this.sessions.set(key, {
          key,
          provider: snap.provider,
          sessionId: snap.session_id,
          displayName: snap.display_name,
          displaySuffix: snap.display_suffix,
          activityState,
          activityCopy: snap.activity_copy,
          attention: Boolean(snap.attention),
          attentionCount: snap.attention_count || 0,
          state,
          status,
          workspaceRoot: snap.workspace_folder || snap.workspace_root,
          cwd: snap.cwd,
          startedAt: snap.started_at_ms || Date.now(),
          lastActivity: snap.last_activity_ms || Date.now(),
          eventCount: snap.event_count || 0,
          activeTool: snap.last_tool_kind || snap.last_tool_name,
          lastCommand: snap.last_tool_preview || snap.last_tool_command,
          touchedFiles,
          timeline: snap.timeline || [],
          recentEvents: [],
          pendingApproval: snap.pending_approval
        });
      } else {
        existing.state = state;
        existing.status = status;
        if (snap.display_name) existing.displayName = snap.display_name;
        if (snap.display_suffix) existing.displaySuffix = snap.display_suffix;
        if (snap.activity_state) existing.activityState = snap.activity_state;
        if (snap.activity_copy) existing.activityCopy = snap.activity_copy;
        existing.attention = Boolean(snap.attention);
        existing.attentionCount = snap.attention_count || 0;
        if (snap.workspace_folder || snap.workspace_root) {
          existing.workspaceRoot = snap.workspace_folder || snap.workspace_root;
        }
        if (snap.cwd) existing.cwd = snap.cwd;
        existing.eventCount = Math.max(existing.eventCount, snap.event_count || 0);
        existing.lastActivity = Math.max(existing.lastActivity, snap.last_activity_ms || 0);
        if (snap.last_tool_kind || snap.last_tool_name) {
          existing.activeTool = snap.last_tool_kind || snap.last_tool_name;
        }
        if (snap.last_tool_preview || snap.last_tool_command) {
          existing.lastCommand = snap.last_tool_preview || snap.last_tool_command;
        }
        if (touchedFiles.length > 0) existing.touchedFiles = touchedFiles;
        if (snap.timeline) existing.timeline = snap.timeline;
        if (snap.pending_approval) existing.pendingApproval = snap.pending_approval;
      }

      if (snap.is_focused) {
        this.focusedKey = key;
      }
    }

    if (!this.focusedKey || !this.sessions.has(this.focusedKey)) {
      this.focusedKey = this.autoSelectFocusedKey();
    }

    this.notify();
  }

  /**
   * Set pending approval snapshot for a session and focus it.
   * @param {import('./session-store.d.mts').ApprovalSnapshot} approval
   */
  setPendingApproval(approval) {
    if (!approval || !approval.provider || !approval.session_id) return;
    const key = sessionKey(approval.provider, approval.session_id);
    let session = this.sessions.get(key);
    const now = approval.created_at_ms || Date.now();

    if (!session) {
      session = {
        key,
        provider: approval.provider,
        sessionId: approval.session_id,
        state: 'active',
        status: 'approval',
        workspaceRoot: approval.workspace_root,
        startedAt: now,
        lastActivity: now,
        eventCount: 1,
        activeTool: approval.tool_name,
        lastCommand: approval.tool_command,
        lastSummary: approval.tool_input_summary,
        touchedFiles: [],
        recentEvents: [],
        pendingApproval: approval
      };
      this.sessions.set(key, session);
    } else {
      session.state = 'active';
      session.status = 'approval';
      session.lastActivity = now;
      if (approval.tool_name) session.activeTool = approval.tool_name;
      if (approval.tool_command) session.lastCommand = approval.tool_command;
      if (approval.tool_input_summary) session.lastSummary = approval.tool_input_summary;
      if (!session.touchedFiles) session.touchedFiles = [];
      session.pendingApproval = approval;
    }

    this.focusedKey = key;
    this.notify();
  }

  /**
   * Resolve or clear a pending approval for a request ID.
   * @param {string} requestId
   * @param {string} [status]
   */
  resolvePendingApproval(requestId, status = 'resolved') {
    if (!requestId) return;
    let changed = false;

    for (const session of this.sessions.values()) {
      if (session.pendingApproval && session.pendingApproval.request_id === requestId) {
        session.pendingApproval = undefined;
        if (session.status === 'approval') {
          session.status = session.state === 'terminated' ? 'idle' : 'working';
        }
        changed = true;
      }
    }

    if (changed) {
      this.notify();
    }
  }

  /**
   * Return all currently pending approval snapshots.
   * @returns {import('./session-store.d.mts').ApprovalSnapshot[]}
   */
  getPendingApprovals() {
    const approvals = [];
    for (const session of this.sessions.values()) {
      if (session.pendingApproval) {
        approvals.push(session.pendingApproval);
      }
    }
    return approvals;
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
      // 0. Pending approval first
      const aApproval = a.status === 'approval' || Boolean(a.pendingApproval);
      const bApproval = b.status === 'approval' || Boolean(b.pendingApproval);
      if (aApproval !== bApproval) return aApproval ? -1 : 1;

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

  /**
   * Return authentic session and tool events formatted for Weekly Recap aggregation.
   * @param {number} [sinceTimestampMs]
   * @returns {Array<{type: string, at: string, agent: string, sessionId: string, eventId: string}>}
   */
  getSessionEventsForRecap(sinceTimestampMs = 0) {
    const recapEvents = [];
    const editTools = ['write_to_file', 'replace_file_content', 'multi_replace_file_content', 'edit', 'write', 'patch'];
    const commandTools = ['run_command', 'execute_command', 'bash', 'terminal', 'sh', 'cmd', 'powershell'];
    const questionTools = ['ask_question', 'askuser', 'ask_user', 'question'];

    for (const session of this.sessions.values()) {
      if (session.startedAt >= sinceTimestampMs) {
        recapEvents.push({
          type: 'session_start',
          at: new Date(session.startedAt).toISOString(),
          agent: session.provider || 'other',
          sessionId: session.sessionId,
          eventId: `session-start-${session.key}`
        });
      }

      if (session.state === 'terminated' && session.lastActivity >= sinceTimestampMs) {
        recapEvents.push({
          type: 'task_finish',
          at: new Date(session.lastActivity).toISOString(),
          agent: session.provider || 'other',
          sessionId: session.sessionId,
          eventId: `session-fin-${session.key}`
        });
      }

      for (let i = 0; i < session.recentEvents.length; i++) {
        const ev = session.recentEvents[i];
        if (ev.timestamp < sinceTimestampMs) continue;
        const iso = new Date(ev.timestamp).toISOString();
        const tn = (ev.toolName || '').toLowerCase();

        if (ev.path || editTools.some(t => tn.includes(t))) {
          recapEvents.push({
            type: 'edit',
            at: iso,
            agent: session.provider || 'other',
            sessionId: session.sessionId,
            eventId: `session-edit-${session.key}-${i}`
          });
        } else if (ev.command || commandTools.some(t => tn.includes(t))) {
          recapEvents.push({
            type: 'command',
            at: iso,
            agent: session.provider || 'other',
            sessionId: session.sessionId,
            eventId: `session-cmd-${session.key}-${i}`
          });
        } else if (questionTools.some(t => tn.includes(t)) || ev.eventType === 'askuser') {
          recapEvents.push({
            type: 'question',
            at: iso,
            agent: session.provider || 'other',
            sessionId: session.sessionId,
            eventId: `session-q-${session.key}-${i}`
          });
        }
      }
    }

    return recapEvents;
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
