import { toDayKey } from '../format';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

type Props = {
  year: number;
  month: number; // 0-11
  /** Practiced minutes per YYYY-MM-DD. */
  minutesByDay: Map<string, number>;
  /** Minutes that make a day "hot" (highlighted + connectable). */
  thresholdMin: number;
  onPrev: () => void;
  onNext: () => void;
  onSelectDay: (dayKey: string) => void;
};

/** Compact duration for the day orb: "45m", "1h", "1h30". */
function shortDur(min: number): string {
  const m = Math.round(min);
  if (m <= 0) return '';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h${String(mm).padStart(2, '0')}` : `${h}h`;
}

export function MonthCalendar({
  year,
  month,
  minutesByDay,
  thresholdMin,
  onPrev,
  onNext,
  onSelectDay,
}: Props) {
  const todayKey = toDayKey();

  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-based
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const keyFor = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const minsFor = (day: number | null) =>
    day == null ? 0 : minutesByDay.get(keyFor(day)) ?? 0;
  const hot = (day: number | null) => day != null && minsFor(day) >= thresholdMin;

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

      <div className="cal-weekdays">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday">
            {w}
          </div>
        ))}
      </div>

      <div className="cal-days">
        {cells.map((day, i) => {
          if (day == null) return <div key={`b${i}`} className="cal-cell2 empty" />;
          const key = keyFor(day);
          const min = minsFor(day);
          const isToday = key === todayKey;
          const isHot = hot(day);
          // Connect to the next day when both are hot and in the same week row.
          const linkRight = isHot && i % 7 < 6 && hot(cells[i + 1] ?? null);
          return (
            <button
              key={key}
              className={`cal-cell2${isToday ? ' today' : ''}`}
              onClick={() => onSelectDay(key)}
            >
              <span className="cal-date2">{day}</span>
              <span className="cal-orb-row">
                {linkRight && <span className="cal-link" />}
                <span className={`cal-orb${min > 0 ? ' has' : ''}${isHot ? ' hot' : ''}`}>
                  {shortDur(min)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
