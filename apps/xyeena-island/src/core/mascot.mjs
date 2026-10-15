// Xyn is the existing Xyeena Guardian lion; preserve the canonical @xyeena/mascot contracts.
// Pure input-to-state mapping; no process, microphone, camera, or network inspection.
import {
  STATES,
  VARIANTS,
  EVENT_STATES,
  isState,
  isVariant,
  stateForEvent,
  pickMascotState,
  GuardianController,
  defineXyeenaGuardian
} from '@xyeena/mascot';

export {
  STATES,
  VARIANTS,
  EVENT_STATES,
  isState,
  isVariant,
  stateForEvent,
  pickMascotState,
  GuardianController,
  defineXyeenaGuardian
};

const WORKFLOW_ATTENTION = new Set(['DEBUG', 'REVIEW', 'BLOCKED', 'APPROVAL']);
const WORKFLOW_BUSY = new Set(['TRIAGE', 'DISCOVER', 'DEFINE', 'PLAN', 'EXECUTE', 'VERIFY', 'RELEASE']);
const WORKFLOW_SUCCESS = new Set(['DONE', 'SUCCESS', 'COMPLETED', 'FINISHED']);
const WORKFLOW_ERROR = new Set(['ERROR', 'FAILED']);

export const GUARDIAN_STATES = Object.freeze([
  'idle',
  'greeting',
  'listening',
  'playing',
  'working',
  'thinking',
  'searching',
  'question',
  'approval',
  'finished',
  'attention',
  'error',
  'rate_limit',
  'sleeping',
  'dancing'
]);

/**
 * Resolves the active state for the Island companion from genuine application events.
 * Priority hierarchy:
 * 1. Hidden mode -> sleeping
 * 2. Real workflow error -> error
 * 3. Real workflow attention / review -> attention (maps to question/approval)
 * 4. Manual meeting timer active -> listening
 * 5. Real workflow active -> working
 * 6. Real workflow success -> finished
 * 7. Active media playback -> playing
 * 8. Default -> idle
 *
 * @param {{
 *   meetingActive?: boolean,
 *   mediaPlaying?: boolean,
 *   runs?: Array<{ state?: string }>,
 *   mode?: string
 * }} source
 * @returns {string}
 */
export function chooseGuardianState(source = {}) {
  if (source.mode === 'hidden') return 'sleeping';
  const runs = Array.isArray(source.runs) ? source.runs : [];
  if (runs.some(x => WORKFLOW_ERROR.has((x?.state || '').toUpperCase()))) return 'error';
  if (runs.some(x => WORKFLOW_ATTENTION.has((x?.state || '').toUpperCase()))) return 'attention';
  if (source.meetingActive) return 'listening';
  if (runs.some(x => WORKFLOW_BUSY.has((x?.state || '').toUpperCase()))) return 'working';
  if (runs.length > 0 && runs.every(x => WORKFLOW_SUCCESS.has((x?.state || '').toUpperCase()))) return 'finished';
  if (source.mediaPlaying) return 'playing';
  return 'idle';
}

/**
 * Maps an Island state to a canonical mascot state recognized by <xyeena-guardian>
 * @param {string} state
 * @returns {string}
 */
export function toMascotState(state) {
  switch (state) {
    case 'listening': return 'thinking';
    case 'playing': return 'dancing';
    case 'attention': return 'question';
    case 'success': return 'finished';
    default: return isState(state) ? state : 'idle';
  }
}

/**
 * Returns human-readable status for a guardian state without false claims
 * @param {string} state
 * @returns {string}
 */
export function guardianStatus(state) {
  switch (state) {
    case 'listening': return 'Meeting timer active';
    case 'playing': return 'Media playing';
    case 'working': return 'Xyeena workflow in progress';
    case 'attention': return 'Xyeena workflow needs review';
    case 'finished': case 'success': return 'Xyeena workflow completed';
    case 'error': return 'Workflow needs attention';
    case 'sleeping': return 'Resting';
    case 'greeting': return 'Guardian salute';
    default: return 'Watching over your workspace';
  }
}

/** @param {string} state */
export function isGuardianState(state) {
  return GUARDIAN_STATES.includes(state) || isState(state);
}

// Backward compatibility aliases for existing tests and contracts
export const FOLD_STATES = Object.freeze(['idle', 'listening', 'playing', 'working', 'attention']);
export const chooseFoldState = chooseGuardianState;
export const foldStatus = guardianStatus;
/** @param {string} state */
export const isFoldState = (state) => FOLD_STATES.includes(state) || isGuardianState(state);

/** CSS-only fallback vector */
export const FOLD_ART = `<svg class="fold-art" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
 <path class="fold-shadow" d="M9 15 25 4 41 17 38 35 21 44 6 32Z"/>
 <path class="fold-body" d="M7 14 25 4 40 17 36 35 20 42 6 31Z"/>
 <path class="fold-facet" d="M25 4 40 17 25 24 20 42 18 23Z"/>
 <path class="fold-ridge" d="M7 14 18 23 25 24 40 17"/>
 <g class="fold-face"><circle cx="17" cy="27" r="1.65"/><circle cx="26" cy="30" r="1.65"/><path d="M19 33Q21 35 23 34"/></g>
 <path class="fold-spark" d="M39 5V12M35.5 8.5H42.5"/>
</svg>`;
