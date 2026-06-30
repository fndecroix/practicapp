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
   * not here, soft-delete ids here but gone locally, and tell new vs.
   * deleted-elsewhere apart when reconciling a pull.
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
  const { sessions, reconcile } = useSessions();
  const [config, setConfig] = useState<SyncConfig>(() => loadConfig());
  const [working, setWorking] = useState(false);
  const didInitialSync = useRef(false);

  const persist = useCallback((c: SyncConfig) => {
    setConfig(c);
    saveConfig(c);
  }, []);

  const sig = useMemo(() => signature(sessions), [sessions]);
  const dirty = sig !== config.lastBackupSig;
  const hasName = config.name.trim().length > 0;
  const ready = ENV_READY && hasName;

  /**
   * Upload pending local changes only (no read): append new sessions and
   * soft-delete removed ones. This is the ongoing "backup" while you use the app
   * — it never pulls, so it won't bring in other devices' changes.
   */
  const pushChanges = useCallback(async () => {
    const cfg = loadConfig();
    const name = cfg.name.trim();
    if (!ENDPOINT || !name) return;

    const localIds = sessions.map((s) => s.id);
    const pushed = cfg.pushedIds ?? [];
    const pushedSet = new Set(pushed);
    const localSet = new Set(localIds);
    const toAdd = sessions.filter((s) => !pushedSet.has(s.id));
    const toDelete = pushed.filter((id) => !localSet.has(id));

    if (toAdd.length === 0 && toDelete.length === 0) {
      // Nothing to upload: just mark in-sync so we stop being "dirty".
      if (cfg.lastBackupSig !== signature(sessions)) {
        persist({ ...cfg, pushedIds: localIds, lastBackupSig: signature(sessions) });
      }
      return;
    }

    setWorking(true);
    try {
      if (toAdd.length) await appendSessions(ENDPOINT, name, toAdd);
      if (toDelete.length) await deleteSessions(ENDPOINT, name, toDelete);
      persist({
        ...loadConfig(),
        pushedIds: localIds,
        lastBackupAt: Date.now(),
        lastBackupSig: signature(sessions),
      });
    } finally {
      setWorking(false);
    }
  }, [sessions, persist]);

  /**
   * Full two-way sync: push pending changes, then pull the sheet and merge other
   * devices' changes back in. Runs once when the page loads (and on sign-in), so
   * a refresh is what brings down what changed elsewhere.
   */
  const fullSync = useCallback(async () => {
    const cfg = loadConfig();
    const name = cfg.name.trim();
    if (!ENDPOINT || !name) return;

    const snapshot = sessions;
    const localIds = snapshot.map((s) => s.id);
    const pushed = cfg.pushedIds ?? [];
    const pushedSet = new Set(pushed);
    const localSet = new Set(localIds);
    const toAdd = snapshot.filter((s) => !pushedSet.has(s.id));
    const toDelete = pushed.filter((id) => !localSet.has(id));

    setWorking(true);
    try {
      if (toAdd.length) await appendSessions(ENDPOINT, name, toAdd);
      if (toDelete.length) await deleteSessions(ENDPOINT, name, toDelete);

      const remote = await listSessions(ENDPOINT, name);
      reconcile(remote, pushed);

      persist({
        ...loadConfig(),
        pushedIds: remote.map((s) => s.id),
        lastBackupAt: Date.now(),
        lastBackupSig: signature(remote),
      });
    } finally {
      setWorking(false);
    }
  }, [sessions, reconcile, persist]);

  /**
   * Gate "login": store the name (no Google login — the backend handles access)
   * and do a full sync to pull existing history for that name.
   */
  const signIn = useCallback(
    async (rawName: string) => {
      const name = rawName.trim();
      if (!name) return;
      // Persist the name now so sync can read it; keep the gate up (no setConfig)
      // until we're done so it can show a spinner.
      saveConfig({ ...loadConfig(), name });
      try {
        if (ENV_READY) {
          didInitialSync.current = true; // this counts as the page-load sync
          await fullSync();
        }
      } catch (e) {
        // Offline-first: a backend hiccup shouldn't block entering the app.
        console.warn('No se pudo sincronizar al entrar:', e);
      } finally {
        setConfig(loadConfig()); // flip the gate: name is now in React state
      }
    },
    [fullSync],
  );

  // One full sync per page load (pulls other devices' changes). A refresh
  // re-mounts this and runs it again; there is no polling in between.
  useEffect(() => {
    if (!ready || didInitialSync.current) return;
    didInitialSync.current = true;
    fullSync().catch((e) => console.warn('Sync inicial falló:', e));
  }, [ready, fullSync]);

  // Push local changes (only) promptly after they happen — the ongoing backup.
  useEffect(() => {
    if (!ready || !dirty || working) return;
    const t = setTimeout(() => {
      pushChanges().catch((e) => console.warn('Backup falló:', e));
    }, 2000);
    return () => clearTimeout(t);
  }, [ready, dirty, working, pushChanges]);

  const value = useMemo(() => ({ hasName, signIn }), [hasName, signIn]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
