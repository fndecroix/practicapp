import { useState } from 'react';
import { useSync } from '../SyncContext';

/**
 * First-run gate: ask for the person's name (not a real login — there's no
 * password). On submit it also gets Google consent and pulls existing history,
 * then the app unlocks. The name is remembered, so this shows only once.
 */
export default function NameGate() {
  const sync = useSync();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await sync.signIn(name);
    } finally {
      // On success the gate unmounts; on failure we land in the app and the
      // reconnect banner offers to retry Google. Either way, stop the spinner.
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <div className="gate-emoji">🎻</div>
        <h1>PracticApp</h1>
        <p className="muted">¿Cómo te llamás? Lo usamos para guardar tu práctica.</p>
        <input
          className="input"
          placeholder="Tu nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          enterKeyHint="go"
        />
        <button className="btn btn-primary" type="submit" disabled={!name.trim() || busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
