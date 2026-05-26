import React, { Suspense, lazy, useState, useEffect } from 'react'
import { Sidebar, type PageId } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { ChatbotWidget } from './components/ChatbotWidget'
import { Dashboard } from './pages/Dashboard'
import { MacroIndices } from './pages/MacroIndices'
import { Ports } from './pages/Ports'
import { Chokepoints } from './pages/Chokepoints'

const VesselMap = lazy(() => import('./pages/VesselMap').then(module => ({ default: module.VesselMap })))
const Analytics = lazy(() => import('./pages/Analytics').then(module => ({ default: module.Analytics })))

const PAGE_IDS: PageId[] = ['dashboard', 'indices', 'vessels', 'ports', 'chokepoints', 'analytics']

function pageFromHash(): PageId {
  const hash = window.location.hash.replace('#/', '').replace('#', '')
  if (hash === 'insights') return 'analytics'
  return PAGE_IDS.includes(hash as PageId) ? hash as PageId : 'dashboard'
}

export default function App() {
  const [page, setPage] = useState<PageId>(() => pageFromHash())
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 760)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const onHashChange = () => {
      const rawHash = window.location.hash.replace('#/', '').replace('#', '')
      if (rawHash === 'insights') {
        window.history.replaceState(null, '', '#/analytics')
      }
      setPage(pageFromHash())
    }
    window.addEventListener('hashchange', onHashChange)
    if (!window.location.hash) window.history.replaceState(null, '', '#/dashboard')
    if (window.location.hash.replace('#/', '').replace('#', '') === 'insights') {
      window.history.replaceState(null, '', '#/analytics')
    }
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 760) setSidebarOpen(false)
    }
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
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
          : page === 'chokepoints'
            ? Chokepoints
            : Analytics

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar active={page} open={sidebarOpen} onToggle={() => setSidebarOpen(s => !s)} onNavigate={navigate} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {showHeader && <Header theme={theme} onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} page={page} />}
        <Suspense fallback={<div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading view...</div>}>
          <PageComponent onNavigate={navigate} />
        </Suspense>
      </div>
      <ChatbotWidget page={page} />
    </div>
  )
}
