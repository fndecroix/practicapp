/** Date / time helpers used across screens. */

/** Local YYYY-MM-DD for a given Date (defaults to now). */
export function toDayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD key into a local Date at midnight. */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "1h 05m" / "12m" / "45s" — compact human duration from seconds. */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}

/** "01:23:45" / "23:45" — stopwatch style for the live timer. */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Long, localized day label, e.g. "domingo, 28 de junio". */
export function formatDayLabel(key: string): string {
  return fromDayKey(key).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** "hace 5 min" / "hace 3 días" / "recién" from an epoch ms (or "nunca"). */
export function timeAgo(ts: number | null): string {
  if (!ts) return 'nunca';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 45) return 'recién';
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ayer';
  if (d < 30) return `hace ${d} días`;
  const mo = Math.floor(d / 30);
  return `hace ${mo} ${mo === 1 ? 'mes' : 'meses'}`;
}

/** Monday-based start of the week containing `d`, as a day key. */
export function startOfWeekKey(d: Date = new Date()): string {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (date.getDay() + 6) % 7; // 0 = Monday
  date.setDate(date.getDate() - dow);
  return toDayKey(date);
}
