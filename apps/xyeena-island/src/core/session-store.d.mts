export type AgentVisualStatus = 'idle' | 'working' | 'thinking' | 'approval' | 'finished' | 'error';
export type AgentLifecycleState = 'active' | 'idle' | 'terminated';

export interface SessionEventRecord {
  eventType: string;
  timestamp: number;
  toolName?: string;
  command?: string;
  path?: string;
  summary?: string;
}

export interface SessionUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  totalCost?: number;
  model?: string;
}

export interface QuestionOption {
  id: string;
  label: string;
  description?: string;
}

export interface ApprovalSnapshot {
  request_id: string;
  provider: string;
  session_id: string;
  workspace_root?: string;
  tool_name: string;
  tool_command?: string;
  tool_input_summary?: string;
  question?: string;
  options?: QuestionOption[];
  action_fingerprint: string;
  auth_token: string;
  created_at_ms: number;
  expires_at_ms: number;
  status: 'pending' | 'allowed_once' | 'denied' | 'answered' | 'expired' | 'cancelled';
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
  touchedFiles: string[];
  usage?: SessionUsage;
  recentEvents: SessionEventRecord[];
  pendingApproval?: ApprovalSnapshot;
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
  setPendingApproval(approval: ApprovalSnapshot): void;
  resolvePendingApproval(requestId: string, status?: string): void;
  getPendingApprovals(): ApprovalSnapshot[];
  setFocus(key: string | null): void;
  getFocusedSession(): MonitoredSession | null;
  autoSelectFocusedKey(): string | null;
  getAllSessions(): MonitoredSession[];
  getActiveSessions(): MonitoredSession[];
  pruneStale(now?: number): void;
  getAggregateState(now?: number): AgentVisualStatus;
  getSessionEventsForRecap(sinceTimestampMs?: number): Array<{
    type: string;
    at: string;
    agent: string;
    sessionId: string;
    eventId: string;
  }>;
}

export declare const sessionStore: SessionStore;
