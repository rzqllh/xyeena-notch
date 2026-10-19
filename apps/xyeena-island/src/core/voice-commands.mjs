// Voice commands parser and action dispatcher.
// Executes only explicit, bounded commands with zero unconfirmed destructive actions.

/**
 * @typedef {{
 *   action: 'SetMode' | 'Navigate' | 'MediaControl' | 'AskXyn' | 'WeeklyRecap' | 'Unknown',
 *   payload?: any
 * }} ParsedVoiceAction
 */

/**
 * Parse a voice transcript into a typed application action.
 * @param {string} transcript
 * @returns {ParsedVoiceAction}
 */
export function parseVoiceIntent(transcript) {
  if (!transcript || typeof transcript !== 'string') {
    return { action: 'Unknown', payload: { transcript: '' } };
  }

  const raw = transcript.trim();
  const text = raw.toLowerCase();
  if (!text) {
    return { action: 'Unknown', payload: { transcript: '' } };
  }

  // 1. Ask Xyn queries
  const xynPrefixes = ['ask xyn ', 'hey xyn ', 'xyn '];
  for (const prefix of xynPrefixes) {
    if (text.startsWith(prefix)) {
      const prompt = raw.slice(prefix.length).trim();
      if (prompt) {
        return { action: 'AskXyn', payload: { prompt } };
      }
    }
  }

  // 2. Mode controls
  if (text.includes('expand island') || text.includes('open island') || text.includes('show island')) {
    return { action: 'SetMode', payload: { mode: 'expanded' } };
  }
  if (text.includes('compact island') || text.includes('minimize island') || text.includes('collapse island')) {
    return { action: 'SetMode', payload: { mode: 'compact' } };
  }
  if (text.includes('hide island') || text.includes('close island')) {
    return { action: 'SetMode', payload: { mode: 'hidden' } };
  }

  // 3. Navigation
  if (text.includes('open chat') || text.includes('show chat') || text === 'chat') {
    return { action: 'Navigate', payload: { panel: 'chat' } };
  }
  if (text.includes('open clipboard') || text.includes('show clips') || text === 'clips' || text === 'clipboard') {
    return { action: 'Navigate', payload: { panel: 'clipboard' } };
  }
  if (text.includes('open settings') || text.includes('show settings') || text === 'settings' || text === 'preferences') {
    return { action: 'Navigate', payload: { panel: 'preferences' } };
  }
  if (text.includes('show activity') || text.includes('open activity') || text.includes('show agents') || text === 'activity' || text === 'agents') {
    return { action: 'Navigate', payload: { panel: 'activity' } };
  }
  if (text.includes('show now') || text.includes('open now') || text === 'now') {
    return { action: 'Navigate', payload: { panel: 'now' } };
  }

  // 4. Media transport controls
  if (text === 'play' || text === 'play music' || text === 'resume playback' || text === 'resume') {
    return { action: 'MediaControl', payload: { control: 'play' } };
  }
  if (text === 'pause' || text === 'pause music' || text === 'stop music') {
    return { action: 'MediaControl', payload: { control: 'pause' } };
  }
  if (text === 'next track' || text === 'next song' || text === 'skip' || text === 'skip song') {
    return { action: 'MediaControl', payload: { control: 'next' } };
  }
  if (text === 'previous track' || text === 'previous song' || text === 'previous') {
    return { action: 'MediaControl', payload: { control: 'previous' } };
  }

  // 5. Weekly Recap
  if (text.includes('weekly recap') || text.includes('generate recap') || text === 'recap') {
    return { action: 'WeeklyRecap' };
  }

  return { action: 'Unknown', payload: { transcript: raw } };
}

/**
 * Execute parsed voice command against application context.
 * @param {ParsedVoiceAction} action
 * @param {{
 *   setMode?: (mode: string) => void,
 *   setPanel?: (panel: string) => void,
 *   mediaControl?: (control: string) => void,
 *   askXyn?: (prompt: string) => void,
 *   triggerRecap?: () => void
 * }} context
 * @returns {{ success: boolean, message: string }}
 */
export function executeVoiceAction(action, context = {}) {
  if (!action || !action.action) {
    return { success: false, message: 'Invalid voice action' };
  }

  switch (action.action) {
    case 'SetMode': {
      const mode = action.payload?.mode;
      if (mode && typeof context.setMode === 'function') {
        context.setMode(mode);
        return { success: true, message: `Island switched to ${mode} mode` };
      }
      return { success: false, message: 'Unable to set mode' };
    }

    case 'Navigate': {
      const panel = action.payload?.panel;
      if (panel && typeof context.setPanel === 'function') {
        context.setPanel(panel);
        return { success: true, message: `Navigated to ${panel}` };
      }
      return { success: false, message: 'Unable to navigate to panel' };
    }

    case 'MediaControl': {
      const control = action.payload?.control;
      if (control && typeof context.mediaControl === 'function') {
        context.mediaControl(control);
        return { success: true, message: `Media ${control} triggered` };
      }
      return { success: false, message: 'Unable to control media' };
    }

    case 'AskXyn': {
      const prompt = action.payload?.prompt;
      if (prompt && typeof context.askXyn === 'function') {
        context.askXyn(prompt);
        return { success: true, message: `Asked Xyn: ${prompt}` };
      }
      return { success: false, message: 'Unable to ask Xyn' };
    }

    case 'WeeklyRecap': {
      if (typeof context.triggerRecap === 'function') {
        context.triggerRecap();
        return { success: true, message: 'Weekly recap triggered' };
      }
      return { success: false, message: 'Unable to trigger weekly recap' };
    }

    default:
      return {
        success: false,
        message: `Unrecognized voice command: "${action.payload?.transcript || ''}"`
      };
  }
}
