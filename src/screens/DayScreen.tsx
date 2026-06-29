import { useParams, useNavigate } from 'react-router-dom';
import { useSessions } from '../SessionsContext';
import { formatDayLabel, formatDuration, toDayKey } from '../format';

export default function DayScreen() {
  const { dayKey = toDayKey() } = useParams();
  const navigate = useNavigate();
  const { sessionsByDay, totalForDay, deleteSession } = useSessions();

  const daySessions = sessionsByDay(dayKey);
  const total = totalForDay(dayKey);
  const todayKey = toDayKey();
  const isToday = dayKey === todayKey;
  const isFuture = dayKey > todayKey;

  const onDelete = (id: string) => {
    if (confirm('¿Borrar esta sesión?')) deleteSession(id);
  };

  return (
    <div className="screen">
      <div className="topbar">
        <button className="back-btn" onClick={() => navigate('/')}>
          ‹
        </button>
        <h1 className="cap-first">{formatDayLabel(dayKey)}</h1>
      </div>

      <div className="day-total card">
        <div className="stat-label">Total del día</div>
        <div className="day-total-value">{formatDuration(total)}</div>
        <div className="stat-label">
          {daySessions.length} {daySessions.length === 1 ? 'sesión' : 'sesiones'}
        </div>
      </div>

      <div className="session-list">
        {daySessions.length === 0 && (
          <p className="cal-hint">Todavía no hay sesiones este día.</p>
        )}
        {daySessions.map((s) => (
          <div key={s.id} className="session-card">
            <div className="session-row">
              <span className="session-duration">
                {formatDuration(s.durationSec)}
              </span>
              <button
                className="session-del"
                onClick={() => onDelete(s.id)}
                aria-label="Borrar sesión"
              >
                ✕
              </button>
            </div>
            {s.focus && <div className="session-focus">{s.focus}</div>}
            {s.notes && <div className="session-notes">{s.notes}</div>}
          </div>
        ))}
      </div>

      <div className="bottom-bar" style={{ display: 'grid', gap: 10 }}>
        {isToday && (
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/timer/${dayKey}`)}
          >
            ▶ Practicar ahora
          </button>
        )}
        {!isFuture && (
          <button
            className="btn btn-ghost"
            onClick={() => navigate(`/add/${dayKey}`)}
          >
            ＋ Cargar sesión manual
          </button>
        )}
        {isFuture && (
          <p className="cal-hint">No se pueden cargar sesiones en días futuros.</p>
        )}
      </div>
    </div>
  );
}
