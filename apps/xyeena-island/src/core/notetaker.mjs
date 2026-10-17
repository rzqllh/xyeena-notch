// Notetaker session controller and local transcript manager.
// Enforces 100% on-device capture, explicit user consent, and bounded note storage.

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   transcript: string,
 *   summary?: string,
 *   createdAt: string,
 *   durationSeconds: number
 * }} NoteEntry
 */

export class NotetakerController {
  constructor() {
    /** @type {'idle' | 'recording' | 'paused' | 'processing' | 'error'} */
    this.state = 'idle';
    this.consentGiven = false;
    /** @type {NoteEntry[]} */
    this.notes = [];
    this.maxNotes = 20;
    /** @type {string | null} */
    this.activeSessionId = null;
    this.sessionStartTime = 0;
    /** @type {((state: string) => void) | null} */
    this.onStateChange = null;
  }

  /**
   * Set explicit user consent toggle.
   * Recording can NEVER start if consent is false.
   * @param {boolean} consented
   */
  setConsent(consented) {
    this.consentGiven = Boolean(consented);
    if (!this.consentGiven && this.state === 'recording') {
      this.cancel();
    }
  }

  /**
   * Start a consented recording session.
   * @param {string} [title]
   * @returns {string} session ID
   */
  startRecording(title = 'Meeting Note') {
    if (!this.consentGiven) {
      this.state = 'error';
      if (this.onStateChange) this.onStateChange(this.state);
      throw new Error('Explicit user consent is required before recording can begin.');
    }

    if (this.state === 'recording') {
      throw new Error('A recording session is already in progress.');
    }

    this.activeSessionId = `note_${Date.now()}`;
    this.sessionStartTime = Date.now();
    this.state = 'recording';
    if (this.onStateChange) this.onStateChange(this.state);
    return this.activeSessionId;
  }

  /**
   * Pause current recording session.
   */
  pauseRecording() {
    if (this.state === 'recording') {
      this.state = 'paused';
      if (this.onStateChange) this.onStateChange(this.state);
    }
  }

  /**
   * Resume paused recording session.
   */
  resumeRecording() {
    if (this.state === 'paused' && this.consentGiven) {
      this.state = 'recording';
      if (this.onStateChange) this.onStateChange(this.state);
    }
  }

  /**
   * Complete active recording session and store transcript note.
   * @param {string} transcriptText
   * @param {string} [title]
   * @returns {NoteEntry}
   */
  stopRecording(transcriptText = '', title) {
    if (this.state !== 'recording' && this.state !== 'paused') {
      throw new Error('No active recording session to complete.');
    }

    this.state = 'processing';
    if (this.onStateChange) this.onStateChange(this.state);

    const durationSeconds = Math.max(0, Math.round((Date.now() - this.sessionStartTime) / 1000));
    const cleanTranscript = typeof transcriptText === 'string' ? transcriptText.trim() : '';

    const note = {
      id: this.activeSessionId || `note_${Date.now()}`,
      title: title || `Note ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      transcript: cleanTranscript,
      createdAt: new Date().toISOString(),
      durationSeconds
    };

    this.notes.unshift(note);
    if (this.notes.length > this.maxNotes) {
      this.notes.length = this.maxNotes;
    }

    this.activeSessionId = null;
    this.state = 'idle';
    if (this.onStateChange) this.onStateChange(this.state);
    return note;
  }

  /**
   * Cancel and discard current recording session.
   */
  cancel() {
    this.activeSessionId = null;
    this.state = 'idle';
    if (this.onStateChange) this.onStateChange(this.state);
  }

  /**
   * Delete note by ID.
   * @param {string} noteId
   */
  deleteNote(noteId) {
    this.notes = this.notes.filter(n => n.id !== noteId);
  }

  /**
   * Format note as markdown string.
   * @param {NoteEntry} note
   * @returns {string}
   */
  exportMarkdown(note) {
    if (!note) return '';
    return [
      `# ${note.title}`,
      `*Recorded: ${note.createdAt} (${note.durationSeconds}s)*`,
      '',
      '## Transcript',
      note.transcript || '_No transcript recorded._',
      ''
    ].join('\n');
  }
}
