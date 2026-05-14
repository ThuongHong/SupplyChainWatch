import React from 'react'
import { Icons } from '../icons'
import { StatusDot } from '../StatusDot'
import type { PageId } from './Sidebar'

const PAGE_META: Record<PageId, { parent: string; title: string }> = {
  dashboard: { parent: 'Dashboard', title: 'Overview' },
  indices: { parent: 'Analytics', title: 'Macro Indices' },
  vessels: { parent: 'Tracking', title: 'Vessel Map' },
  ports: { parent: 'Infrastructure', title: 'Ports' },
  insights: { parent: 'Intelligence', title: 'Insights Hub' },
}

interface HeaderProps {
  theme: 'dark' | 'light'
  onThemeToggle: () => void
  page: PageId
}

export const Header: React.FC<HeaderProps> = ({ theme, onThemeToggle, page }) => (
  <header style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{PAGE_META[page].parent}</span>
      <Icons.ChevronRight size={14} style={{ color: 'var(--text-muted)' } as React.CSSProperties} />
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{PAGE_META[page].title}</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 10px 0 8px', borderRadius: 6, cursor: 'pointer', background: 'var(--bg-input)', border: '1px solid var(--border-default)' }}>
        <Icons.Search size={14} style={{ color: 'var(--text-muted)' } as React.CSSProperties} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 140 }}>Search indices, vessels…</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-hover)', padding: '1px 5px', borderRadius: 4, fontFamily: 'IBM Plex Mono' }}>⌘K</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 14, background: 'var(--success-muted)' }}>
        <StatusDot status="success" pulse size={6} />
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--success)' }}>Live</span>
      </div>
      <div style={{ width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={onThemeToggle}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}>
        {theme === 'dark' ? <Icons.Sun size={16} /> : <Icons.Moon size={16} />}
      </div>
      <div style={{ width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)', position: 'relative' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}>
        <Icons.Bell size={16} />
        <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', border: '2px solid var(--bg-surface)' }} />
      </div>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>A</div>
    </div>
  </header>
)
