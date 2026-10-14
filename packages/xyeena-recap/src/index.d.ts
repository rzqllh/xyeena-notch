export interface WeeklyWindowOptions {
  now?: Date;
  timeZone?: string;
  week?: 'previous' | 'current';
}

export interface WeeklyWindow {
  weekStart: string;
  weekEndExclusive: string;
  dates: string[];
}

export interface RecapTotals {
  sessions: number;
  durationMinutes: number;
  filesEdited: number;
  linesAdded: number;
  linesRemoved: number;
  commands: number;
  approvalsAllowed: number;
  approvalsDenied: number;
  questions: number;
  tasksCompleted: number;
}

export interface WeeklyRecap {
  schemaVersion: number;
  weekStart: string;
  weekEndExclusive: string;
  totals: RecapTotals;
  days: Array<{ date: string } & RecapTotals>;
  byAgent: Array<{ agent: string; sessions: number }>;
  busiestDay: string | null;
}

export function weeklyWindow(options?: WeeklyWindowOptions): WeeklyWindow;
export function buildWeeklyRecap(events: unknown[], options?: WeeklyWindowOptions): WeeklyRecap;
export function sanitizeRecap(input: unknown): WeeklyRecap | null;
export function upsertArchive(existing: unknown, recap: unknown, options?: { now?: Date; timeZone?: string; maxWeeks?: number }): WeeklyRecap[];
export function recapText(value: unknown): string;
export function recapSvg(value: unknown): string;
