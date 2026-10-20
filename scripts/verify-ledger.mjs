#!/usr/bin/env node

/**
 * @file scripts/verify-ledger.mjs
 * Authoritative ledger validator and Markdown table generator.
 *
 * Complies with Master Contract §2, §4, §5, §6 and Phase 0 Task 5:
 * - Validates schema and fields for every row in docs/parity/ledger.json
 * - Enforces zero duplicate IDs and legal status vocabulary
 * - Enforces that any VERIFIED row links to named passing tests in test-manifest.json
 * - Enforces that HOST-ACCEPTED rows require explicit scoped E4 evidence
 * - Validates that Notch E1 paths exist in active checkout
 * - Validates that Coucou E1 paths exist in the pinned upstream clone
 * - Enforces owner rationale for DEFERRED, EXCLUDED, and SKIPPED capabilities
 * - Generates docs/parity/LEDGER.md from ledger.json
 * - Includes negative test suite (--test)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const ALLOWED_STATUSES = new Set([
  'ABSENT',
  'FOUNDATION',
  'WIRED',
  'VERIFIED',
  'HOST-ACCEPTED',
  'UNVERIFIED-CONTRACT',
  'DEFERRED',
  'EXCLUDED',
  'SKIPPED',
]);

const ALLOWED_TIERS = new Set(['A', 'B', 'C']);
const ALLOWED_DECISIONS = new Set([
  'build',
  'adapt',
  'skip',
  'needs-user',
  'verified',
  'excluded',
  'deferred',
]);

export function findUpstreamPath() {
  const envTemp = process.env.TEMP || process.env.TMP || '/tmp';
  const candidates = [
    process.env.COUCOU_UPSTREAM_DIR,
    path.join(envTemp, 'coucou-upstream'),
    path.join(REPO_ROOT, '..', 'coucou-upstream'),
  ].filter(Boolean);

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return null;
}

export function validateLedger(ledger, options = {}) {
  const {
    repoRoot = REPO_ROOT,
    upstreamRoot = findUpstreamPath(),
    testManifest = null,
    skipPathChecks = false,
  } = options;

  const errors = [];
  const seenIds = new Set();

  if (!Array.isArray(ledger)) {
    return ['Ledger must be an array of capability rows.'];
  }

  // Load passed tests set from manifest if provided
  const passedTests = new Set();
  if (testManifest && testManifest.suites) {
    for (const suite of Object.values(testManifest.suites)) {
      if (Array.isArray(suite.tests)) {
        for (const t of suite.tests) {
          passedTests.add(t);
        }
      }
    }
  }

  for (let i = 0; i < ledger.length; i++) {
    const row = ledger[i];
    const prefix = `Row [${i}] (ID: ${row?.id || 'UNKNOWN'}):`;

    if (!row.id || typeof row.id !== 'string') {
      errors.push(`${prefix} missing required string field 'id'.`);
    } else {
      if (seenIds.has(row.id)) {
        errors.push(`${prefix} duplicate id '${row.id}'.`);
      }
      seenIds.add(row.id);
    }

    if (!row.area || typeof row.area !== 'string') {
      errors.push(`${prefix} missing required string field 'area'.`);
    }
    if (!row.capability || typeof row.capability !== 'string') {
      errors.push(`${prefix} missing required string field 'capability'.`);
    }

    if (!ALLOWED_STATUSES.has(row.status)) {
      errors.push(`${prefix} invalid status '${row.status}'. Allowed: ${Array.from(ALLOWED_STATUSES).join(', ')}`);
    }

    if (!ALLOWED_TIERS.has(row.tier)) {
      errors.push(`${prefix} invalid tier '${row.tier}'. Allowed: A, B, C`);
    }

    if ((row.tier === 'A' || row.tier === 'B') && !row.phase) {
      errors.push(`${prefix} tier '${row.tier}' requires a target 'phase' (e.g. P0, P1, P2...).`);
    }

    if (!row.decision || !ALLOWED_DECISIONS.has(row.decision)) {
      errors.push(`${prefix} invalid decision '${row.decision}'. Allowed: ${Array.from(ALLOWED_DECISIONS).join(', ')}`);
    }

    if (row.status === 'DEFERRED' || row.status === 'EXCLUDED' || row.status === 'SKIPPED') {
      if (!row.reason || typeof row.reason !== 'string' || row.reason.trim().length < 5) {
        errors.push(`${prefix} status '${row.status}' requires an explicit non-empty owner rationale in 'reason'.`);
      }
    }

    // Coucou path checks
    if (!row.coucou || typeof row.coucou !== 'object') {
      errors.push(`${prefix} missing 'coucou' object.`);
    } else {
      if (!Array.isArray(row.coucou.paths) || row.coucou.paths.length === 0) {
        errors.push(`${prefix} coucou.paths must be a non-empty array.`);
      } else if (!skipPathChecks && upstreamRoot) {
        for (const p of row.coucou.paths) {
          const cleanPath = p.split(':')[0];
          const fullPath = path.join(upstreamRoot, cleanPath);
          if (!fs.existsSync(fullPath)) {
            errors.push(`${prefix} upstream coucou path does not exist: '${cleanPath}' in ${upstreamRoot}`);
          }
        }
      }
    }

    // Notch path checks
    if (!row.notch || typeof row.notch !== 'object') {
      errors.push(`${prefix} missing 'notch' object.`);
    } else {
      if (!Array.isArray(row.notch.paths)) {
        errors.push(`${prefix} notch.paths must be an array.`);
      } else if (!skipPathChecks) {
        for (const p of row.notch.paths) {
          const cleanPath = p.split(':')[0];
          const candidates = [
            path.join(repoRoot, cleanPath),
            path.join(repoRoot, 'apps', 'xyeena-island', cleanPath),
          ];
          const exists = candidates.some(c => fs.existsSync(c));
          if (!exists) {
            errors.push(`${prefix} notch path does not exist in repo checkout: '${cleanPath}'`);
          }
        }
      }
    }

    // Evidence checks
    if (!Array.isArray(row.evidence) || row.evidence.length === 0) {
      errors.push(`${prefix} evidence must be a non-empty array.`);
    } else {
      const classes = new Set(row.evidence.map(e => e.class));

      if (row.status === 'VERIFIED') {
        if (!Array.isArray(row.notch.tests) || row.notch.tests.length === 0) {
          errors.push(`${prefix} status is VERIFIED but notch.tests is empty. Requires named passing tests.`);
        } else if (testManifest) {
          for (const testName of row.notch.tests) {
            if (!passedTests.has(testName)) {
              errors.push(`${prefix} claims test '${testName}' is passed, but it was not found in test-manifest.json.`);
            }
          }
        }
        if (!classes.has('E3')) {
          errors.push(`${prefix} status is VERIFIED but lacks E3 automated test evidence.`);
        }
        if (!classes.has('E2')) {
          errors.push(`${prefix} status is VERIFIED but lacks E2 command output evidence.`);
        }
      }

      if (row.status === 'HOST-ACCEPTED') {
        if (!classes.has('E4')) {
          errors.push(`${prefix} status is HOST-ACCEPTED but lacks E4 user host verification evidence.`);
        }
      }
    }
  }

  return errors;
}

export function generateMarkdown(ledger) {
  const lines = [
    '# Verified Windows 0.5.0 Parity Ledger',
    '',
    '<!-- MACHINE-GENERATED FROM docs/parity/ledger.json — DO NOT HAND-EDIT -->',
    '',
    `*Generated on:* ${new Date().toISOString()}`,
    `*Total Capabilities:* ${ledger.length}`,
    '',
    '| ID | Area | Capability | Coucou Path | Status | Tier | Phase | Decision | Tests | Evidence |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];

  for (const row of ledger) {
    const coucouPath = (row.coucou?.paths || []).join(', ');
    const tests = (row.notch?.tests || []).length;
    const evidenceClasses = (row.evidence || []).map(e => e.class).join('+');
    lines.push(
      `| **${row.id}** | ${row.area} | ${row.capability} | \`${coucouPath}\` | \`${row.status}\` | ${row.tier} | ${row.phase || '—'} | ${row.decision} | ${tests} | ${evidenceClasses} |`
    );
  }

  lines.push('');
  return lines.join('\n');
}

export function runNegativeTests() {
  console.log('Running verify-ledger negative test suite...');

  const validRow = {
    id: 'T01',
    area: 'test',
    capability: 'Test item',
    coucou: { paths: ['windows/README.md'], summary: 'Test', platform: 'win' },
    notch: { paths: ['package.json'], wired: true, tests: ['test-alpha'] },
    status: 'VERIFIED',
    tier: 'A',
    phase: 'P0',
    decision: 'verified',
    reason: 'Owner test rationale',
    evidence: [{ class: 'E1', ref: 'package.json:1' }, { class: 'E2', ref: 'npm test' }, { class: 'E3', ref: 'test-alpha' }],
    docs_claims: []
  };

  const mockManifest = {
    suites: {
      test: {
        tests: ['test-alpha']
      }
    }
  };

  // 1. Test Duplicate ID
  const dupErrors = validateLedger([validRow, { ...validRow }], { skipPathChecks: true, testManifest: mockManifest });
  if (!dupErrors.some(e => e.includes('duplicate id'))) {
    throw new Error('FAIL: Did not catch duplicate ID.');
  }

  // 2. Test Invalid Status
  const badStatusErrors = validateLedger([{ ...validRow, status: 'BOGUS_STATUS' }], { skipPathChecks: true, testManifest: mockManifest });
  if (!badStatusErrors.some(e => e.includes('invalid status'))) {
    throw new Error('FAIL: Did not catch invalid status.');
  }

  // 3. Test Fake Passing Test Name
  const fakeTestErrors = validateLedger([{ ...validRow, notch: { ...validRow.notch, tests: ['fabricated-test-name'] } }], { skipPathChecks: true, testManifest: mockManifest });
  if (!fakeTestErrors.some(e => e.includes('fabricated-test-name'))) {
    throw new Error('FAIL: Did not catch unperformed / fabricated test name.');
  }

  // 4. Test HOST-ACCEPTED without E4
  const hostNoE4Errors = validateLedger([{ ...validRow, status: 'HOST-ACCEPTED', evidence: [{ class: 'E1', ref: 'a' }] }], { skipPathChecks: true, testManifest: mockManifest });
  if (!hostNoE4Errors.some(e => e.includes('HOST-ACCEPTED but lacks E4'))) {
    throw new Error('FAIL: Did not catch HOST-ACCEPTED lacking E4.');
  }

  // 5. Test Tier A without Phase
  const noPhaseErrors = validateLedger([{ ...validRow, phase: undefined }], { skipPathChecks: true, testManifest: mockManifest });
  if (!noPhaseErrors.some(e => e.includes("requires a target 'phase'"))) {
    throw new Error('FAIL: Did not catch Tier A lacking phase.');
  }

  // 6. Test DEFERRED without reason
  const deferredNoReason = validateLedger([{ ...validRow, status: 'DEFERRED', reason: '' }], { skipPathChecks: true, testManifest: mockManifest });
  if (!deferredNoReason.some(e => e.includes("requires an explicit non-empty owner rationale"))) {
    throw new Error('FAIL: Did not catch DEFERRED lacking reason.');
  }

  console.log('PASS: All 6 negative tests rejected invalid ledger records as expected.\n');
}

// CLI Execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    try {
      runNegativeTests();
      process.exit(0);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }

  const ledgerPath = path.join(REPO_ROOT, 'docs', 'parity', 'ledger.json');
  const manifestPath = path.join(REPO_ROOT, 'docs', 'parity', 'test-manifest.json');
  const ledgerMdPath = path.join(REPO_ROOT, 'docs', 'parity', 'LEDGER.md');

  if (!fs.existsSync(ledgerPath)) {
    console.error(`Ledger file not found at ${ledgerPath}`);
    process.exit(1);
  }

  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  const testManifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : null;

  const upstreamPath = findUpstreamPath();
  if (!upstreamPath) {
    console.warn('WARN: Coucou upstream clone not found in temp directory; upstream path checks will be skipped.');
  }

  const errors = validateLedger(ledger, {
    repoRoot: REPO_ROOT,
    upstreamRoot: upstreamPath,
    testManifest,
    skipPathChecks: false,
  });

  if (errors.length > 0) {
    console.error(`\nFAIL: Ledger validation failed with ${errors.length} error(s):`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(`PASS: Ledger validation succeeded (${ledger.length} capability rows verified).`);

  if (args.includes('--generate-markdown') || !fs.existsSync(ledgerMdPath)) {
    const md = generateMarkdown(ledger);
    fs.writeFileSync(ledgerMdPath, md, 'utf8');
    console.log(`Updated human-readable table: ${ledgerMdPath}`);
  }

  process.exit(0);
}
