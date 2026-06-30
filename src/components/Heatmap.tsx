import { Session } from '../types';
import { heatmap } from '../gamification';

/** GitHub-style contribution grid: a square per day, darker = more minutes. */
export function Heatmap({ sessions, weeks = 16 }: { sessions: Session[]; weeks?: number }) {
  const cols = heatmap(sessions, weeks);

  return (
    <div className="heatmap">
      {cols.map((col, i) => (
        <div className="heat-col" key={i}>
          {col.map((cell) => (
            <div
              key={cell.key}
              className={`heat-cell lvl${cell.level}${cell.future ? ' future' : ''}`}
              title={`${cell.key}: ${Math.round(cell.minutes)} min`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
