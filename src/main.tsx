import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { Layout, useBrandColors } from './components/Layout'
import { Toaster } from './components/feedback'
import Dashboard from './pages/Dashboard'
import Leads from './pages/Leads'
import Join from './pages/Join'
import Players from './pages/Players'
import Teams from './pages/Teams'
import Schedule from './pages/Schedule'
import Payments from './pages/Payments'
import Messages from './pages/Messages'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

function App() {
  useBrandColors()
  return (
    <>
      <Routes>
        <Route path="/join" element={<Join />} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="leads" element={<Leads />} />
          <Route path="players" element={<Players />} />
          <Route path="teams" element={<Teams />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="payments" element={<Payments />} />
          <Route path="messages" element={<Messages />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
