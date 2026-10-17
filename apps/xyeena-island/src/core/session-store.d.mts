export type AgentVisualStatus = 'idle' | 'working' | 'thinking' | 'approval' | 'finished' | 'error';
export type AgentLifecycleState = 'active' | 'idle' | 'terminated';

export interface SessionEventRecord {
  eventType: string;
  timestamp: number;
  toolName?: string;
  command?: string;
  summary?: string;
}

export interface MonitoredSession {
  key: string;
  provider: string;
  sessionId: string;
  state: AgentLifecycleState;
  status: AgentVisualStatus;
  workspaceRoot?: string;
  cwd?: string;
  startedAt: number;
  lastActivity: number;
  eventCount: number;
  activeTool?: string;
  lastCommand?: string;
  lastSummary?: string;
  recentEvents: SessionEventRecord[];
}

export interface NativeAgentEvent {
  event_type: string | { unknown?: string };
  provider: string;
  session_id: string;
  timestamp_ms?: number;
  cwd?: string;
  workspace_root?: string;
  tool_name?: string;
  tool_input?: {
    command?: string;
    path?: string;
    query?: string;
    summary?: string;
    raw_args?: unknown;
  };
  tool_output?: string;
}

export interface NativeSessionSnapshot {
  provider: string;
  session_id: string;
  state: AgentLifecycleState;
  workspace_root?: string;
  cwd?: string;
  started_at_ms: number;
  last_activity_ms: number;
  event_count: number;
  last_tool_name?: string;
  last_tool_command?: string;
}

export declare function sessionKey(provider: string, sessionId: string): string;

export declare class SessionStore {
  sessions: Map<string, MonitoredSession>;
  focusedKey: string | null;
  listeners: Set<(store: SessionStore) => void>;
  lastFinishedTimestamp: number;

  subscribe(listener: (store: SessionStore) => void): () => void;
  notify(): void;
  ingestEvent(event: NativeAgentEvent): void;
  hydrateSessions(snapshots: NativeSessionSnapshot[]): void;
  setFocus(key: string | null): void;
  getFocusedSession(): MonitoredSession | null;
  autoSelectFocusedKey(): string | null;
  getAllSessions(): MonitoredSession[];
  getActiveSessions(): MonitoredSession[];
  pruneStale(now?: number): void;
  getAggregateState(now?: number): AgentVisualStatus;
}

export declare const sessionStore: SessionStore;
