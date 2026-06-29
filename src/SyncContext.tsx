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
import {
  getAccessToken,
  createSpreadsheet,
  pullMine,
  appendRows,
  markDeleted,
  fetchMyIds,
  ensureHeader,
  preloadAuth,
} from './sync';
import { Session } from './types';

const CONFIG_KEY = 'practicapp:sync:v1';

// App-wide config baked at build time (see .env.example). The Client ID is
// public (not a secret). The sheet id is optional: if unset, the app creates the
// sheet once and shows its id to pin in the env var for the other devices.
const ENV_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
const ENV_SHEET_ID = (import.meta.env.VITE_BACKUP_SPREADSHEET_ID ?? '').trim();
const ENV_READY = ENV_CLIENT_ID.length > 0;

type SyncConfig = {
  /** Display name written into the 'Nombre' column; per-device, set at the gate. */
  name: string;
  /** Id of the app-created sheet, until it's pinned via env var. */
  spreadsheetId: string | null;
  /**
   * Session ids this device has pushed to the sheet. Drives incremental sync and
   * deletes. null = never synced (cold start): we never delete on a cold start,
   * we only append our local rows that aren't in the sheet yet.
   */
  pushedIds: string[] | null;
  lastBackupAt: number | null;
  lastBackupSig: string | null;
};

const EMPTY: SyncConfig = {
  name: '',
  spreadsheetId: null,
  pushedIds: null,
  lastBackupAt: null,
  lastBackupSig: null,
};

/** Sheet id actually used: env var wins, else the app-created one (bootstrap). */
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

