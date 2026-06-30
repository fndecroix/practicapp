import { Session } from '../types';
import { LEVELS, levelInfo } from '../gamification';

/** Compact level bar for the home (tap to open Logros). */
export function LevelBar({
  sessions,
  onClick,
}: {
  sessions: Session[];
  onClick: () => void;
}) {
  const { current, next, ratio, hours } = levelInfo(sessions);

  return (
    <button className="level-bar" onClick={onClick}>
      <span className="level-emblem" style={{ background: current.color }}>
        {current.emoji}
      </span>
      <div className="level-bar-mid">
        <div className="level-name" style={{ color: current.color }}>
          Nivel {current.name}
        </div>
        <div className="level-track">
          <div
            className="level-fill"
            style={{ width: `${ratio * 100}%`, background: current.color }}
          />
        </div>
      </div>
      <div className="level-next">
        {next ? `${Math.max(0, next.minHours - hours).toFixed(1)}h → ${next.name}` : 'Máximo 👑'}
      </div>
    </button>
  );
}

/** Full level card with the ladder, for the Logros screen. */
export function LevelCard({ sessions }: { sessions: Session[] }) {
  const { index, current, next, ratio, hours } = levelInfo(sessions);

  return (
    <div className="level-card">
      <div className="level-emblem big" style={{ background: current.color }}>
        {current.emoji}
      </div>
      <div className="level-card-name" style={{ color: current.color }}>
        Nivel {current.name}
      </div>
      <div className="muted">{hours.toFixed(1)} h practicadas</div>

      {next ? (
        <>
          <div className="level-track" style={{ marginTop: 12 }}>
            <div
              className="level-fill"
              style={{ width: `${ratio * 100}%`, background: current.color }}
            />
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Faltan {(next.minHours - hours).toFixed(1)} h para {next.name}
          </div>
        </>
      ) : (
        <div className="muted" style={{ marginTop: 10 }}>¡Nivel máximo alcanzado! 👑</div>
      )}

      <div className="level-ladder">
        {LEVELS.map((lv, i) => (
          <div
            key={lv.name}
            className={`ladder-item${i === index ? ' current' : ''}${i <= index ? ' reached' : ''}`}
            title={`${lv.name} · ${lv.minHours}h`}
          >
            <span className="ladder-dot" style={{ background: i <= index ? lv.color : undefined }}>
              {lv.emoji}
            </span>
            <span className="ladder-name">{lv.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
