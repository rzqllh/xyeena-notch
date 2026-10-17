// External integrations data normalization and helpers: GitHub PR/CI, Vercel, Notion, n8n, Resend, Cal.com, Stripe.
// Enforces truthful, un-fabricated status representations.

/**
 * @typedef {{
 *   isGitRepo: boolean,
 *   isGitHub: boolean,
 *   repoSlug?: string,
 *   branch?: string,
 *   configured: boolean,
 *   configMethod?: string,
 *   pr?: {
 *     number: number,
 *     title: string,
 *     state: string,
 *     url: string,
 *     isDraft: boolean,
 *     headBranch: string,
 *     baseBranch: string,
 *     reviewDecision?: string,
 *     checksConclusion?: string
 *   },
 *   recentRuns: Array<{
 *     id: number,
 *     name: string,
 *     status: string,
 *     conclusion?: string,
 *     branch: string,
 *     event: string,
 *     url: string,
 *     updatedAt: string
 *   }>,
 *   rateLimited: boolean,
 *   rateLimitRemaining?: number,
 *   rateLimitReset?: number,
 *   error?: string
 * }} NormalizedGitHubStatus
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   authType: string,
 *   envVar: string,
 *   docsUrl: string
 * }} IntegrationDescriptor
 */

/**
 * @typedef {{
 *   provider: string,
 *   configured: boolean,
 *   status: 'connected' | 'unconfigured' | 'auth_error' | 'rate_limited' | 'error',
 *   summary?: string,
 *   accountId?: string,
 *   error?: string
 * }} NormalizedIntegrationResult
 */

export const SUPPORTED_INTEGRATIONS = Object.freeze([
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Deployments and build notifications',
    authType: 'bearer_token',
    envVar: 'VERCEL_TOKEN',
    docsUrl: 'https://vercel.com/docs/rest-api'
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Workspace documentation and databases',
    authType: 'bearer_token',
    envVar: 'NOTION_API_KEY',
    docsUrl: 'https://developers.notion.com'
  },
  {
    id: 'n8n',
    name: 'n8n',
    description: 'Workflow automation and triggers',
    authType: 'api_key',
    envVar: 'N8N_API_KEY',
    docsUrl: 'https://docs.n8n.io/api'
  },
  {
    id: 'resend',
    name: 'Resend',
    description: 'Transactional email delivery',
    authType: 'api_key',
    envVar: 'RESEND_API_KEY',
    docsUrl: 'https://resend.com/docs/api-reference'
  },
  {
    id: 'calcom',
    name: 'Cal.com',
    description: 'Meeting schedules and availability',
    authType: 'api_key',
    envVar: 'CALCOM_API_KEY',
    docsUrl: 'https://cal.com/docs/api-reference'
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Restricted read-only account and balance checks',
    authType: 'api_key',
    envVar: 'STRIPE_API_KEY',
    docsUrl: 'https://stripe.com/docs/api'
  }
]);

/**
 * Normalizes raw GitHub status output from native bridge.
 * @param {any} raw
 * @returns {NormalizedGitHubStatus}
 */
export function normalizeGitHubStatus(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      isGitRepo: false,
      isGitHub: false,
      configured: false,
      recentRuns: [],
      rateLimited: false,
      error: 'Invalid status response'
    };
  }

  const isGitRepo = Boolean(raw.isGitRepo ?? raw.is_git_repo);
  const isGitHub = Boolean(raw.isGitHub ?? raw.is_github);
  const repoSlug = typeof (raw.repoSlug ?? raw.repo_slug) === 'string'
    ? (raw.repoSlug ?? raw.repo_slug).trim().slice(0, 100)
    : undefined;
  const branch = typeof raw.branch === 'string'
    ? raw.branch.trim().slice(0, 100)
    : undefined;
  const configured = Boolean(raw.configured);
  const configMethod = typeof (raw.configMethod ?? raw.config_method) === 'string'
    ? (raw.configMethod ?? raw.config_method)
    : undefined;
  const rateLimited = Boolean(raw.rateLimited ?? raw.rate_limited);
  const error = typeof raw.error === 'string' ? raw.error.slice(0, 250) : undefined;

  let pr;
  if (raw.pr && typeof raw.pr === 'object') {
    pr = {
      number: Number(raw.pr.number) || 0,
      title: String(raw.pr.title || '').trim().slice(0, 120),
      state: String(raw.pr.state || 'OPEN').toUpperCase(),
      url: String(raw.pr.url || '').trim(),
      isDraft: Boolean(raw.pr.isDraft ?? raw.pr.is_draft),
      headBranch: String(raw.pr.headBranch ?? raw.pr.head_branch ?? '').trim(),
      baseBranch: String(raw.pr.baseBranch ?? raw.pr.base_branch ?? 'main').trim(),
      reviewDecision: raw.pr.reviewDecision ?? raw.pr.review_decision ?? undefined,
      checksConclusion: raw.pr.checksConclusion ?? raw.pr.checks_conclusion ?? undefined
    };
  }

  const rawRuns = Array.isArray(raw.recentRuns ?? raw.recent_runs)
    ? (raw.recentRuns ?? raw.recent_runs)
    : [];
  const recentRuns = rawRuns.slice(0, 5).map(/** @param {any} r */ (r) => ({
    id: Number(r.id) || 0,
    name: String(r.name || 'Workflow').trim().slice(0, 60),
    status: String(r.status || 'completed').toLowerCase(),
    conclusion: r.conclusion ? String(r.conclusion).toLowerCase() : undefined,
    branch: String(r.branch || '').trim().slice(0, 80),
    event: String(r.event || 'push').trim().slice(0, 40),
    url: String(r.url || '').trim(),
    updatedAt: String(r.updatedAt ?? r.updated_at ?? '').trim()
  }));

  return {
    isGitRepo,
    isGitHub,
    repoSlug,
    branch,
    configured,
    configMethod,
    pr,
    recentRuns,
    rateLimited,
    rateLimitRemaining: typeof (raw.rateLimitRemaining ?? raw.rate_limit_remaining) === 'number'
      ? (raw.rateLimitRemaining ?? raw.rate_limit_remaining)
      : undefined,
    rateLimitReset: typeof (raw.rateLimitReset ?? raw.rate_limit_reset) === 'number'
      ? (raw.rateLimitReset ?? raw.rate_limit_reset)
      : undefined,
    error
  };
}

/**
 * Normalizes connected service integration check result.
 * @param {any} raw
 * @param {string} fallbackProvider
 * @returns {NormalizedIntegrationResult}
 */
export function normalizeIntegrationResult(raw, fallbackProvider = 'unknown') {
  if (!raw || typeof raw !== 'object') {
    return {
      provider: fallbackProvider,
      configured: false,
      status: 'error',
      error: 'Invalid response from service check'
    };
  }

  const provider = typeof raw.provider === 'string' ? raw.provider : fallbackProvider;
  const configured = Boolean(raw.configured);
  const validStatuses = ['connected', 'unconfigured', 'auth_error', 'rate_limited', 'error'];
  const status = validStatuses.includes(raw.status) ? raw.status : 'error';
  const summary = typeof raw.summary === 'string' ? raw.summary.slice(0, 150) : undefined;
  const accountId = typeof (raw.accountId ?? raw.account_id) === 'string'
    ? (raw.accountId ?? raw.account_id).slice(0, 60)
    : undefined;
  const error = typeof raw.error === 'string' ? raw.error.slice(0, 200) : undefined;

  return {
    provider,
    configured,
    status,
    summary,
    accountId,
    error
  };
}
