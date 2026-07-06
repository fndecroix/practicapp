import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessions } from '../SessionsContext';
import { formatClock, formatDuration, toDayKey } from '../format';
import { MonthCalendar } from '../components/MonthCalendar';
import { GoalRing } from '../components/GoalRing';
import { LevelBar } from '../components/Level';
import { computeStreak, dailyProgress, loadGoals, minutesByDay } from '../gamification';
import { activeElapsedSec, loadActiveTimer } from '../activeTimer';

export default function CalendarScreen() {
  const navigate = useNavigate();
  const { totals, sessions } = useSessions();

  // Surface an in-progress practice session so you can jump back into it.
  const active = loadActiveTimer();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active?.startedAt]);

  const goals = loadGoals();
  const streak = computeStreak(sessions, goals);
  const progress = dailyProgress(sessions, goals);
  const minsByDay = minutesByDay(sessions);

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
        <button
          className="back-btn"
          style={{ marginLeft: 'auto' }}
          onClick={() => navigate('/logros')}
          aria-label="Logros"
          title="Logros"
        >
          🏆
        </button>
      </div>

      {active && (
        <button
          className="resume-banner"
          onClick={() => navigate(`/timer/${active.dayKey}`)}
        >
          <span className="resume-dot" data-running={active.runningSince != null} />
          <span className="resume-text">
            {active.runningSince != null ? 'Sesión en curso' : 'Sesión en pausa'}
          </span>
          <span className="resume-clock">{formatClock(activeElapsedSec(active))}</span>
          <span className="resume-go">Seguir ›</span>
        </button>
      )}

      <div className="hero">
        <GoalRing
          ratio={progress.ratio}
          label={`${Math.round(progress.minutes)}m`}
          sub={`/ ${progress.goal}m`}
        />
        <div className="hero-streak">
          <div className="streak-num">🔥 {streak.current}</div>
          <div className="streak-label">
            {streak.current === 1 ? 'día' : 'días'} de racha
            {streak.longest > streak.current ? ` · récord ${streak.longest}` : ''}
          </div>
          {streak.atRisk ? (
            <div className="streak-hint risk">¡Practicá hoy para no perder la racha!</div>
          ) : streak.todayDone ? (
            <div className="streak-hint ok">¡Hoy cumplido! 🎉</div>
          ) : (
            <div className="streak-hint">Empezá tu racha hoy.</div>
          )}
        </div>
      </div>

      <LevelBar sessions={sessions} onClick={() => navigate('/logros')} />

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
        minutesByDay={minsByDay}
        thresholdMin={goals.thresholdMin}
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
