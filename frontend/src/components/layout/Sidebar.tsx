import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
import { queryKeys } from '../../api/queries'
import { relativeTime } from '../../api/viewModels'
import { Icons } from '../icons'
import { StatusDot } from '../StatusDot'

type PageId = 'dashboard' | 'indices' | 'vessels' | 'ports' | 'analytics'

const NAV_GROUPS: { title: string; items: { id: PageId; label: string; iconKey: keyof typeof Icons }[] }[] = [
  {
    title: 'MACRO TRENDS',
    items: [
      { id: 'dashboard', label: 'Executive Overview', iconKey: 'Dashboard' },
      { id: 'indices', label: 'Freight & Indices', iconKey: 'TrendingUp' },
    ]
  },
  {
    title: 'MICRO CAUSES',
    items: [
      { id: 'vessels', label: 'Live Vessel Map', iconKey: 'Ship' },
      { id: 'ports', label: 'Port Congestion', iconKey: 'Anchor' },
    ]
  },
  {
    title: 'INTELLIGENCE',
    items: [
      { id: 'analytics', label: 'Exploratory Analysis', iconKey: 'Activity' },
    ]
  }
]

interface SidebarProps {
  active: PageId
  open: boolean
  onToggle: () => void
  onNavigate: (page: PageId) => void
}

export const Sidebar: React.FC<SidebarProps> = ({ active, open, onToggle, onNavigate }) => {
  const w = open ? 220 : 56
  const freshness = useQuery({
    queryKey: queryKeys.dataFreshness,
    queryFn: ({ signal }) => apiClient.dataFreshness({ signal }),
    refetchInterval: 60_000,
  })
  const rows = freshness.data ?? []
  const staleRows = rows.filter(row => row.freshness_status === 'stale').length
  const freshRows = rows.filter(row => row.freshness_status === 'fresh').length
  const latestObserved = rows
    .map(row => row.latest_observed_at ?? row.latest_collected_at)
    .filter((time): time is string => Boolean(time))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
  const status = freshness.isError || staleRows > 0 ? 'danger' : freshness.isLoading ? 'warning' : freshRows > 0 ? 'success' : 'warning'
  const statusText = freshness.isError
    ? 'Freshness unavailable'
    : freshness.isLoading
      ? 'Checking sources'
      : rows.length
        ? `${freshRows}/${rows.length} fresh${latestObserved ? ` · ${relativeTime(latestObserved)}` : ''}`
        : 'No source status'
  return (
    <nav style={{ width: w, minWidth: w, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)', transition: 'width 0.2s ease, min-width 0.2s ease', overflow: 'hidden', boxShadow: '1px 0 0 rgba(255,255,255,0.02)' }}>
      <button aria-label={open ? 'Collapse navigation' : 'Expand navigation'} style={{ height: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', border: 0, borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', flexShrink: 0, background: 'transparent', textAlign: 'left' }} onClick={onToggle}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg, var(--accent), var(--info))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 0 1px rgba(255,255,255,0.14) inset' }}>
          <Icons.Globe size={14} style={{ color: '#fff', strokeWidth: 2 } as React.CSSProperties} />
        </div>
        {open && (
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>GSW</span>
            <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>SUPPLY RISK</span>
          </span>
        )}
      </button>
      <div style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
        {NAV_GROUPS.map((group, gIdx) => (
          <div key={gIdx} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {open && (
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', padding: '0 8px', marginBottom: 4, letterSpacing: '0.05em' }}>
                {group.title}
              </div>
            )}
            {group.items.map(item => {
              const Icon = Icons[item.iconKey]
              const isActive = item.id === active
              return (
                <button key={item.id} aria-current={isActive ? 'page' : undefined} aria-label={item.label} onClick={() => onNavigate(item.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36, padding: '0 8px', borderRadius: 6, border: 0, cursor: 'pointer', background: isActive ? 'var(--accent-muted)' : 'transparent', color: isActive ? 'var(--accent-text)' : 'var(--text-secondary)', transition: 'background 0.15s, color 0.15s', textAlign: 'left' }}
                  onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' } }}
                  onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' } }}
                >
                  <Icon size={18} style={{ flexShrink: 0 } as React.CSSProperties} />
                  {open && <span style={{ fontSize: 13, fontWeight: isActive ? 500 : 400, whiteSpace: 'nowrap' }}>{item.label}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <div style={{ padding: open ? '12px 16px' : '12px 14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <StatusDot status={status} pulse={status !== 'danger'} size={7} />
        {open && <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{statusText}</span>}
      </div>
    </nav>
  )
}

export type { PageId }
