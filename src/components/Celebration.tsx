import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSessions } from '../SessionsContext';
import { Session } from '../types';
import {
  achievements,
  computeStreak,
  dailyProgress,
  loadGoals,
  loadSeenBadges,
  saveSeenBadges,
} from '../gamification';

type CelebrationValue = { celebrate: (session: Session) => void };

const CelebrationContext = createContext<CelebrationValue | null>(null);

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const celebrate = useCallback((s: Session) => setSession(s), []);
  const value = useMemo(() => ({ celebrate }), [celebrate]);

  return (
    <CelebrationContext.Provider value={value}>
      {children}
      {session && (
        <CelebrationModal session={session} onClose={() => setSession(null)} />
      )}
    </CelebrationContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCelebration(): CelebrationValue {
  const ctx = useContext(CelebrationContext);
  if (!ctx) throw new Error('useCelebration must be used within CelebrationProvider');
  return ctx;
}

const CONFETTI = ['#a78bfa', '#f0a35e', '#5ed6a0', '#f26d6d', '#7c5cfc'];

function CelebrationModal({
  session,
  onClose,
}: {
  session: Session;
  onClose: () => void;
}) {
  const { sessions } = useSessions();
  const goals = loadGoals();

  // Computed from the post-save sessions (this session is already included).
  const streak = computeStreak(sessions, goals);
  const progress = dailyProgress(sessions, goals, session.date);
  const earnedNow = achievements(sessions, goals).filter((a) => a.earned);

  // New badges = earned now but not seen before. Mark all as seen on mount.
  const seen = new Set(loadSeenBadges());
  const fresh = earnedNow.filter((a) => !seen.has(a.id));
  useEffect(() => {
    saveSeenBadges(earnedNow.map((a) => a.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const minutes = Math.round(session.durationSec / 60);

  return (
    <div className="celebrate-overlay" onClick={onClose}>
      <div className="confetti" aria-hidden>
        {Array.from({ length: 28 }).map((_, i) => (
          <span
            key={i}
            style={{
              left: `${Math.random() * 100}%`,
              background: CONFETTI[i % CONFETTI.length],
              animationDelay: `${Math.random() * 0.5}s`,
              animationDuration: `${1.6 + Math.random() * 1.2}s`,
            }}
          />
        ))}
      </div>

      <div className="celebrate-card" onClick={(e) => e.stopPropagation()}>
        <div className="celebrate-emoji">🎉</div>
        <h2>¡Buena práctica!</h2>
        <p className="celebrate-mins">+{minutes} min</p>

        <div className="celebrate-row">
          <span>🔥 Racha</span>
          <strong>
            {streak.current} {streak.current === 1 ? 'día' : 'días'}
          </strong>
        </div>
        <div className="celebrate-row">
          <span>Meta de hoy</span>
          <strong>
            {progress.ratio >= 1
              ? '¡cumplida! ✅'
              : `${Math.round(progress.minutes)} / ${progress.goal} min`}
          </strong>
        </div>

        {fresh.length > 0 && (
          <div className="celebrate-badges">
            <div className="celebrate-badges-title">¡Nuevo logro!</div>
            {fresh.map((a) => (
              <div className="celebrate-badge" key={a.id}>
                <span className="celebrate-badge-emoji">{a.emoji}</span>
                <div>
                  <strong>{a.title}</strong>
                  <div className="muted">{a.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button className="btn btn-primary" onClick={onClose}>
          Seguir
        </button>
      </div>
    </div>
  );
}