type SyncContextValue = {
  /** Whether a name has been entered (gates the app behind the name screen). */
  hasName: boolean;
  /** Whether Google needs an interactive sign-in again (shows the reconnect banner). */
  needsAuth: boolean;
  /** Enter the app: save the name, consent to Google, pull existing history. */
  signIn: (name: string) => Promise<void>;
  /** Interactive Google sign-in retry (used by the reconnect banner). */
  connect: () => Promise<void>;
  /** Id of the app-created sheet to pin in the env var (null once pinned). */
  pinSheetId: string | null;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { sessions, replaceAll } = useSessions();
  const [config, setConfig] = useState<SyncConfig>(() => loadConfig());
  const [working, setWorking] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);

  // Warm up Google Identity Services so the consent popup isn't blocked.
  useEffect(() => {
    if (ENV_READY) preloadAuth();
  }, []);

  const persist = useCallback((c: SyncConfig) => {
    setConfig(c);
    saveConfig(c);
  }, []);

  const sig = useMemo(() => signature(sessions), [sessions]);
  const dirty = sig !== config.lastBackupSig;
  const hasName = config.name.trim().length > 0;
  const ready = ENV_READY && hasName;

  /**
   * Incremental sync: append newly-created sessions and delete removed ones,
   * touching only the rows that changed (no full-sheet rewrite). Opening the app
   * with nothing pending makes no write at all. On a cold start we never delete —
   * we only append our local rows missing from the sheet — so logging in on a new
   * device or alongside existing rows merges instead of wiping.
   */
  const doBackup = useCallback(
    async (interactive: boolean) => {
      const cfg = loadConfig();
      const name = cfg.name.trim();
      if (!ENV_READY) throw new Error('Faltan las variables de entorno de Google.');
      if (!name) throw new Error('Primero ingresá tu nombre.');

      const localIds = sessions.map((s) => s.id);
      // Nothing changed since the last sync → skip (don't even acquire a token).
      if (cfg.pushedIds && cfg.lastBackupSig === signature(sessions)) {
        setNeedsAuth(false);
        return;
      }

      setWorking(true);
      try {
        const token = await getAccessToken(ENV_CLIENT_ID, interactive);
        // Use the pinned/created sheet, or create one the first time ever.
        let spreadsheetId = resolveSheetId(cfg);
        let createdId: string | null = null;
        if (!spreadsheetId) {
          spreadsheetId = await createSpreadsheet(token);
          createdId = spreadsheetId;
        }
        const coldStart = cfg.pushedIds == null;
        // A freshly created sheet already has its header.
        if (coldStart && !createdId) await ensureHeader(token, spreadsheetId);

        // Adds dedupe against what's actually in the sheet; deletes only ever
        // remove rows this device previously pushed (empty set on a cold start).
        const sheetIds =
          coldStart && !createdId
            ? await fetchMyIds(token, spreadsheetId, name)
            : new Set(cfg.pushedIds);
        const knownPushed = cfg.pushedIds ?? [];
        const localSet = new Set(localIds);

        const toAdd = sessions.filter((s) => !sheetIds.has(s.id));
        const toDelete = knownPushed.filter((id) => !localSet.has(id));

        if (toAdd.length) await appendRows(token, spreadsheetId, toAdd, name);
        // Soft-delete: tombstone removed rows instead of deleting them.
        if (toDelete.length) await markDeleted(token, spreadsheetId, toDelete, name);

        persist({
          ...cfg,
          spreadsheetId: createdId ?? cfg.spreadsheetId,
          pushedIds: localIds,
          lastBackupAt: Date.now(),
          lastBackupSig: signature(sessions),
        });
        setNeedsAuth(false);
      } finally {
        setWorking(false);
      }
    },
    [sessions, persist],
  );

  const connect = useCallback(() => doBackup(true), [doBackup]);

  /** Pull this user's rows from the sheet into local storage (replacing local). */
  const restore = useCallback(async () => {
    const cfg = loadConfig();
    const name = cfg.name.trim();
    const sheetId = resolveSheetId(cfg);
    if (!sheetId) return;
    const token = await getAccessToken(ENV_CLIENT_ID, false);
    const restored = await pullMine(token, sheetId, name);
    replaceAll(restored);
    // These rows are already in the sheet: seed pushedIds so we don't re-append.
    persist({
      ...loadConfig(),
      pushedIds: restored.map((s) => s.id),
      lastBackupSig: signature(restored),
      lastBackupAt: Date.now(),
    });
  }, [replaceAll, persist]);

  /**
   * Gate "login": store the name, get Google consent (interactive, from the
   * button click), and on a fresh device pull existing history for that name.
   * Pushing of any local-only sessions is left to the auto-sync effect, which
   * runs with fresh state once the gate closes (avoids stale-closure deletes).
   */
  const signIn = useCallback(
    async (rawName: string) => {
      const name = rawName.trim();
      if (!name) return;
      // Persist the name now so doBackup/restore can read it, but keep the gate
      // up (no setConfig) until we're done so it can show a spinner.
      saveConfig({ ...loadConfig(), name });
      setWorking(true);
      try {
        if (ENV_READY) {
          const token = await getAccessToken(ENV_CLIENT_ID, true);
          // Make sure a sheet exists now, so its id is available to pin and so a
          // fresh device can pull existing history right away.
          let sheetId = resolveSheetId(loadConfig());
          if (!sheetId) {
            sheetId = await createSpreadsheet(token);
            saveConfig({ ...loadConfig(), spreadsheetId: sheetId });
          }
          if (sessions.length === 0) await restore();
        }
      } catch {
        // Consent cancelled/failed → enter anyway; the banner offers a retry.
        setNeedsAuth(true);
      } finally {
        setWorking(false);
        setConfig(loadConfig()); // flip the gate: name is now in React state
      }
    },
    [sessions.length, restore],
  );

  // Automatic, silent backup: when ready and there are unsynced changes, try once
  // shortly after they happen. No popups — a failure just raises the reconnect
  // banner so the user can re-grant Google access interactively.
  useEffect(() => {
    if (!ready || !dirty || working) return;
    const t = setTimeout(() => {
      doBackup(false).catch(() => setNeedsAuth(true));
    }, 4000);
    return () => clearTimeout(t);
  }, [ready, dirty, working, doBackup]);

  // Show the created sheet id to pin until it's set in the env var.
  const pinSheetId = !ENV_SHEET_ID ? config.spreadsheetId : null;

  const value = useMemo(
    () => ({ hasName, needsAuth, signIn, connect, pinSheetId }),
    [hasName, needsAuth, signIn, connect, pinSheetId],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
