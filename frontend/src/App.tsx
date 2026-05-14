import React, { useState, useEffect } from 'react'
import { Sidebar, type PageId } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { Dashboard } from './pages/Dashboard'
import { MacroIndices } from './pages/MacroIndices'
import { VesselMap } from './pages/VesselMap'
import { Ports } from './pages/Ports'
import { InsightsHub } from './pages/InsightsHub'

export default function App() {
  const [page, setPage] = useState<PageId>('dashboard')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const showHeader = page !== 'vessels'

  const PageComponent = {
    dashboard: Dashboard,
    indices: MacroIndices,
    vessels: VesselMap,
    ports: Ports,
    insights: InsightsHub,
  }[page]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar active={page} open={sidebarOpen} onToggle={() => setSidebarOpen(s => !s)} onNavigate={setPage} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {showHeader && <Header theme={theme} onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} page={page} />}
        <PageComponent />
      </div>
    </div>
  )
}
