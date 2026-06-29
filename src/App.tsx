import { Routes, Route, Navigate } from 'react-router-dom';
import CalendarScreen from './screens/CalendarScreen';
import DayScreen from './screens/DayScreen';
import TimerScreen from './screens/TimerScreen';
import AddSessionScreen from './screens/AddSessionScreen';
import SyncScreen from './screens/SyncScreen';

export default function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<CalendarScreen />} />
        <Route path="/day/:dayKey" element={<DayScreen />} />
        <Route path="/timer/:dayKey" element={<TimerScreen />} />
        <Route path="/add/:dayKey" element={<AddSessionScreen />} />
        <Route path="/sync" element={<SyncScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
