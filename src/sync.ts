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
// 'Nombre' is the first column: it identifies whose session each row is, so
// many people can share one spreadsheet. Each person owns the rows with their
// own name.
const HEADER = [
  'Nombre', 'Fecha', 'Inicio', 'Minutos', 'Foco', 'Notas', 'ID', 'startedAt_ms', 'durationSec',
];
// Spreadsheet column span (A..I = 9 columns, matching HEADER).
const RANGE = 'A2:I100000';

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

/** Create the shared backup spreadsheet (with header row) and return its id. */
export async function createSpreadsheet(token: string): Promise<string> {
  const data = await api(token, 'https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: 'PracticApp · Respaldo compartido' },
      sheets: [{ properties: { title: SHEET_TAB } }],
    }),
  });
  const spreadsheetId = data.spreadsheetId as string;
  // Write the header into row 1 so appends land at row 2+ and reads (A2:I) work.
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
  ];
}

/** Name stored in a sheet row (column A), trimmed. */
function rowName(row: string[]): string {
  return (row[0] ?? '').trim();
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

/** Numeric id (gid) of the SHEET_TAB tab — needed to delete rows. */
export async function fetchSheetGid(
  token: string,
  spreadsheetId: string,
): Promise<number> {
  const data = await api(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
  );
  const sheets: { properties: { sheetId: number; title: string } }[] =
    data.sheets ?? [];
  const tab = sheets.find((s) => s.properties.title === SHEET_TAB);
  if (!tab) throw new Error(`No se encontró la pestaña "${SHEET_TAB}".`);
  return tab.properties.sheetId;
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
 * Delete the rows owned by `name` whose id is in `ids`. Reads the sheet to map
 * ids to absolute row positions, then removes them bottom-up in a single
 * batchUpdate (descending order keeps earlier indices valid as rows shift).
 */
export async function deleteRowsByIds(
  token: string,
  spreadsheetId: string,
  ids: string[],
  name: string,
  sheetGid: number,
): Promise<void> {
  const idSet = new Set(ids);
  if (idSet.size === 0) return;
  const me = name.trim();
  const data = await api(token, `${valuesUrl(spreadsheetId)}!${RANGE}`);
  const rows: string[][] = data.values ?? [];
  // RANGE starts at sheet row 2, so array index i → 0-based dimension i + 1.
  const targets: number[] = [];
  rows.forEach((r, i) => {
    if (rowName(r) === me && idSet.has(rowId(r))) targets.push(i + 1);
  });
  if (targets.length === 0) return;
  const requests = targets
    .sort((a, b) => b - a)
    .map((idx) => ({
      deleteDimension: {
        range: { sheetId: sheetGid, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 },
      },
    }));
  await api(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    { method: 'POST', body: JSON.stringify({ requests }) },
  );
}

/** Read back only the sessions owned by `name` from the shared sheet. */
export async function pullMine(
  token: string,
  spreadsheetId: string,
  name: string,
): Promise<Session[]> {
  const me = name.trim();
  const data = await api(token, `${valuesUrl(spreadsheetId)}!${RANGE}`);
  const rows: string[][] = data.values ?? [];
  return rows
    .filter((r) => rowName(r) === me)
    .map(rowToSession)
    .filter((s): s is Session => s != null);
}
