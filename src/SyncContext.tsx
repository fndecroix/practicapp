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
import {
  createSpreadsheet,
  getAccessToken,
  pullBackup,
  pushBackup,
  clearToken,
} from './sync';
import { Session } from './types';

const CONFIG_KEY = 'practicapp:sync:v1';

type SyncConfig = {
  clientId: string;
  spreadsheetId: string | null;
  lastBackupAt: number | null;
  lastBackupSig: string | null;
};

const EMPTY: SyncConfig = {
  clientId: '',
  spreadsheetId: null,
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

type Status = 'idle' | 'working';

type SyncContextValue = {
  configured: boolean;
  connected: boolean;
  status: Status;
  error: string | null;
  dirty: boolean;
  lastBackupAt: number | null;
  spreadsheetId: string | null;
  setClientId: (id: string) => void;
  clientId: string;
  connect: () => Promise<void>;
  backupNow: () => Promise<void>;
  restore: () => Promise<Session[]>;
  disconnect: () => void;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { sessions, replaceAll } = useSessions();
  const [config, setConfig] = useState<SyncConfig>(() => loadConfig());
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);

  const persist = useCallback((c: SyncConfig) => {
    setConfig(c);
    saveConfig(c);
  }, []);

  const sig = useMemo(() => signature(sessions), [sessions]);
  const dirty = sig !== config.lastBackupSig;
  const configured = config.clientId.trim().length > 0;
  const connected = configured && !!config.spreadsheetId;

  const setClientId = useCallback(
    (id: string) => persist({ ...loadConfig(), clientId: id.trim() }),
    [persist],
  );

  /** Core backup. interactive=true is allowed to pop the Google consent UI. */
  const doBackup = useCallback(
    async (interactive: boolean) => {
      const cfg = loadConfig();
      if (!cfg.clientId) throw new Error('Falta el Client ID de Google.');
      setStatus('working');
      setError(null);
      try {
        const token = await getAccessToken(cfg.clientId, interactive);
        let spreadsheetId = cfg.spreadsheetId;
        if (!spreadsheetId) spreadsheetId = await createSpreadsheet(token);
        await pushBackup(token, spreadsheetId, sessions);
        persist({
          ...cfg,
          spreadsheetId,
          lastBackupAt: Date.now(),
          lastBackupSig: signature(sessions),
        });
      } finally {
        setStatus('idle');
      }
    },
    [sessions, persist],
  );

  const connect = useCallback(() => doBackup(true), [doBackup]);
  const backupNow = useCallback(async () => {
    try {
      await doBackup(true);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  }, [doBackup]);

  const restore = useCallback(async (): Promise<Session[]> => {
    const cfg = loadConfig();
    if (!cfg.clientId || !cfg.spreadsheetId)
      throw new Error('Todavía no hay una planilla conectada.');
    setStatus('working');
    setError(null);
    try {
      const token = await getAccessToken(cfg.clientId, true);
      const restored = await pullBackup(token, cfg.spreadsheetId);
      replaceAll(restored);
      persist({ ...cfg, lastBackupSig: signature(restored), lastBackupAt: Date.now() });
      return restored;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setStatus('idle');
    }
  }, [replaceAll, persist]);

  const disconnect = useCallback(() => {
    clearToken();
    persist({ ...EMPTY, clientId: config.clientId });
  }, [persist, config.clientId]);

  // Automatic, silent backup: when connected and there are unsaved changes,
  // try once shortly after they happen. No popups — if Google needs UI we just
  // stay "dirty" until the user backs up manually.
  useEffect(() => {
    if (!connected || !dirty || status === 'working') return;
    const t = setTimeout(() => {
      autoTried.current = true;
      doBackup(false).catch(() => {
        /* silent: needs reconnect, surfaced via `dirty` in the UI */
      });
    }, 4000);
    return () => clearTimeout(t);
  }, [connected, dirty, status, doBackup]);

  const value = useMemo(
    () => ({
      configured,
      connected,
      status,
      error,
      dirty,
      lastBackupAt: config.lastBackupAt,
      spreadsheetId: config.spreadsheetId,
      clientId: config.clientId,
      setClientId,
      connect,
      backupNow,
      restore,
      disconnect,
    }),
    [
      configured,
      connected,
      status,
      error,
      dirty,
      config.lastBackupAt,
      config.spreadsheetId,
      config.clientId,
      setClientId,
      connect,
      backupNow,
      restore,
      disconnect,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
