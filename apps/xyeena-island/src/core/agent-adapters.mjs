// Agent integration adapters: Claude Code, Codex, Gemini CLI, Antigravity, Cursor, etc.
// Enforces verified capabilities, bounded diffs, and fail-closed consent forwarders.

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   icon: string,
 *   capabilities: {
 *     sessionDiscovery: boolean,
 *     toolActivity: boolean,
 *     diffPreview: boolean,
 *     approvalRequests: boolean
 *   }
 * }} AgentAdapterDefinition
 */

/**
 * @typedef {{
 *   sessionId: string,
 *   provider: string,
 *   status: 'idle' | 'working' | 'thinking' | 'approval' | 'finished' | 'error',
 *   taskSummary: string,
 *   activeTool?: string,
 *   diffSnippet?: string,
 *   pendingApproval?: {
 *     requestId: string,
 *     prompt: string,
 *     expiresAt: number
 *   }
 * }} NormalizedSession
 */

export const KNOWN_ADAPTERS = Object.freeze([
  {
    id: 'claude-code',
    name: 'Claude Code',
    icon: 'terminal',
    capabilities: { sessionDiscovery: true, toolActivity: true, diffPreview: true, approvalRequests: true }
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    icon: 'code',
    capabilities: { sessionDiscovery: true, toolActivity: true, diffPreview: true, approvalRequests: true }
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    icon: 'sparkles',
    capabilities: { sessionDiscovery: true, toolActivity: true, diffPreview: false, approvalRequests: false }
  },
  {
    id: 'antigravity',
    name: 'Antigravity IDE',
    icon: 'activity',
    capabilities: { sessionDiscovery: true, toolActivity: true, diffPreview: true, approvalRequests: true }
  },
  {
    id: 'cursor',
    name: 'Cursor',
    icon: 'sliders',
    capabilities: { sessionDiscovery: true, toolActivity: false, diffPreview: true, approvalRequests: false }
  },
  {
    id: 'copilot-cli',
    name: 'GitHub Copilot CLI',
    icon: 'terminal',
    capabilities: { sessionDiscovery: true, toolActivity: true, diffPreview: false, approvalRequests: false }
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    icon: 'code',
    capabilities: { sessionDiscovery: true, toolActivity: true, diffPreview: true, approvalRequests: true }
  },
  {
    id: 'amp',
    name: 'Amp',
    icon: 'zap',
    capabilities: { sessionDiscovery: true, toolActivity: true, diffPreview: false, approvalRequests: false }
  },
  {
    id: 'hermes',
    name: 'Hermes',
    icon: 'sliders',
    capabilities: { sessionDiscovery: true, toolActivity: false, diffPreview: false, approvalRequests: false }
  },
  {
    id: 'xyeena',
    name: 'Xyeena Agentic',
    icon: 'logo',
    capabilities: { sessionDiscovery: true, toolActivity: true, diffPreview: true, approvalRequests: true }
  }
]);

/**
 * @param {string} providerId
 * @returns {AgentAdapterDefinition | undefined}
 */
export function getAdapter(providerId) {
  return KNOWN_ADAPTERS.find(a => a.id === providerId);
}

/**
 * Normalizes raw session snapshots into a clean bounded representation.
 * @param {any} raw
 * @returns {NormalizedSession | null}
 */
export function normalizeSessionSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId.trim().slice(0, 128) : '';
  const provider = typeof raw.provider === 'string' ? raw.provider.trim().slice(0, 50) : '';
  if (!sessionId || !provider) return null;

  const validStatuses = ['idle', 'working', 'thinking', 'approval', 'finished', 'error'];
  const status = validStatuses.includes(raw.status) ? raw.status : 'idle';
  const taskSummary = typeof raw.taskSummary === 'string' ? raw.taskSummary.trim().slice(0, 160) : 'Active task';

  /** @type {NormalizedSession} */
  const session = {
    sessionId,
    provider,
    status,
    taskSummary: taskSummary || 'Active session'
  };

  if (typeof raw.activeTool === 'string' && raw.activeTool.trim()) {
    session.activeTool = raw.activeTool.trim().slice(0, 64);
  }

  if (typeof raw.diffSnippet === 'string' && raw.diffSnippet.trim()) {
    // Bound diffs to 500 characters for lightweight preview
    session.diffSnippet = raw.diffSnippet.trim().slice(0, 500);
  }

  if (raw.pendingApproval && typeof raw.pendingApproval === 'object') {
    const p = raw.pendingApproval;
    const reqId = typeof p.requestId === 'string' ? p.requestId.trim().slice(0, 128) : '';
    const prompt = typeof p.prompt === 'string' ? p.prompt.trim().slice(0, 200) : 'Allow action?';
    const expiresAt = Number(p.expiresAt);
    if (reqId && Number.isSafeInteger(expiresAt)) {
      session.pendingApproval = {
        requestId: reqId,
        prompt,
        expiresAt
      };
    }
  }

  return session;
}
