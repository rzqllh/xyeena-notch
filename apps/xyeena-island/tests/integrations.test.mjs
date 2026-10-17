import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTED_INTEGRATIONS,
  normalizeGitHubStatus,
  normalizeIntegrationResult
} from '../src/core/integrations.mjs';

test('supported integrations catalog includes required providers', () => {
  assert.equal(SUPPORTED_INTEGRATIONS.length, 6);
  const ids = SUPPORTED_INTEGRATIONS.map(i => i.id);
  assert.ok(ids.includes('vercel'));
  assert.ok(ids.includes('notion'));
  assert.ok(ids.includes('n8n'));
  assert.ok(ids.includes('resend'));
  assert.ok(ids.includes('calcom'));
  assert.ok(ids.includes('stripe'));

  for (const item of SUPPORTED_INTEGRATIONS) {
    assert.ok(item.name.length > 0);
    assert.ok(item.envVar.length > 0);
    assert.ok(item.docsUrl.startsWith('https://'));
  }
});

test('normalizeGitHubStatus handles unconfigured state honestly', () => {
  const norm = normalizeGitHubStatus({
    is_git_repo: true,
    is_github: true,
    repo_slug: 'rzqllh/xyeena-notch',
    branch: 'feat/windows-parity-xyn',
    configured: false,
    config_method: 'none',
    error: 'Neither GitHub token nor gh CLI configured'
  });

  assert.equal(norm.isGitRepo, true);
  assert.equal(norm.isGitHub, true);
  assert.equal(norm.repoSlug, 'rzqllh/xyeena-notch');
  assert.equal(norm.branch, 'feat/windows-parity-xyn');
  assert.equal(norm.configured, false);
  assert.equal(norm.pr, undefined);
  assert.equal(norm.recentRuns.length, 0);
  assert.match(norm.error, /Neither GitHub token nor gh CLI/);
});

test('normalizeGitHubStatus handles active PR and recent runs', () => {
  const norm = normalizeGitHubStatus({
    is_git_repo: true,
    is_github: true,
    repo_slug: 'rzqllh/xyeena-notch',
    branch: 'feat/windows-parity-xyn',
    configured: true,
    config_method: 'gh_cli',
    pr: {
      number: 42,
      title: 'feat: coucou parity',
      state: 'open',
      url: 'https://github.com/rzqllh/xyeena-notch/pull/42',
      is_draft: true,
      head_branch: 'feat/windows-parity-xyn',
      base_branch: 'main',
      review_decision: 'REVIEW_REQUIRED',
      checks_conclusion: 'SUCCESS'
    },
    recent_runs: [
      {
        id: 999123,
        name: 'Xyeena Notch CI',
        status: 'completed',
        conclusion: 'success',
        branch: 'main',
        event: 'push',
        url: 'https://github.com/rzqllh/xyeena-notch/actions/runs/999123',
        updated_at: '2026-10-17T12:00:00Z'
      }
    ]
  });

  assert.equal(norm.configured, true);
  assert.ok(norm.pr);
  assert.equal(norm.pr.number, 42);
  assert.equal(norm.pr.isDraft, true);
  assert.equal(norm.pr.checksConclusion, 'SUCCESS');
  assert.equal(norm.recentRuns.length, 1);
  assert.equal(norm.recentRuns[0].name, 'Xyeena Notch CI');
  assert.equal(norm.recentRuns[0].conclusion, 'success');
});

test('normalizeIntegrationResult handles unconfigured and connected states', () => {
  const unconf = normalizeIntegrationResult({
    provider: 'notion',
    configured: false,
    status: 'unconfigured',
    error: 'Unconfigured: set NOTION_API_KEY'
  }, 'notion');

  assert.equal(unconf.provider, 'notion');
  assert.equal(unconf.configured, false);
  assert.equal(unconf.status, 'unconfigured');
  assert.match(unconf.error, /NOTION_API_KEY/);

  const conn = normalizeIntegrationResult({
    provider: 'vercel',
    configured: true,
    status: 'connected',
    summary: 'HTTP 200 OK · Verified'
  }, 'vercel');

  assert.equal(conn.provider, 'vercel');
  assert.equal(conn.configured, true);
  assert.equal(conn.status, 'connected');
  assert.match(conn.summary, /200 OK/);
});
