import { Routes, Route, Navigate } from 'react-router-dom';
import CalendarScreen from './screens/CalendarScreen';
import DayScreen from './screens/DayScreen';
import TimerScreen from './screens/TimerScreen';
import AddSessionScreen from './screens/AddSessionScreen';
import NameGate from './screens/NameGate';
import { ReconnectBanner } from './components/ReconnectBanner';
import { PinSheetBanner } from './components/PinSheetBanner';
import { useSync } from './SyncContext';

export default function App() {
  const { hasName } = useSync();

  // Until a name is entered, the whole app is behind the name gate.
  if (!hasName) return <NameGate />;

  return (
    <div className="app-shell">
      <ReconnectBanner />
      <PinSheetBanner />
      <Routes>
        <Route path="/" element={<CalendarScreen />} />
        <Route path="/day/:dayKey" element={<DayScreen />} />
        <Route path="/timer/:dayKey" element={<TimerScreen />} />
        <Route path="/add/:dayKey" element={<AddSessionScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
