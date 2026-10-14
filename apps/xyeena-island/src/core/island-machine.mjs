// Pure domain state; no desktop I/O or agent permissions.
export const MODES = Object.freeze(['hidden', 'compact', 'expanded', 'pinned']);

/**
 * @typedef {'hidden'|'compact'|'expanded'|'pinned'} IslandMode
 * @typedef {'pointer-enter'|'pointer-leave'|'activate'|'collapse'|'toggle-pin'|'hide'} IslandEvent
 */

/** @param {IslandMode} state @param {IslandEvent} event @returns {IslandMode} */
export function transition(state, event) {
  if (!MODES.includes(state)) throw new Error(`Unknown Island state: ${state}`);
  switch (event) {
    case 'pointer-enter': return state === 'hidden' ? 'compact' : state;
    case 'pointer-leave': return state === 'compact' ? 'hidden' : state;
    case 'activate': return state === 'hidden' || state === 'compact' ? 'expanded' : state;
    case 'collapse': return state === 'expanded' || state === 'pinned' ? 'compact' : state;
    case 'toggle-pin': return state === 'expanded' ? 'pinned' : state === 'pinned' ? 'expanded' : state;
    case 'hide': return state === 'pinned' ? state : 'hidden';
    default: throw new Error(`Unknown Island event: ${event}`);
  }
}

/**
 * The native window is always resized to the island's actual rectangular area.
 * No large transparent overlay or background cursor interception in Stage 0.
 * @param {IslandMode} state
 */
export function shellDimensions(state) {
  if (!MODES.includes(state)) throw new Error(`Unknown Island state: ${state}`);
  switch (state) {
    case 'hidden': return { width: 184, height: 8 };
    case 'compact': return { width: 352, height: 52 };
    default: return { width: 620, height: 396 };
  }
}
