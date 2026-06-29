import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessions } from '../SessionsContext';
import { formatDuration, toDayKey } from '../format';
import { MonthCalendar } from '../components/MonthCalendar';

export default function CalendarScreen() {
  const navigate = useNavigate();
  const { totals, daysWithSessions } = useSessions();

  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });

  const prev = () =>
    setView((v) =>
      v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 },
    );
  const next = () =>
    setView((v) =>
      v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 },
    );

  return (
    <div className="screen">
      <div className="topbar">
        <h1>🎻 Mi práctica</h1>
      </div>

      <div className="stats">
        <div className="stat-card">
          <div className="stat-value">{formatDuration(totals.today)}</div>
          <div className="stat-label">Hoy</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatDuration(totals.week)}</div>
          <div className="stat-label">Esta semana</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatDuration(totals.all)}</div>
          <div className="stat-label">Total</div>
        </div>
      </div>

      <MonthCalendar
        year={view.year}
        month={view.month}
        daysWithSessions={daysWithSessions}
        onPrev={prev}
        onNext={next}
        onSelectDay={(dayKey) => navigate(`/day/${dayKey}`)}
      />

      <p className="cal-hint">Tocá un día para ver o cargar sesiones.</p>

      <div className="bottom-bar">
        <button
          className="btn btn-primary"
          onClick={() => navigate(`/timer/${toDayKey()}`)}
        >
          ▶ Practicar ahora
        </button>
      </div>
    </div>
  );
}
