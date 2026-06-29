import { useState } from 'react';
import { useSync } from '../SyncContext';

/**
 * Small banner shown only when a background sync failed for lack of Google
 * access (e.g. the grant expired). Lets the user re-consent with one tap — the
 * only interactive-auth entry point now that there's no backup screen.
 */
export function ReconnectBanner() {
  const sync = useSync();
  const [busy, setBusy] = useState(false);

  if (!sync.needsAuth) return null;

  const reconnect = async () => {
    setBusy(true);
    try {
      await sync.connect();
    } catch {
      /* stays visible so the user can try again */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="reconnect-banner">
      <span>Reconectá con Google para guardar tu práctica.</span>
      <button className="btn btn-ghost" onClick={reconnect} disabled={busy}>
        {busy ? 'Conectando…' : 'Conectar'}
      </button>
    </div>
  );
}
