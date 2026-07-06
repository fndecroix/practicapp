/**
 * A practice session in progress, persisted to localStorage so the running
 * timer survives navigating away or reloading the page. A web app can't keep
 * counting while its tab is closed, but the timer is timestamp-based: on return
 * we recompute elapsed from `runningSince`, so it looks like it kept running.
 * There is at most one active timer at a time.
 */
export type ActiveTimer = {
  /** Local calendar day the session is being logged on (YYYY-MM-DD). */
  dayKey: string;
  /** Epoch ms of the first Start — becomes the session's startedAt. */
  startedAt: number;
  /** Seconds banked during pauses (the frozen part of the clock). */
  accumulatedSec: number;
  /** Epoch ms the current running segment began, or null while paused. */
  runningSince: number | null;
  focus: string;
  notes: string;
};

const KEY = 'practicapp:activeTimer:v1';

export function loadActiveTimer(): ActiveTimer | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as ActiveTimer;
    if (typeof t?.startedAt !== 'number' || typeof t?.dayKey !== 'string') return null;
    return t;
  } catch {
    return null;
  }
}

export function saveActiveTimer(t: ActiveTimer): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    // Storage full or unavailable — the timer just won't survive a reload.
  }
}

export function clearActiveTimer(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Ignore.
  }
}

/** Live elapsed seconds for an active timer, counting the running segment. */
export function activeElapsedSec(t: ActiveTimer): number {
  const running = t.runningSince != null ? (Date.now() - t.runningSince) / 1000 : 0;
  return t.accumulatedSec + running;
}
