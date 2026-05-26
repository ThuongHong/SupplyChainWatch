import React, { useEffect, useRef, useState } from 'react'
import { useQuery, useIsFetching, useQueryClient } from '@tanstack/react-query'
import { apiClient, API_BASE_URL, type SyncTaskStatus } from '../../api/client'
import { queryKeys } from '../../api/queries'
import { Icons } from '../icons'
import { StatusDot } from '../StatusDot'
import type { PageId } from './Sidebar'

const PAGE_META: Record<PageId, { parent: string; title: string }> = {
  dashboard: { parent: 'Macro Trends', title: 'Executive Overview' },
  indices: { parent: 'Macro Trends', title: 'Freight & Indices' },
  vessels: { parent: 'Micro Causes', title: 'Live Vessel Map' },
  ports: { parent: 'Micro Causes', title: 'Port Congestion' },
  chokepoints: { parent: 'Micro Causes', title: 'Chokepoints' },
  analytics: { parent: 'Intelligence', title: 'Exploratory Analysis' },
}

const SYNC_POLL_INTERVAL_MS = 2_000
const SYNC_MAX_POLLS = 6
const SYNC_REQUEST_TIMEOUT_MS = 8_000
const ACTIVE_SYNC_TASK_KEY = 'gsw-active-sync-task-id'

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))

const withTimeoutSignal = (timeoutMs: number) => {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timeoutId),
  }
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
  const mounted = useRef(true)
  const pollingTaskId = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      mounted.current = false
    }
  }, [])

  const clearActiveSyncTask = () => {
    localStorage.removeItem(ACTIVE_SYNC_TASK_KEY)
    pollingTaskId.current = null
  }

  const finishSyncState = async (message: string, delayMs: number) => {
    setSyncStatus(message)
    await wait(delayMs)
    if (mounted.current) {
      setSyncStatus(null)
    }
  }

  const pollSyncTask = async (taskId: string) => {
    pollingTaskId.current = taskId
    setSyncStatus(`Queued ${taskId.slice(0, 8)}`)
    try {
      for (let attempt = 0; attempt < SYNC_MAX_POLLS; attempt += 1) {
        const timeout = withTimeoutSignal(SYNC_REQUEST_TIMEOUT_MS)
        let task: SyncTaskStatus
        try {
          task = await apiClient.syncTaskStatus(taskId, { signal: timeout.signal })
        } finally {
          timeout.clear()
        }
        if (!mounted.current || pollingTaskId.current !== taskId) return
        if (task.successful) {
          clearActiveSyncTask()
          await queryClient.invalidateQueries()
          await finishSyncState('Sync complete', 1800)
          return
        }
        if (task.ready || task.status === 'failure' || task.status === 'revoked') {
          clearActiveSyncTask()
          await finishSyncState(task.error ? `Sync failed: ${task.error.slice(0, 48)}` : 'Sync failed', 3600)
          return
        }
        setSyncStatus(task.status === 'started' ? 'Sync running...' : 'Queued...')
        await wait(SYNC_POLL_INTERVAL_MS)
      }
      clearActiveSyncTask()
      await queryClient.invalidateQueries()
      await finishSyncState('Background sync queued', 1800)
    } catch (err) {
      console.error(err)
      clearActiveSyncTask()
      await finishSyncState('Sync status unavailable', 3600)
    }
  }

  useEffect(() => {
    const taskId = localStorage.getItem(ACTIVE_SYNC_TASK_KEY)
    if (taskId) void pollSyncTask(taskId)
    // Run only on mount so a stored backend task resumes after tab/page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      const timeout = withTimeoutSignal(SYNC_REQUEST_TIMEOUT_MS)
      let queued: { status: string; task_id: string }
      try {
        queued = await apiClient.forceSync({ signal: timeout.signal })
      } finally {
        timeout.clear()
      }
      localStorage.setItem(ACTIVE_SYNC_TASK_KEY, queued.task_id)
      setIsSyncing(false)
      void pollSyncTask(queued.task_id)
    } catch (err) {
      console.error(err)
      clearActiveSyncTask()
      setIsSyncing(false)
      await finishSyncState('Queue failed', 3600)
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
          <span>{isSyncing ? (syncStatus || 'Queueing...') : 'Force Fetch'}</span>
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
