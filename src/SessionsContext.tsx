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
  editSession: (id: string, patch: Partial<NewSession>) => void;
  deleteSession: (id: string) => void;
  replaceAll: (sessions: Session[]) => void;
  reconcile: (remote: Session[], pushedIds: string[]) => void;
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

  /**
   * Edit an existing session's fields. Because the sync backend only knows how
   * to append and soft-delete (never update a row), an edit is modeled as
   * delete-the-old + create-a-new: we swap the row in place for a copy carrying
   * a brand-new id and `synced: false`. On the next sync the old id disappears
   * locally (→ soft-deleted on the sheet) and the new id gets appended, so the
   * edit propagates without the sheet ever overwriting it on a later pull.
   */
  const editSession = useCallback((id: string, patch: Partial<NewSession>) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, ...patch, id: makeId(), synced: false } : s,
      ),
    );
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Replace the whole dataset (used when restoring from a backup).
  const replaceAll = useCallback((next: Session[]) => {
    setSessions(next);
  }, []);

  /**
   * Merge the live remote sessions into local for two-way sync. We keep every
   * remote row, plus any local session that isn't on the server yet (not in
   * `pushedIds`) — those are pending uploads. Local sessions that we had pushed
   * but are gone from remote were deleted on another device, so we drop them.
   * Runs as a functional update so concurrent local edits aren't lost.
   */
  const reconcile = useCallback((remote: Session[], pushedIds: string[]) => {
    const remoteById = new Map(remote.map((s) => [s.id, s]));
    const pushedSet = new Set(pushedIds);
    setSessions((prev) => {
      const result = remote.slice();
      for (const s of prev) {
        if (remoteById.has(s.id)) continue; // already taken from remote
        if (pushedSet.has(s.id)) continue; // pushed before, gone now → deleted elsewhere
        result.push(s); // local-only, not uploaded yet → keep
      }
      // No change? keep the same array to avoid a needless re-render / save.
      if (result.length === prev.length) {
        const prevIds = new Set(prev.map((s) => s.id));
        if (result.every((s) => prevIds.has(s.id))) return prev;
      }
      return result;
    });
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
      editSession,
      deleteSession,
      replaceAll,
      reconcile,
      sessionsByDay,
      totalForDay,
      daysWithSessions,
      totals,
    }),
    [
      sessions,
      addSession,
      updateSession,
      editSession,
      deleteSession,
      replaceAll,
      reconcile,
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
