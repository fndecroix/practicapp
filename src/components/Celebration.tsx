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
  levelInfo,
  loadGoals,
  loadSeenBadges,
  loadSeenLevel,
  saveSeenBadges,
  saveSeenLevel,
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

const DOGS = ['🐶', '🐕', '🐩', '🐾', '🦴', '🦮'];

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

  // Level up = current level index higher than last seen.
  const level = levelInfo(sessions);
  const leveledUp = level.index > loadSeenLevel();

  useEffect(() => {
    saveSeenBadges(earnedNow.map((a) => a.id));
    saveSeenLevel(level.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const minutes = Math.round(session.durationSec / 60);

  return (
    <div className="celebrate-overlay" onClick={onClose}>
      <div className="confetti" aria-hidden>
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            style={{
              left: `${Math.random() * 100}%`,
              fontSize: `${18 + Math.random() * 16}px`,
              animationDelay: `${Math.random() * 0.6}s`,
              animationDuration: `${1.8 + Math.random() * 1.4}s`,
            }}
          >
            {DOGS[i % DOGS.length]}
          </span>
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

        {leveledUp && (
          <div className="celebrate-levelup" style={{ borderColor: level.current.color }}>
            <span className="levelup-emblem" style={{ background: level.current.color }}>
              {level.current.emoji}
            </span>
            <div>
              <div className="levelup-title" style={{ color: level.current.color }}>
                ¡Subiste de nivel!
              </div>
              <strong>Nivel {level.current.name}</strong>
            </div>
          </div>
        )}

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
