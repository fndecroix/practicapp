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
  pullMine,
  appendRows,
  deleteRowsByIds,
  fetchMyIds,
  fetchSheetGid,
  clearToken,
} from './sync';
import { Session } from './types';

const CONFIG_KEY = 'practicapp:sync:v1';

// App-wide config baked at build time (see .env.example). The Client ID is
// public (not a secret); the spreadsheet id pins one shared backup for everyone.
const ENV_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
const ENV_SHEET_ID = (import.meta.env.VITE_BACKUP_SPREADSHEET_ID ?? '').trim();

type SyncConfig = {
  clientId: string;
  spreadsheetId: string | null;
  /** Display name written into the 'Nombre' column; per-device. */
  name: string;
  /** Numeric gid of the data tab, cached for row deletes. */
  sheetGid: number | null;
  /**
   * Session ids this device believes are already rows in the sheet. Drives the
   * incremental sync: we only append ids not here, and delete ids here but gone
   * locally. null = never seeded (cold start) → reconcile against the sheet.
   */
  pushedIds: string[] | null;
  lastBackupAt: number | null;
  lastBackupSig: string | null;
};

const EMPTY: SyncConfig = {
  clientId: '',
  spreadsheetId: null,
  name: '',
  sheetGid: null,
  pushedIds: null,
  lastBackupAt: null,
  lastBackupSig: null,
};

/** Client ID actually used: env var wins, falls back to a locally pasted one. */
function resolveClientId(cfg: SyncConfig): string {
  return ENV_CLIENT_ID || cfg.clientId.trim();
}

/** Spreadsheet id actually used: env var wins, falls back to a bootstrapped one. */
function resolveSheetId(cfg: SyncConfig): string {
  return ENV_SHEET_ID || (cfg.spreadsheetId ?? '');
}

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
  spreadsheetId: string;
  /** True when the Client ID comes from a build env var (field hidden in UI). */
  clientIdLocked: boolean;
  /** True when the spreadsheet id comes from a build env var (already pinned). */
  sheetIdLocked: boolean;
  setClientId: (id: string) => void;
  clientId: string;
  name: string;
  setName: (name: string) => void;
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
  const clientId = resolveClientId(config);
  const sheetId = resolveSheetId(config);
  const hasName = config.name.trim().length > 0;
  const configured = clientId.length > 0 && hasName;
  const connected = configured && sheetId.length > 0;

  const setClientId = useCallback(
    (id: string) => persist({ ...loadConfig(), clientId: id.trim() }),
    [persist],
  );

  const setName = useCallback(
    (name: string) => persist({ ...loadConfig(), name: name.trim() }),
    [persist],
  );

  /**
   * Incremental sync: append newly-created sessions and delete removed ones,
   * touching only the rows that changed (no full-sheet rewrite). When there is
   * nothing to add or delete it makes no write at all — so just opening the app
   * is a no-op. interactive=true is allowed to pop the Google consent UI.
   */
  const doBackup = useCallback(
    async (interactive: boolean) => {
      const cfg = loadConfig();
      const cid = resolveClientId(cfg);
      const name = cfg.name.trim();
      if (!cid) throw new Error('Falta el Client ID de Google.');
      if (!name) throw new Error('Primero ingresá tu nombre.');

      const localIds = sessions.map((s) => s.id);
      // Cheap pre-check against our last-known sheet state to skip needless work
      // and avoid even acquiring a token when there is nothing to do.
      if (cfg.pushedIds && cfg.lastBackupSig === signature(sessions)) return;

      setStatus('working');
      setError(null);
      try {
        const token = await getAccessToken(cid, interactive);
        let spreadsheetId = resolveSheetId(cfg);
        if (!spreadsheetId) spreadsheetId = await createSpreadsheet(token);

        // Cold start: learn which of our ids are already in the sheet so we
        // never duplicate rows (handles new devices and the old full-rewrite).
        const pushed =
          cfg.pushedIds ?? [...(await fetchMyIds(token, spreadsheetId, name))];
        const pushedSet = new Set(pushed);
        const localSet = new Set(localIds);

        const toAdd = sessions.filter((s) => !pushedSet.has(s.id));
        const toDelete = pushed.filter((id) => !localSet.has(id));

        if (toAdd.length) await appendRows(token, spreadsheetId, toAdd, name);

        let sheetGid = cfg.sheetGid;
        if (toDelete.length) {
          if (sheetGid == null) sheetGid = await fetchSheetGid(token, spreadsheetId);
          await deleteRowsByIds(token, spreadsheetId, toDelete, name, sheetGid);
        }

        persist({
          ...cfg,
          spreadsheetId,
          sheetGid,
          pushedIds: localIds,
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
    const cid = resolveClientId(cfg);
    const sheet = resolveSheetId(cfg);
    const name = cfg.name.trim();
    if (!cid || !sheet)
      throw new Error('Todavía no hay una planilla conectada.');
    if (!name) throw new Error('Primero ingresá tu nombre.');
    setStatus('working');
    setError(null);
    try {
      const token = await getAccessToken(cid, true);
      const restored = await pullMine(token, sheet, name);
      replaceAll(restored);
      // These rows are already in the sheet: seed pushedIds so we don't re-append.
      persist({
        ...cfg,
        pushedIds: restored.map((s) => s.id),
        lastBackupSig: signature(restored),
        lastBackupAt: Date.now(),
      });
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
    persist({ ...EMPTY, clientId: config.clientId, name: config.name });
  }, [persist, config.clientId, config.name]);

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
      spreadsheetId: sheetId,
      clientIdLocked: ENV_CLIENT_ID.length > 0,
      sheetIdLocked: ENV_SHEET_ID.length > 0,
      clientId,
      name: config.name,
      setName,
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
      sheetId,
      clientId,
      config.name,
      setName,
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
