import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore, sessionKey } from '../src/core/session-store.mjs';

test('sessionKey generates lowercase composite identifier', () => {
  assert.equal(sessionKey('Antigravity', 'sess-123'), 'antigravity:sess-123');
  assert.equal(sessionKey('Claude-Code', 'c-456'), 'claude-code:c-456');
  assert.equal(sessionKey('', ''), 'unknown:unknown');
});

test('SessionStore ingests lifecycle events through happy path', () => {
  const store = new SessionStore();
  let notifications = 0;
  store.subscribe(() => { notifications += 1; });

  // 1. SessionStart
  store.ingestEvent({
    event_type: 'SessionStart',
    provider: 'antigravity',
    session_id: 'ag-session-1',
    workspace_root: 'C:\\Users\\dev\\project',
    timestamp_ms: 1000
  });

  const session = store.getFocusedSession();
  assert.ok(session);
  assert.equal(session.provider, 'antigravity');
  assert.equal(session.sessionId, 'ag-session-1');
  assert.equal(session.state, 'active');
  assert.equal(session.status, 'thinking');
  assert.equal(session.workspaceRoot, 'C:\\Users\\dev\\project');
  assert.equal(session.eventCount, 1);
  assert.equal(notifications, 1);

  // 2. ToolPre
  store.ingestEvent({
    event_type: 'ToolPre',
    provider: 'antigravity',
    session_id: 'ag-session-1',
    tool_name: 'run_command',
    tool_input: {
      command: 'cargo test',
      summary: 'Run cargo test suite'
    },
    timestamp_ms: 2000
  });

  assert.equal(session.status, 'working');
  assert.equal(session.activeTool, 'run_command');
  assert.equal(session.lastCommand, 'cargo test');
  assert.equal(session.lastSummary, 'Run cargo test suite');
  assert.equal(session.eventCount, 2);

  // 3. ToolPost
  store.ingestEvent({
    event_type: 'ToolPost',
    provider: 'antigravity',
    session_id: 'ag-session-1',
    tool_name: 'run_command',
    timestamp_ms: 3000
  });

  assert.equal(session.status, 'working');
  assert.equal(session.recentEvents.length, 3);
  assert.equal(session.recentEvents[0].eventType, 'toolpost');

  // 4. SessionEnd
  store.ingestEvent({
    event_type: 'SessionEnd',
    provider: 'antigravity',
    session_id: 'ag-session-1',
    timestamp_ms: 4000
  });

  assert.equal(session.state, 'terminated');
  assert.equal(session.status, 'idle');
  assert.equal(store.getAggregateState(4500), 'finished');
  assert.equal(store.getAggregateState(20000), 'idle');
});

test('SessionStore isolates concurrent multi-agent sessions', () => {
  const store = new SessionStore();

  // Agent 1: Antigravity in Workspace A
  store.ingestEvent({
    event_type: 'ToolPre',
    provider: 'antigravity',
    session_id: 'ag-1',
    workspace_root: 'C:\\projects\\app-a',
    tool_name: 'grep_search',
    timestamp_ms: 1000
  });

  // Agent 2: Claude Code in Workspace B
  store.ingestEvent({
    event_type: 'ToolPre',
    provider: 'claude-code',
    session_id: 'claude-1',
    workspace_root: 'C:\\projects\\app-b',
    tool_name: 'Bash',
    tool_input: { command: 'git diff' },
    timestamp_ms: 1500
  });

  assert.equal(store.getAllSessions().length, 2);
  assert.equal(store.getActiveSessions().length, 2);

  const ag = store.sessions.get('antigravity:ag-1');
  const claude = store.sessions.get('claude-code:claude-1');

  assert.ok(ag);
  assert.ok(claude);
  assert.equal(ag.activeTool, 'grep_search');
  assert.equal(ag.workspaceRoot, 'C:\\projects\\app-a');
  assert.equal(claude.activeTool, 'Bash');
  assert.equal(claude.workspaceRoot, 'C:\\projects\\app-b');

  // Focus selection
  store.setFocus(ag.key);
  assert.equal(store.getFocusedSession()?.key, ag.key);

  store.setFocus(claude.key);
  assert.equal(store.getFocusedSession()?.key, claude.key);
});

test('SessionStore bounds recent events history to max 20 entries', () => {
  const store = new SessionStore();

  for (let i = 0; i < 30; i++) {
    store.ingestEvent({
      event_type: 'ToolPost',
      provider: 'antigravity',
      session_id: 'bound-test',
      tool_name: `tool_${i}`,
      timestamp_ms: 1000 + i
    });
  }

  const session = store.sessions.get('antigravity:bound-test');
  assert.ok(session);
  assert.equal(session.recentEvents.length, 20);
  assert.equal(session.recentEvents[0].toolName, 'tool_29');
  assert.equal(session.eventCount, 30);
});

test('SessionStore computes deterministic aggregate state for Xyn mascot', () => {
  const store = new SessionStore();
  assert.equal(store.getAggregateState(), 'idle');

  // Working session -> working
  store.ingestEvent({
    event_type: 'ToolPre',
    provider: 'antigravity',
    session_id: 's-1',
    tool_name: 'test',
    timestamp_ms: 1000
  });
  assert.equal(store.getAggregateState(1000), 'working');

  // Error in another session -> error takes precedence over normal working
  store.ingestEvent({
    event_type: 'Error',
    provider: 'claude-code',
    session_id: 's-2',
    timestamp_ms: 1500
  });
  assert.equal(store.getAggregateState(1500), 'error');
});

test('SessionStore hydrates snapshots from Rust get_agent_sessions', () => {
  const store = new SessionStore();

  store.hydrateSessions([
    {
      provider: 'antigravity',
      session_id: 'restored-1',
      state: 'active',
      workspace_root: 'C:\\repo',
      started_at_ms: 5000,
      last_activity_ms: 6000,
      event_count: 5,
      last_tool_name: 'run_command',
      last_tool_command: 'npm test'
    }
  ]);

  assert.equal(store.getAllSessions().length, 1);
  const session = store.getFocusedSession();
  assert.ok(session);
  assert.equal(session.provider, 'antigravity');
  assert.equal(session.sessionId, 'restored-1');
  assert.equal(session.activeTool, 'run_command');
  assert.equal(session.lastCommand, 'npm test');
  assert.equal(session.status, 'working');
});
