import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSessions } from '../SessionsContext';
import { useCelebration } from '../components/Celebration';
import { formatClock, toDayKey } from '../format';
import {
  clearActiveTimer,
  loadActiveTimer,
  saveActiveTimer,
} from '../activeTimer';

export default function TimerScreen() {
  const { dayKey = toDayKey() } = useParams();
  const navigate = useNavigate();
  const { addSession } = useSessions();
  const { celebrate } = useCelebration();

  // Restore an in-progress session for this day if one was persisted (left the
  // screen, reloaded the page…). The clock keeps ticking from where it was.
  const [restored] = useState(() => {
    const t = loadActiveTimer();
    return t && t.dayKey === dayKey ? t : null;
  });

  const [accumulated, setAccumulated] = useState(restored?.accumulatedSec ?? 0); // whole+frac seconds banked
  const [runningSince, setRunningSince] = useState<number | null>(
    restored?.runningSince ?? null,
  );
  const [, setTick] = useState(0);
  const startedAtRef = useRef<number | null>(restored?.startedAt ?? null);

  const [focus, setFocus] = useState(restored?.focus ?? '');
  const [notes, setNotes] = useState(restored?.notes ?? '');

  useEffect(() => {
    if (runningSince == null) return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [runningSince]);

  // Persist the live session so it survives leaving the screen or reloading.
  // Only once it has actually started (startedAt set); reset/save/discard clear it.
  useEffect(() => {
    if (startedAtRef.current == null) return;
    saveActiveTimer({
      dayKey,
      startedAt: startedAtRef.current,
      accumulatedSec: accumulated,
      runningSince,
      focus,
      notes,
    });
  }, [dayKey, accumulated, runningSince, focus, notes]);

  const elapsed =
    accumulated + (runningSince != null ? (Date.now() - runningSince) / 1000 : 0);

  const start = () => {
    if (startedAtRef.current == null) startedAtRef.current = Date.now();
    setRunningSince(Date.now());
  };

  const pause = () => {
    if (runningSince != null) {
      setAccumulated((a) => a + (Date.now() - runningSince) / 1000);
      setRunningSince(null);
    }
  };

  const reset = () => {
    setAccumulated(0);
    setRunningSince(null);
    startedAtRef.current = null;
    setFocus('');
    setNotes('');
    clearActiveTimer();
  };

  const save = () => {
    const durationSec = Math.round(elapsed);
    if (durationSec < 1) {
      alert('Iniciá el timer antes de guardar.');
      return;
    }
    const saved = addSession({
      date: dayKey,
      startedAt: startedAtRef.current ?? Date.now(),
      durationSec,
      focus: focus.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    startedAtRef.current = null;
    clearActiveTimer();
    navigate(`/day/${dayKey}`);
    celebrate(saved);
  };

  const discard = () => {
    if (elapsed < 1 || confirm('¿Descartar esta sesión sin guardar?')) {
      startedAtRef.current = null;
      clearActiveTimer();
      navigate(-1);
    }
  };

  const running = runningSince != null;
  const isToday = dayKey === toDayKey();

  return (
    <div className="screen">
      <div className="topbar">
        <button className="back-btn" onClick={discard}>
          ‹
        </button>
        <h1>En vivo</h1>
      </div>

      {!isToday && (
        <p className="cal-hint" style={{ color: 'var(--accent)', marginTop: 0 }}>
          Registrando sobre otro día ({dayKey}).
        </p>
      )}

      <div className="clock-wrap">
        <div className="clock">{formatClock(elapsed)}</div>
        <div className="clock-label">
          {running ? 'Practicando…' : elapsed > 0 ? 'En pausa' : 'Listo para empezar'}
        </div>
      </div>

      <div className="timer-controls">
        {!running ? (
          <button className="timer-circle go" onClick={start}>
            {elapsed > 0 ? 'Seguir' : 'Empezar'}
          </button>
        ) : (
          <button className="timer-circle pause" onClick={pause}>
            Pausa
          </button>
        )}
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

      <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
        <button className="btn btn-success" onClick={save}>
          Guardar sesión
        </button>
        <div className="action-row">
          <button className="btn btn-ghost" onClick={reset}>
            Reiniciar
          </button>
          <button className="btn btn-ghost" onClick={discard}>
            Descartar
          </button>
        </div>
      </div>
    </div>
  );
}
