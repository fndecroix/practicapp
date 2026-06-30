import { Session } from './types';
import { toDayKey, fromDayKey, startOfWeekKey } from './format';

// ---- Settings (per-device, localStorage) ----

export type GoalSettings = {
  /** Minutes target per day (drives the daily ring). */
  dailyGoalMin: number;
  /** Minutes a day needs to count toward the streak. */
  thresholdMin: number;
  /** Forgiven missed days allowed in any rolling 7-day window (rest days). */
  restDaysPerWeek: number;
};

export const DEFAULT_GOALS: GoalSettings = {
  dailyGoalMin: 60,
  thresholdMin: 60, // a day counts toward the streak with at least 1 hour
  restDaysPerWeek: 1,
};

const GOALS_KEY = 'practicapp:goals:v1';

export function loadGoals(): GoalSettings {
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    return raw ? { ...DEFAULT_GOALS, ...JSON.parse(raw) } : { ...DEFAULT_GOALS };
  } catch {
    return { ...DEFAULT_GOALS };
  }
}

export function saveGoals(g: GoalSettings) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(g));
}

// ---- Day helpers ----

/** Shift a YYYY-MM-DD key by `delta` days. */
function addDays(key: string, delta: number): string {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + delta);
  return toDayKey(d);
}

/** Total practiced minutes per day key. */
export function minutesByDay(sessions: Session[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) {
    m.set(s.date, (m.get(s.date) ?? 0) + s.durationSec / 60);
  }
  return m;
}

// ---- Streaks ----

export type StreakInfo = {
  current: number;
  longest: number;
  todayDone: boolean;
  /** Streak is alive but today isn't done yet — nudge the user. */
  atRisk: boolean;
};

/**
 * Length of the practice-day run ending at `anchor`, tolerating up to
 * `restBudget` forgiven misses in any rolling 7-day window. When `pendingToday`,
 * a not-yet-practiced anchor day doesn't break the run (the day isn't over).
 */
function runBack(
  anchor: string,
  practiced: (k: string) => boolean,
  restBudget: number,
  pendingToday: boolean,
): number {
  let count = 0;
  const misses: string[] = [];
  for (let i = 0; i < 800; i++) {
    const d = addDays(anchor, -i);
    if (practiced(d)) {
      count++;
      continue;
    }
    if (i === 0 && pendingToday) continue; // today not over yet
    const windowEnd = addDays(d, 6);
    const usedInWindow = misses.filter((m) => m >= d && m <= windowEnd).length;
    if (usedInWindow < restBudget) {
      misses.push(d);
      continue;
    }
    break;
  }
  return count;
}

export function computeStreak(sessions: Session[], goals: GoalSettings): StreakInfo {
  const mins = minutesByDay(sessions);
  const practiced = (key: string) => (mins.get(key) ?? 0) >= goals.thresholdMin;
  const today = toDayKey();

  const current = runBack(today, practiced, goals.restDaysPerWeek, true);

  let longest = current;
  for (const day of mins.keys()) {
    if (!practiced(day)) continue;
    const r = runBack(day, practiced, goals.restDaysPerWeek, false);
    if (r > longest) longest = r;
  }

  return {
    current,
    longest,
    todayDone: practiced(today),
    atRisk: current > 0 && !practiced(today),
  };
}

// ---- Daily goal ----

export type DailyProgress = { minutes: number; goal: number; ratio: number };

export function dailyProgress(
  sessions: Session[],
  goals: GoalSettings,
  day: string = toDayKey(),
): DailyProgress {
  const minutes = minutesByDay(sessions).get(day) ?? 0;
  const goal = Math.max(1, goals.dailyGoalMin);
  return { minutes, goal, ratio: Math.min(minutes / goal, 1) };
}

// ---- Achievements ----

export type Achievement = {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  earned: boolean;
};

function hasFullWeek(sessions: Session[], goals: GoalSettings): boolean {
  const mins = minutesByDay(sessions);
  const weeks = new Map<string, Set<string>>();
  for (const [key, m] of mins) {
    if (m < goals.thresholdMin) continue;
    const ws = startOfWeekKey(fromDayKey(key));
    if (!weeks.has(ws)) weeks.set(ws, new Set());
    weeks.get(ws)!.add(key);
  }
  for (const set of weeks.values()) if (set.size >= 7) return true;
  return false;
}

