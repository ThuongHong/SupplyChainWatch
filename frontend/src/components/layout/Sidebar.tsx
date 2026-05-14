import React from 'react'
import { Icons } from '../icons'
import { StatusDot } from '../StatusDot'

type PageId = 'dashboard' | 'indices' | 'vessels' | 'ports' | 'insights'

const NAV_ITEMS: { id: PageId; label: string; iconKey: keyof typeof Icons }[] = [
  { id: 'dashboard', label: 'Dashboard', iconKey: 'Dashboard' },
  { id: 'indices', label: 'Macro Indices', iconKey: 'TrendingUp' },
  { id: 'vessels', label: 'Vessel Map', iconKey: 'Ship' },
  { id: 'ports', label: 'Ports', iconKey: 'Anchor' },
  { id: 'insights', label: 'Insights Hub', iconKey: 'Lightbulb' },
]

interface SidebarProps {
  active: PageId
  open: boolean
  onToggle: () => void
  onNavigate: (page: PageId) => void
}

export const Sidebar: React.FC<SidebarProps> = ({ active, open, onToggle, onNavigate }) => {
  const w = open ? 220 : 56
  return (
    <nav style={{ width: w, minWidth: w, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)', transition: 'width 0.2s ease, min-width 0.2s ease', overflow: 'hidden' }}>
      <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', flexShrink: 0 }} onClick={onToggle}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icons.Globe size={14} style={{ color: '#fff', strokeWidth: 2 } as React.CSSProperties} />
        </div>
        {open && <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>GSW</span>}
      </div>
      <div style={{ flex: 1, padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(item => {
          const Icon = Icons[item.iconKey]
          const isActive = item.id === active
          return (
            <div key={item.id} onClick={() => onNavigate(item.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36, padding: '0 8px', borderRadius: 6, cursor: 'pointer', background: isActive ? 'var(--accent-muted)' : 'transparent', color: isActive ? 'var(--accent-text)' : 'var(--text-secondary)', transition: 'background 0.15s, color 0.15s' }}
              onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' } }}
              onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' } }}
            >
              <Icon size={18} style={{ flexShrink: 0 } as React.CSSProperties} />
              {open && <span style={{ fontSize: 13, fontWeight: isActive ? 500 : 400, whiteSpace: 'nowrap' }}>{item.label}</span>}
            </div>
          )
        })}
      </div>
      <div style={{ padding: open ? '12px 16px' : '12px 14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <StatusDot status="success" pulse size={7} />
        {open && <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Live · synced 2m ago</span>}
      </div>
    </nav>
  )
}

export type { PageId }
