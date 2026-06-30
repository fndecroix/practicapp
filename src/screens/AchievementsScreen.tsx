import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessions } from '../SessionsContext';
import { LevelCard } from '../components/Level';
import {
  achievements,
  computeStreak,
  levelInfo,
  loadGoals,
  saveGoals,
  saveSeenBadges,
  saveSeenLevel,
} from '../gamification';

export default function AchievementsScreen() {
  const navigate = useNavigate();
  const { sessions } = useSessions();
  const [goals, setGoals] = useState(loadGoals);

  const streak = computeStreak(sessions, goals);
  const badges = achievements(sessions, goals);
  const earned = badges.filter((b) => b.earned).length;

  // Opening this screen clears the "new badge" and "level up" state.
  useEffect(() => {
    saveSeenBadges(badges.filter((b) => b.earned).map((b) => b.id));
    saveSeenLevel(levelInfo(sessions).index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDailyGoal = (v: number) => {
    const next = { ...goals, dailyGoalMin: Math.max(5, Math.min(600, v)) };
    setGoals(next);
    saveGoals(next);
  };

  return (
    <div className="screen">
      <div className="topbar">
        <button className="back-btn" onClick={() => navigate('/')}>
          ‹
        </button>
        <h1>Logros</h1>
      </div>

      <LevelCard sessions={sessions} />

      <div className="stats" style={{ marginTop: 16 }}>
        <div className="stat-card">
          <div className="stat-value">🔥 {streak.current}</div>
          <div className="stat-label">Racha actual</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{streak.longest}</div>
          <div className="stat-label">Récord</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {earned}/{badges.length}
          </div>
          <div className="stat-label">Insignias</div>
        </div>
      </div>

      <label className="field-label">Meta diaria (minutos)</label>
      <div className="goal-setter">
        <button className="quick-chip" onClick={() => setDailyGoal(goals.dailyGoalMin - 5)}>
          −
        </button>
        <span className="goal-value">{goals.dailyGoalMin} min</span>
        <button className="quick-chip" onClick={() => setDailyGoal(goals.dailyGoalMin + 5)}>
          +
        </button>
      </div>

      <div className="badge-grid">
        {badges.map((b) => (
          <div key={b.id} className={`badge ${b.earned ? 'earned' : 'locked'}`}>
            <div className="badge-emoji">{b.emoji}</div>
            <div className="badge-title">{b.title}</div>
            <div className="badge-desc">{b.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
