import { useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useSessions } from '../SessionsContext';
import { formatDayLabel } from '../format';

const QUICK_MINUTES = [15, 30, 45, 60, 90];

export default function EditSessionScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { sessions, editSession } = useSessions();

  const session = sessions.find((s) => s.id === id);

  const [hours, setHours] = useState(() =>
    session ? String(Math.floor(session.durationSec / 3600)) : '0',
  );
  const [minutes, setMinutes] = useState(() =>
    session ? String(Math.floor((session.durationSec % 3600) / 60)) : '0',
  );
  const [focus, setFocus] = useState(session?.focus ?? '');
  const [notes, setNotes] = useState(session?.notes ?? '');

  // Session gone (deleted elsewhere, or bad link) → back to the calendar.
  if (!session) return <Navigate to="/" replace />;

  const dayKey = session.date;

  const applyQuick = (m: number) => {
    setHours(String(Math.floor(m / 60)));
    setMinutes(String(m % 60));
  };

  const save = () => {
    const h = parseInt(hours, 10) || 0;
    const m = parseInt(minutes, 10) || 0;
    const durationSec = h * 3600 + m * 60;
    if (durationSec < 60) {
      alert('La sesión debe durar al menos 1 minuto.');
      return;
    }
    editSession(id, {
      durationSec,
      focus: focus.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    navigate(`/day/${dayKey}`);
  };

  return (
    <div className="screen">
      <div className="topbar">
        <button className="back-btn" onClick={() => navigate(`/day/${dayKey}`)}>
          ‹
        </button>
        <h1>Editar sesión</h1>
      </div>

      <p className="muted cap-first" style={{ marginTop: 0 }}>
        {formatDayLabel(dayKey)}
      </p>

      <label className="field-label">Duración</label>
      <div className="duration-row">
        <div className="duration-field">
          <input
            className="duration-input"
            type="number"
            inputMode="numeric"
            min={0}
            max={23}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
          <span className="duration-unit">h</span>
        </div>
        <div className="duration-field">
          <input
            className="duration-input"
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
          <span className="duration-unit">min</span>
        </div>
      </div>

      <div className="quick-row">
        {QUICK_MINUTES.map((m) => (
          <button key={m} className="quick-chip" onClick={() => applyQuick(m)}>
            {m >= 60 ? `${m / 60}h` : `${m}m`}
          </button>
        ))}
      </div>

      <label className="field-label">Foco (opcional)</label>
      <input
        className="input"
        placeholder="Escalas, repertorio, estudios…"
        value={focus}
        onChange={(e) => setFocus(e.target.value)}
      />

      <label className="field-label">Notas (opcional)</label>
      <textarea
        className="input"
        placeholder="Qué trabajaste, cómo te fue…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <button
        className="btn btn-primary"
        style={{ marginTop: 28 }}
        onClick={save}
      >
        Guardar cambios
      </button>
    </div>
  );
}
