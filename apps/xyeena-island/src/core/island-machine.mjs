// Pure domain state; no desktop I/O or agent permissions.
export const MODES = Object.freeze(['hidden', 'dormant', 'compact', 'glance', 'expanded', 'focused', 'pinned']);

/**
 * @typedef {'hidden'|'dormant'|'compact'|'glance'|'expanded'|'focused'|'pinned'} IslandMode
 * @typedef {'pointer-enter'|'pointer-leave'|'activate'|'glance'|'collapse'|'toggle-pin'|'hide'} IslandEvent
 */

/** @param {IslandMode} state @param {IslandEvent} event @returns {IslandMode} */
export function transition(state, event) {
  if (!MODES.includes(state)) throw new Error(`Unknown Island state: ${state}`);
  switch (event) {
    case 'pointer-enter': return (state === 'hidden' || state === 'dormant') ? 'compact' : state;
    case 'pointer-leave':
      if (state === 'compact') return state === 'dormant' ? 'dormant' : 'hidden';
      if (state === 'glance') return 'compact';
      return state;
    case 'activate': return (state === 'hidden' || state === 'dormant' || state === 'compact' || state === 'glance') ? 'expanded' : state;
    case 'glance': return state === 'compact' ? 'glance' : state;
    case 'collapse': return (state === 'expanded' || state === 'focused' || state === 'pinned' || state === 'glance') ? 'compact' : state;
    case 'toggle-pin': return (state === 'expanded' || state === 'focused') ? 'pinned' : state === 'pinned' ? 'expanded' : state;
    case 'hide': return state === 'pinned' ? state : 'hidden';
    default: throw new Error(`Unknown Island event: ${event}`);
  }
}

/**
 * The native window is always resized to the island's actual rectangular area.
 * No large transparent overlay or background cursor interception.
 * @param {IslandMode} state
 */
export function shellDimensions(state) {
  if (!MODES.includes(state)) throw new Error(`Unknown Island state: ${state}`);
  switch (state) {
    case 'hidden':
    case 'dormant':
      return { width: 184, height: 8 };
    case 'compact':
      return { width: 400, height: 92 };
    case 'glance':
      return { width: 480, height: 144 };
    case 'expanded':
    case 'focused':
    case 'pinned':
    default:
      return { width: 620, height: 396 };
  }
}
