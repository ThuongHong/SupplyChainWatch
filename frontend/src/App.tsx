import React, { Suspense, lazy, useState, useEffect } from 'react'
import { Sidebar, type PageId } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { Dashboard } from './pages/Dashboard'
import { MacroIndices } from './pages/MacroIndices'
import { Ports } from './pages/Ports'
import { InsightsHub } from './pages/InsightsHub'
import { Analytics } from './pages/Analytics'

const VesselMap = lazy(() => import('./pages/VesselMap').then(module => ({ default: module.VesselMap })))

const PAGE_IDS: PageId[] = ['dashboard', 'indices', 'vessels', 'ports', 'insights', 'analytics']

function pageFromHash(): PageId {
  const hash = window.location.hash.replace('#/', '').replace('#', '')
  return PAGE_IDS.includes(hash as PageId) ? hash as PageId : 'dashboard'
}

export default function App() {
  const [page, setPage] = useState<PageId>(() => pageFromHash())
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHashChange)
    if (!window.location.hash) window.history.replaceState(null, '', '#/dashboard')
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = (next: PageId) => {
    if (next === page) return
    window.location.hash = `/${next}`
  }

  const showHeader = page !== 'vessels'

  const PageComponent = page === 'dashboard'
    ? Dashboard
    : page === 'indices'
      ? MacroIndices
      : page === 'vessels'
        ? VesselMap
        : page === 'ports'
          ? Ports
          : page === 'analytics'
            ? Analytics
            : InsightsHub

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar active={page} open={sidebarOpen} onToggle={() => setSidebarOpen(s => !s)} onNavigate={navigate} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {showHeader && <Header theme={theme} onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} page={page} />}
        <Suspense fallback={<div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading view...</div>}>
          <PageComponent onNavigate={navigate} />
        </Suspense>
      </div>
    </div>
  )
}
