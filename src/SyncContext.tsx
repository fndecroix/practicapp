import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSessions } from './SessionsContext';
import { appendSessions, deleteSessions, listSessions } from './sync';
import { Session } from './types';

const CONFIG_KEY = 'practicapp:sync:v1';

// The only backend config: the Apps Script web app URL (see apps-script/Code.gs).
const ENDPOINT = (import.meta.env.VITE_SHEETS_ENDPOINT ?? '').trim();
const ENV_READY = ENDPOINT.length > 0;

type SyncConfig = {
  /** Display name written into the 'Nombre' column; set at the gate. */
  name: string;
  /**
   * Session ids this device has pushed. Drives the incremental sync: append ids
   * not here, soft-delete ids here but gone locally. null = never synced (cold
   * start): we never delete on a cold start, and the backend dedupes appends.
   */
  pushedIds: string[] | null;
  lastBackupAt: number | null;
  lastBackupSig: string | null;
};

const EMPTY: SyncConfig = {
  name: '',
  pushedIds: null,
  lastBackupAt: null,
  lastBackupSig: null,
};

function loadConfig(): SyncConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

function saveConfig(c: SyncConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
}

/** Stable short hash of the meaningful session content (ignores order). */
function signature(sessions: Session[]): string {
  const str = sessions
    .map((s) => `${s.id}|${s.date}|${s.durationSec}|${s.focus ?? ''}|${s.notes ?? ''}`)
    .sort()
    .join('\n');
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return `${sessions.length}:${h >>> 0}`;
}

type SyncContextValue = {
  /** Whether a name has been entered (gates the app behind the name screen). */
  hasName: boolean;
  /** Enter the app: save the name and pull existing history on a fresh device. */
  signIn: (name: string) => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { sessions, replaceAll } = useSessions();
  const [config, setConfig] = useState<SyncConfig>(() => loadConfig());
  const [working, setWorking] = useState(false);

  const persist = useCallback((c: SyncConfig) => {
    setConfig(c);
    saveConfig(c);
  }, []);

  const sig = useMemo(() => signature(sessions), [sessions]);
  const dirty = sig !== config.lastBackupSig;
  const hasName = config.name.trim().length > 0;
  const ready = ENV_READY && hasName;

  /**
   * Incremental sync to the backend: append newly-created sessions and soft-delete
   * removed ones. Opening the app with nothing pending makes no call. On a cold
   * start we never delete (only the persisted pushedIds drive deletes) and the
   * backend dedupes appends, so logging in on a new device can't wipe anything.
   */
  const doBackup = useCallback(async () => {
    const cfg = loadConfig();
    const name = cfg.name.trim();
    if (!ENDPOINT || !name) return;

    const localIds = sessions.map((s) => s.id);
    if (cfg.pushedIds && cfg.lastBackupSig === signature(sessions)) return;

    setWorking(true);
    try {
      const pushed = cfg.pushedIds ?? [];
      const pushedSet = new Set(pushed);
      const localSet = new Set(localIds);

      const toAdd = sessions.filter((s) => !pushedSet.has(s.id));
      const toDelete = pushed.filter((id) => !localSet.has(id));

      if (toAdd.length) await appendSessions(ENDPOINT, name, toAdd);
      if (toDelete.length) await deleteSessions(ENDPOINT, name, toDelete);

      persist({
        ...cfg,
        pushedIds: localIds,
        lastBackupAt: Date.now(),
        lastBackupSig: signature(sessions),
      });
    } finally {
      setWorking(false);
    }
  }, [sessions, persist]);

  /** Pull this user's sessions from the backend into local storage. */
  const restore = useCallback(async () => {
    const cfg = loadConfig();
    const name = cfg.name.trim();
    if (!ENDPOINT || !name) return;
    const restored = await listSessions(ENDPOINT, name);
    replaceAll(restored);
    // Already on the server: seed pushedIds so we don't re-append.
    persist({
      ...loadConfig(),
      pushedIds: restored.map((s) => s.id),
      lastBackupSig: signature(restored),
      lastBackupAt: Date.now(),
    });
  }, [replaceAll, persist]);

  /**
   * Gate "login": store the name (no Google login — the backend handles access)
   * and, on a fresh device, pull existing history for that name. Pushing of any
   * local-only sessions is left to the auto-sync effect once the gate closes.
   */
  const signIn = useCallback(
    async (rawName: string) => {
      const name = rawName.trim();
      if (!name) return;
      // Persist the name now so restore can read it; keep the gate up (no
      // setConfig) until we're done so it can show a spinner.
      saveConfig({ ...loadConfig(), name });
      setWorking(true);
      try {
        if (ENV_READY && sessions.length === 0) await restore();
      } catch (e) {
        // Offline-first: a backend hiccup shouldn't block entering the app.
        console.warn('No se pudo traer el historial:', e);
      } finally {
        setWorking(false);
        setConfig(loadConfig()); // flip the gate: name is now in React state
      }
    },
    [sessions.length, restore],
  );

  // Automatic background sync: when ready and there are unsynced changes, push
  // shortly after they happen. Failures are silent (data stays safe locally).
  useEffect(() => {
    if (!ready || !dirty || working) return;
    const t = setTimeout(() => {
      doBackup().catch((e) => console.warn('Sync falló:', e));
    }, 3000);
    return () => clearTimeout(t);
  }, [ready, dirty, working, doBackup]);

  const value = useMemo(() => ({ hasName, signIn }), [hasName, signIn]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
