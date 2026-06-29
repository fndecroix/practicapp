import { toDayKey } from '../format';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

type Props = {
  year: number;
  month: number; // 0-11
  daysWithSessions: Set<string>;
  onPrev: () => void;
  onNext: () => void;
  onSelectDay: (dayKey: string) => void;
};

export function MonthCalendar({
  year,
  month,
  daysWithSessions,
  onPrev,
  onNext,
  onSelectDay,
}: Props) {
  const todayKey = toDayKey();

  // Number of leading blanks: weekday of the 1st, Monday-based.
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="card calendar">
      <div className="cal-header">
        <button className="cal-nav" onClick={onPrev} aria-label="Mes anterior">
          ‹
        </button>
        <span className="cal-title">
          {MONTHS[month]} {year}
        </span>
        <button className="cal-nav" onClick={onNext} aria-label="Mes siguiente">
          ›
        </button>
      </div>

      <div className="cal-grid cal-weekdays">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday">
            {w}
          </div>
        ))}
      </div>

      <div className="cal-grid">
        {cells.map((day, i) => {
          if (day == null) return <div key={`b${i}`} className="cal-cell empty" />;
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(
            day,
          ).padStart(2, '0')}`;
          const isToday = key === todayKey;
          const has = daysWithSessions.has(key);
          return (
            <button
              key={key}
              className={`cal-cell${isToday ? ' today' : ''}`}
              onClick={() => onSelectDay(key)}
            >
              <span className="cal-num">{day}</span>
              <span className={`cal-dot${has ? ' on' : ''}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
