import { Routes, Route, Navigate } from 'react-router-dom';
import CalendarScreen from './screens/CalendarScreen';
import DayScreen from './screens/DayScreen';
import TimerScreen from './screens/TimerScreen';
import AddSessionScreen from './screens/AddSessionScreen';
import AchievementsScreen from './screens/AchievementsScreen';
import NameGate from './screens/NameGate';
import { useSync } from './SyncContext';

export default function App() {
  const { hasName } = useSync();

  // Until a name is entered, the whole app is behind the name gate.
  if (!hasName) return <NameGate />;

  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<CalendarScreen />} />
        <Route path="/day/:dayKey" element={<DayScreen />} />
        <Route path="/timer/:dayKey" element={<TimerScreen />} />
        <Route path="/add/:dayKey" element={<AddSessionScreen />} />
        <Route path="/logros" element={<AchievementsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
