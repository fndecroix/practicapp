import { Session } from './types';
import { makeId } from './id';

// Minimal typing for the Google Identity Services token client we use.
type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type TokenError = { type?: string; message?: string };
type TokenClient = {
  callback: (resp: TokenResponse) => void;
  error_callback: (err: TokenError) => void;
  requestAccessToken: (opts?: { prompt?: string }) => void;
};
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (resp: TokenResponse) => void;
            error_callback?: (err: TokenError) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

// drive.file = the app can only see/edit files it creates. Minimal scope, and
// it avoids Google's app-verification requirement for personal use.
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SHEET_TAB = 'Sesiones';
const HEADER = [
  'Fecha', 'Inicio', 'Minutos', 'Foco', 'Notas', 'ID', 'startedAt_ms', 'durationSec',
];

let gisPromise: Promise<void> | null = null;
let tokenClient: TokenClient | null = null;
let tokenClientId: string | null = null;
let accessToken: string | null = null;
let tokenExpiry = 0;

/** Load the GIS script once. */
function loadGis(): Promise<void> {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('No se pudo cargar Google Identity Services'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

// The current in-flight token request, so both callback and error_callback
// (and the safety timeout) can settle the same promise exactly once.
let pending: {
  resolve: (t: string) => void;
  reject: (e: Error) => void;
} | null = null;

function settleOk(resp: TokenResponse) {
  if (!pending) return;
  const p = pending;
  pending = null;
  if (resp.error || !resp.access_token) {
    p.reject(new Error(resp.error || 'No se obtuvo token'));
    return;
  }
  accessToken = resp.access_token;
  tokenExpiry = Date.now() + (resp.expires_in ?? 3600) * 1000;
  p.resolve(accessToken);
}

function settleErr(err: TokenError) {
  if (!pending) return;
  const p = pending;
  pending = null;
  p.reject(new Error(err.message || err.type || 'Se necesita reconectar Google'));
}

async function getTokenClient(clientId: string): Promise<TokenClient> {
  await loadGis();
  if (!tokenClient || tokenClientId !== clientId) {
    tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: settleOk,
      error_callback: settleErr,
    });
    tokenClientId = clientId;
  }
  return tokenClient;
}

/**
 * Acquire an access token. `interactive` shows the Google consent/login popup
 * (must be triggered by a user click). Non-interactive tries silently and
 * rejects if Google would need to show UI.
 */
export async function getAccessToken(
  clientId: string,
  interactive: boolean,
): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry - 60_000) return accessToken;
  const client = await getTokenClient(clientId);
  // Reject any request already in flight before starting a new one.
  if (pending) {
    pending.reject(new Error('Pedido de token reemplazado'));
    pending = null;
  }
  return new Promise<string>((resolve, reject) => {
    // Safety net: if GIS never calls back, don't hang forever.
    const timer = setTimeout(
      () => settleErr({ message: 'Tiempo de espera agotado' }),
      60_000,
    );
    pending = {
      resolve: (t) => {
        clearTimeout(timer);
        resolve(t);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    };
    try {
      client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    } catch (e) {
      clearTimeout(timer);
      pending = null;
      reject(e as Error);
    }
  });
}

export function clearToken() {
  accessToken = null;
  tokenExpiry = 0;
}

async function api(token: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    if (res.status === 401) clearToken();
    const body = await res.text();
    throw new Error(`Sheets API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Create the backup spreadsheet and return its id. */
export async function createSpreadsheet(token: string): Promise<string> {
  const data = await api(token, 'https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: 'PracticApp · Backup' },
      sheets: [{ properties: { title: SHEET_TAB } }],
    }),
  });
  return data.spreadsheetId as string;
}

function sessionToRow(s: Session): (string | number)[] {
  const inicio = new Date(s.startedAt).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return [
    s.date,
    inicio,
    Math.round(s.durationSec / 60),
    s.focus ?? '',
    s.notes ?? '',
    s.id,
    s.startedAt,
    s.durationSec,
  ];
}

function rowToSession(row: string[]): Session | null {
  const date = (row[0] ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const durationSec =
    Number(row[7]) || Math.round((Number(row[2]) || 0) * 60);
  if (!durationSec || durationSec < 1) return null;
  const startedAt = Number(row[6]) || new Date(`${date}T12:00:00`).getTime();
  return {
    id: (row[5] ?? '').trim() || makeId(),
    date,
    startedAt,
    durationSec,
    focus: (row[3] ?? '').trim() || undefined,
    notes: (row[4] ?? '').trim() || undefined,
    synced: true,
  };
}

/** Overwrite the whole sheet with the given sessions (sorted by start time). */
export async function pushBackup(
  token: string,
  spreadsheetId: string,
  sessions: Session[],
): Promise<void> {
  const rows = [...sessions]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map(sessionToRow);
  const values = [HEADER, ...rows];
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_TAB}`;
  // Clear stale rows first, then write from A1.
  await api(token, `${base}!A:Z:clear`, { method: 'POST', body: '{}' });
  await api(
    token,
    `${base}!A1?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values }) },
  );
}

/** Read all sessions back from the sheet. */
export async function pullBackup(
  token: string,
  spreadsheetId: string,
): Promise<Session[]> {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_TAB}`;
  const data = await api(token, `${base}!A2:H100000`);
  const rows: string[][] = data.values ?? [];
  return rows.map(rowToSession).filter((s): s is Session => s != null);
}