export function achievements(sessions: Session[], goals: GoalSettings): Achievement[] {
  const totalMin = sessions.reduce((a, s) => a + s.durationSec / 60, 0);
  const streak = computeStreak(sessions, goals);
  const maxDayMin = Math.max(0, ...minutesByDay(sessions).values());
  const earlyBird = sessions.some((s) => new Date(s.startedAt).getHours() < 8);
  const focuses = new Set(
    sessions.map((s) => (s.focus ?? '').trim().toLowerCase()).filter(Boolean),
  );

  return [
    { id: 'first', emoji: '🌱', title: 'Primer paso', desc: 'Tu primera sesión', earned: sessions.length >= 1 },
    { id: 'streak7', emoji: '🔥', title: 'En llamas', desc: 'Racha de 7 días', earned: streak.longest >= 7 },
    { id: 'streak30', emoji: '🏔️', title: 'Constancia', desc: 'Racha de 30 días', earned: streak.longest >= 30 },
    { id: 'h10', emoji: '⏱️', title: '10 horas', desc: '10 horas acumuladas', earned: totalMin >= 600 },
    { id: 'marathon', emoji: '💪', title: 'Maratón', desc: 'Más de 2 horas en un día', earned: maxDayMin > 120 },
    { id: 'early', emoji: '🌅', title: 'Madrugador', desc: 'Practicaste antes de las 8', earned: earlyBird },
    { id: 'week', emoji: '📅', title: 'Semana perfecta', desc: '7 días en una semana', earned: hasFullWeek(sessions, goals) },
    { id: 'variety', emoji: '🎨', title: 'Versátil', desc: '3 focos distintos', earned: focuses.size >= 3 },
  ];
}

// ---- Levels (by cumulative practiced hours) ----

export type Level = {
  name: string;
  emoji: string;
  color: string;
  minHours: number;
};

export const LEVELS: Level[] = [
  { name: 'Bronce', emoji: '🥉', color: '#cd7f32', minHours: 0 },
  { name: 'Plata', emoji: '🥈', color: '#c4cad6', minHours: 5 },
  { name: 'Oro', emoji: '🥇', color: '#f5c542', minHours: 15 },
  { name: 'Ámbar', emoji: '🔶', color: '#f0852e', minHours: 30 },
  { name: 'Esmeralda', emoji: '💚', color: '#2ecc71', minHours: 60 },
  { name: 'Zafiro', emoji: '🔵', color: '#3b82f6', minHours: 100 },
  { name: 'Índigo', emoji: '🟣', color: '#7c5cfc', minHours: 175 },
  { name: 'Rubí', emoji: '🔴', color: '#e0245e', minHours: 300 },
  { name: 'Maestro', emoji: '👑', color: '#ffd86b', minHours: 500 },
];

export type LevelInfo = {
  index: number;
  current: Level;
  next: Level | null;
  hours: number;
  ratio: number; // 0..1 toward next level
};

export function levelInfo(sessions: Session[]): LevelInfo {
  const hours = sessions.reduce((a, s) => a + s.durationSec, 0) / 3600;
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (hours >= LEVELS[i].minHours) index = i;
  }
  const current = LEVELS[index];
  const next = LEVELS[index + 1] ?? null;
  const ratio = next
    ? Math.min((hours - current.minHours) / (next.minHours - current.minHours), 1)
    : 1;
  return { index, current, next, hours, ratio };
}

const SEEN_LEVEL_KEY = 'practicapp:level-seen:v1';

export function loadSeenLevel(): number {
  const v = Number(localStorage.getItem(SEEN_LEVEL_KEY));
  return Number.isFinite(v) ? v : 0;
}

export function saveSeenLevel(index: number) {
  localStorage.setItem(SEEN_LEVEL_KEY, String(index));
}

// ---- "Newly unlocked" tracking (for the celebration) ----

const SEEN_KEY = 'practicapp:badges-seen:v1';

export function loadSeenBadges(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveSeenBadges(ids: string[]) {
  localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
}
