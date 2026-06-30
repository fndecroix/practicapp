import { Session } from './types';
import { makeId } from './id';

// The backup backend is a Google Apps Script web app (see apps-script/Code.gs)
// that runs as the sheet's owner. The app just POSTs name + data to it, so no
// Google login ever happens in the browser.

type WireSession = {
  id: string;
  date: string;
  startedAt: number;
  durationSec: number;
  focus?: string;
  notes?: string;
};

function toWire(s: Session): WireSession {
  return {
    id: s.id,
    date: s.date,
    startedAt: s.startedAt,
    durationSec: s.durationSec,
    focus: s.focus ?? '',
    notes: s.notes ?? '',
  };
}

function fromWire(w: WireSession): Session {
  return {
    id: String(w.id || '') || makeId(),
    date: String(w.date || ''),
    startedAt: Number(w.startedAt) || 0,
    durationSec: Number(w.durationSec) || 0,
    focus: (w.focus || '').trim() || undefined,
    notes: (w.notes || '').trim() || undefined,
    synced: true,
  };
}

/**
 * POST a JSON payload to the Apps Script web app. The body goes as a plain
 * string (default Content-Type text/plain), so the browser makes a "simple"
 * request with no CORS preflight — which Apps Script can't answer.
 */
async function call(endpoint: string, payload: unknown): Promise<any> {
  const res = await fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Backend HTTP ${res.status}`);
  const data = await res.json();
  if (data && data.error) throw new Error(String(data.error));
  return data;
}

/** Append new sessions for `name` (the backend skips ids already present). */
export async function appendSessions(
  endpoint: string,
  name: string,
  sessions: Session[],
): Promise<void> {
  if (sessions.length === 0) return;
  await call(endpoint, { action: 'append', name, sessions: sessions.map(toWire) });
}

/** Soft-delete sessions: mark them deleted in the sheet (rows are never removed). */
export async function deleteSessions(
  endpoint: string,
  name: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await call(endpoint, { action: 'delete', name, ids });
}

/** Read back the live sessions stored under `name`. */
export async function listSessions(
  endpoint: string,
  name: string,
): Promise<Session[]> {
  const data = await call(endpoint, { action: 'list', name });
  const sessions: WireSession[] = data.sessions ?? [];
  return sessions.map(fromWire);
}
