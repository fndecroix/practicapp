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

// drive.file = the app can only see/edit files it creates. Minimal scope, and it
// avoids Google's app-verification requirement. The app creates the backup sheet
// once; its id is then pinned via env var so every device (same account, same
// Client ID) reaches that same app-created file.
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SHEET_TAB = 'Sesiones';
// 'Nombre' is the first column: it identifies whose session each row is, so
// many people can share one spreadsheet. Each person owns the rows with their
// own name. 'Borrado' is a soft-delete tombstone: we never remove rows, we just
// set it to TRUE, so nothing is ever lost from the sheet by mistake.
const HEADER = [
  'Nombre', 'Fecha', 'Inicio', 'Minutos', 'Foco', 'Notas', 'ID', 'startedAt_ms', 'durationSec', 'Borrado',
];
// Spreadsheet column span (A..J = 10 columns, matching HEADER).
const RANGE = 'A2:J100000';
// Column letter (and 0-based index) of the soft-delete flag.
const DELETED_COL = 'J';
const DELETED_IDX = 9;

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

/** Warm up the GIS script ahead of time so the consent popup, when triggered
 * by a click, isn't blocked waiting on the script to load. */
export function preloadAuth(): void {
  void loadGis().catch(() => {});
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

/** Create the shared backup spreadsheet (with header row) and return its id. */
export async function createSpreadsheet(token: string): Promise<string> {
  const data = await api(token, 'https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: 'PracticApp · Respaldo' },
      sheets: [{ properties: { title: SHEET_TAB } }],
    }),
  });
  const spreadsheetId = data.spreadsheetId as string;
  // Header in row 1 so appends land at row 2+ and reads (A2:I) work.
  await api(
    token,
    `${valuesUrl(spreadsheetId)}!A1?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: [HEADER] }) },
  );
  return spreadsheetId;
}

function sessionToRow(s: Session, name: string): (string | number)[] {
  const inicio = new Date(s.startedAt).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return [
    name,
    s.date,
    inicio,
    Math.round(s.durationSec / 60),
    s.focus ?? '',
    s.notes ?? '',
    s.id,
    s.startedAt,
    s.durationSec,
    '', // Borrado: new rows are never deleted
  ];
}

/** Name stored in a sheet row (column A), trimmed. */
function rowName(row: string[]): string {
  return (row[0] ?? '').trim();
}

/** True when the soft-delete tombstone (column J) is set. */
function isDeleted(row: string[]): boolean {
  return (row[DELETED_IDX] ?? '').trim().toUpperCase() === 'TRUE';
}

/** True for rows that look like real session data (valid date in column B). */
function isDataRow(row: string[]): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test((row[1] ?? '').trim());
}

function rowToSession(row: string[]): Session | null {
  const date = (row[1] ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const durationSec =
    Number(row[8]) || Math.round((Number(row[3]) || 0) * 60);
  if (!durationSec || durationSec < 1) return null;
  const startedAt = Number(row[7]) || new Date(`${date}T12:00:00`).getTime();
  return {
    id: (row[6] ?? '').trim() || makeId(),
    date,
    startedAt,
    durationSec,
    focus: (row[4] ?? '').trim() || undefined,
    notes: (row[5] ?? '').trim() || undefined,
    synced: true,
  };
}

function valuesUrl(spreadsheetId: string): string {
  return `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_TAB}`;
}

/** ID column (G) value of a row, trimmed. */
function rowId(row: string[]): string {
  return (row[6] ?? '').trim();
}

/**
 * Make sure row 1 holds our header. A sheet may arrive empty; without a header
 * row, appends would land in row 1 and the data range (A2:J) would skip them.
 * No-ops when the header is already there.
 */
export async function ensureHeader(
  token: string,
  spreadsheetId: string,
): Promise<void> {
  const data = await api(token, `${valuesUrl(spreadsheetId)}!A1:J1`);
  const first: string[] = data.values?.[0] ?? [];
  if ((first[0] ?? '').trim() === HEADER[0]) return;
  await api(
    token,
    `${valuesUrl(spreadsheetId)}!A1?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: [HEADER] }) },
  );
}

/**
 * Append the given sessions as new rows owned by `name`. One write call, no
 * full-sheet rewrite — the sheet is used like an append-only table. Callers
 * must avoid re-appending sessions already present (see `fetchMyIds`).
 */
export async function appendRows(
  token: string,
  spreadsheetId: string,
  sessions: Session[],
  name: string,
): Promise<void> {
  if (sessions.length === 0) return;
  const me = name.trim();
  const values = [...sessions]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) => sessionToRow(s, me));
  await api(
    token,
    `${valuesUrl(spreadsheetId)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values }) },
  );
}

/** The set of session ids currently stored under `name` in the sheet. */
export async function fetchMyIds(
  token: string,
  spreadsheetId: string,
  name: string,
): Promise<Set<string>> {
  const me = name.trim();
  const data = await api(token, `${valuesUrl(spreadsheetId)}!${RANGE}`);
  const rows: string[][] = data.values ?? [];
  return new Set(
    rows.filter((r) => isDataRow(r) && rowName(r) === me).map(rowId).filter(Boolean),
  );
}

/**
 * Soft-delete: mark the rows owned by `name` whose id is in `ids` as deleted by
 * setting their tombstone cell (column J) to TRUE. We never remove rows, so
 * nothing is lost from the sheet by mistake. Reads once to find the rows, then
 * updates only those cells in a single values batchUpdate.
 */
export async function markDeleted(
  token: string,
  spreadsheetId: string,
  ids: string[],
  name: string,
): Promise<void> {
  const idSet = new Set(ids);
  if (idSet.size === 0) return;
  const me = name.trim();
  const data = await api(token, `${valuesUrl(spreadsheetId)}!${RANGE}`);
  const rows: string[][] = data.values ?? [];
  // RANGE starts at sheet row 2, so array index i → sheet row i + 2.
  const updates = rows.flatMap((r, i) =>
    rowName(r) === me && idSet.has(rowId(r)) && !isDeleted(r)
      ? [{ range: `${SHEET_TAB}!${DELETED_COL}${i + 2}`, values: [['TRUE']] }]
      : [],
  );
  if (updates.length === 0) return;
  await api(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: updates }) },
  );
}

/** Read back the live (not soft-deleted) sessions owned by `name`. */
export async function pullMine(
  token: string,
  spreadsheetId: string,
  name: string,
): Promise<Session[]> {
  const me = name.trim();
  const data = await api(token, `${valuesUrl(spreadsheetId)}!${RANGE}`);
  const rows: string[][] = data.values ?? [];
  return rows
    .filter((r) => rowName(r) === me && !isDeleted(r))
    .map(rowToSession)
    .filter((s): s is Session => s != null);
}
