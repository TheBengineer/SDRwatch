import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import DashboardPage from './pages/DashboardPage'
import SignalDetailPage from './pages/SignalDetailPage'
import ChangesPage from './pages/ChangesPage'
import SignalsListPage from './pages/SignalsListPage'
import ControlPage from './pages/ControlPage'
import LivePage from './pages/LivePage'
import SpurMapPage from './pages/SpurMapPage'
import DebugPage from './pages/DebugPage'
import RecordingsPage from './pages/RecordingsPage'
import SpectrumPage from './pages/SpectrumPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/control" element={<ControlPage />} />
        <Route path="/signals" element={<SignalsListPage />} />
        <Route path="/signal/:id" element={<SignalDetailPage />} />
        <Route path="/changes" element={<ChangesPage />} />
        <Route path="/recordings" element={<RecordingsPage />} />
        <Route path="/spur-map" element={<SpurMapPage />} />
        <Route path="/live" element={<LivePage />} />
        <Route path="/spectrum" element={<SpectrumPage />} />
        <Route path="/debug" element={<DebugPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
