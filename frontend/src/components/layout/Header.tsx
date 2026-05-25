import React, { useState } from 'react'
import { useQuery, useIsFetching, useQueryClient } from '@tanstack/react-query'
import { apiClient, API_BASE_URL } from '../../api/client'
import { queryKeys } from '../../api/queries'
import { Icons } from '../icons'
import { StatusDot } from '../StatusDot'
import type { PageId } from './Sidebar'

const PAGE_META: Record<PageId, { parent: string; title: string }> = {
  dashboard: { parent: 'Macro Trends', title: 'Executive Overview' },
  indices: { parent: 'Macro Trends', title: 'Freight & Indices' },
  vessels: { parent: 'Micro Causes', title: 'Live Vessel Map' },
  ports: { parent: 'Micro Causes', title: 'Port Congestion' },
  analytics: { parent: 'Intelligence', title: 'Exploratory Analysis' },
}

interface HeaderProps {
  theme: 'dark' | 'light'
  onThemeToggle: () => void
  page: PageId
}

export const Header: React.FC<HeaderProps> = ({ theme, onThemeToggle, page }) => {
  const queryClient = useQueryClient()
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  const health = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => apiClient.health({ signal }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const fetching = useIsFetching()
  const status = health.isError ? 'danger' : health.isLoading ? 'warning' : 'success'
  const statusLabel = health.isError ? 'API offline' : fetching > 0 ? 'Refreshing' : 'API live'

  const handleForceSync = async () => {
    if (isSyncing) return
    setIsSyncing(true)
    setSyncStatus('Queued...')
    try {
      await apiClient.forceSync()
      setSyncStatus('Syncing...')
      setTimeout(() => {
        queryClient.invalidateQueries()
        setIsSyncing(false)
        setSyncStatus(null)
      }, 4000)
    } catch (err) {
      console.error(err)
      setIsSyncing(false)
      setSyncStatus(null)
    }
  }

  return (
    <header className="app-header">
      <div className="app-header__crumbs" style={{ fontSize: 13 }}>
        <span style={{ color: 'var(--text-muted)' }}>{PAGE_META[page].parent}</span>
        <Icons.ChevronRight size={14} style={{ color: 'var(--text-muted)' } as React.CSSProperties} />
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{PAGE_META[page].title}</span>
      </div>
      <div className="app-header__actions">
        <button
          className="app-button"
          onClick={handleForceSync}
          disabled={isSyncing}
        >
          <Icons.RefreshCw size={11} className={isSyncing ? 'animate-spin' : ''} />
          <span>{isSyncing ? (syncStatus || 'Syncing...') : 'Force Fetch'}</span>
        </button>
        <div className={`status-pill status-pill--${status}`}>
          <StatusDot status={status} pulse={status !== 'danger'} size={6} />
          <span style={{ fontSize: 11, fontWeight: 600 }}>{statusLabel}</span>
        </div>
        <div className="app-header__base">
          Base <span className="mono-num">{API_BASE_URL.replace(/^https?:\/\//, '')}</span>
        </div>
        <button className="app-button app-button--ghost" aria-label="Toggle theme" onClick={onThemeToggle}>
          {theme === 'dark' ? <Icons.Sun size={16} /> : <Icons.Moon size={16} />}
        </button>
      </div>
    </header>
  )
}
