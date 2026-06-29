import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Session } from './types';
import { loadSessions, saveSessions } from './storage';
import { startOfWeekKey, toDayKey } from './format';
import { makeId } from './id';

type NewSession = Omit<Session, 'id' | 'synced'>;

type SessionsContextValue = {
  sessions: Session[];
  addSession: (s: NewSession) => Session;
  updateSession: (id: string, patch: Partial<Session>) => void;
  deleteSession: (id: string) => void;
  replaceAll: (sessions: Session[]) => void;
  sessionsByDay: (dayKey: string) => Session[];
  totalForDay: (dayKey: string) => number;
  daysWithSessions: Set<string>;
  totals: { all: number; week: number; today: number; sessionCount: number };
};

const SessionsContext = createContext<SessionsContextValue | null>(null);

export function SessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const first = useRef(true);

  // Persist on every change except the initial mount.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    saveSessions(sessions);
  }, [sessions]);

  const addSession = useCallback((s: NewSession): Session => {
    const session: Session = { ...s, id: makeId(), synced: false };
    setSessions((prev) => [...prev, session]);
    return session;
  }, []);

  const updateSession = useCallback((id: string, patch: Partial<Session>) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Replace the whole dataset (used when restoring from a backup).
  const replaceAll = useCallback((next: Session[]) => {
    setSessions(next);
  }, []);

  const sessionsByDay = useCallback(
    (dayKey: string) =>
      sessions
        .filter((s) => s.date === dayKey)
        .sort((a, b) => a.startedAt - b.startedAt),
    [sessions],
  );

  const totalForDay = useCallback(
    (dayKey: string) =>
      sessions
        .filter((s) => s.date === dayKey)
        .reduce((sum, s) => sum + s.durationSec, 0),
    [sessions],
  );

  const daysWithSessions = useMemo(
    () => new Set(sessions.map((s) => s.date)),
    [sessions],
  );

  const totals = useMemo(() => {
    const today = toDayKey();
    const weekStart = startOfWeekKey();
    let all = 0;
    let week = 0;
    let todayTotal = 0;
    for (const s of sessions) {
      all += s.durationSec;
      if (s.date >= weekStart) week += s.durationSec;
      if (s.date === today) todayTotal += s.durationSec;
    }
    return { all, week, today: todayTotal, sessionCount: sessions.length };
  }, [sessions]);

  const value = useMemo(
    () => ({
      sessions,
      addSession,
      updateSession,
      deleteSession,
      replaceAll,
      sessionsByDay,
      totalForDay,
      daysWithSessions,
      totals,
    }),
    [
      sessions,
      addSession,
      updateSession,
      deleteSession,
      replaceAll,
      sessionsByDay,
      totalForDay,
      daysWithSessions,
      totals,
    ],
  );

  return (
    <SessionsContext.Provider value={value}>
      {children}
    </SessionsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSessions(): SessionsContextValue {
  const ctx = useContext(SessionsContext);
  if (!ctx) throw new Error('useSessions must be used within SessionsProvider');
  return ctx;
}
