import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient, type PortCongestionResponse } from '../api/client'
import { ENABLE_DEMO_FALLBACK } from '../api/config'
import { queryKeys } from '../api/queries'
import {
  buildPortViewModels,
  formatDateTime,
  rowDataMode,
  shouldUseDemoRows,
  relativeTime,
  type PortViewModel,
  type Severity,
} from '../api/viewModels'
import {
  DataProvenance,
  EmptyState,
  ErrorPanel,
  MetricCard,
  PageShell,
  RiskBadge,
  SectionHeader,
  SkeletonBlock,
} from '../components/DataState'
import { Badge } from '../components/Badge'
import { Card } from '../components/Card'
import { Icons } from '../components/icons'
import { MiniMap, PORT_DATA } from '../components/MiniMap'
import { Sparkline } from '../components/Sparkline'
import { fmtNum } from '../data/mock'
import type { PageId } from '../components/layout/Sidebar'

type Region = 'All' | string

const severityColor: Record<Severity, string> = {
  low: 'var(--success)',
  medium: 'var(--warning)',
  high: 'var(--danger)',
}

function demoPorts(): PortViewModel[] {
  return PORT_DATA.map((port, index) => ({
    id: index + 1,
    locode: null,
    name: port.name,
    country: ['Shanghai', 'Ningbo', 'Shenzhen', 'Hong Kong'].includes(port.name) ? 'China'
      : port.name === 'Singapore' ? 'Singapore'
        : port.name === 'Rotterdam' ? 'Netherlands'
          : port.name === 'Los Angeles' ? 'USA'
            : port.name === 'Antwerp' ? 'Belgium'
              : port.name === 'Busan' ? 'South Korea'
                : 'Germany',
    region: ['Shanghai', 'Singapore', 'Ningbo', 'Busan', 'Shenzhen', 'Hong Kong'].includes(port.name) ? 'Asia'
      : ['Rotterdam', 'Antwerp', 'Hamburg'].includes(port.name) ? 'Europe'
        : 'Americas',
    lat: port.lat,
    lon: port.lon,
    radius_km: 25,
    twenty_ft_eq_units_year: 40_000 - index * 2_150,
    severity: port.congestion,
    stale: false,
    congestion: {
      time: new Date(Date.now() - index * 20 * 60_000).toISOString(),
      port_id: index + 1,
      port_name: port.name,
      anchored_count: port.congestion === 'high' ? 56 + index : port.congestion === 'medium' ? 22 + index : 7 + index,
      moored_count: port.congestion === 'high' ? 46 : port.congestion === 'medium' ? 20 : 8,
      underway_count: 10 + index,
      total_in_area: port.congestion === 'high' ? 120 + index * 2 : port.congestion === 'medium' ? 64 + index : 25 + index,
      avg_dwell_hours: port.congestion === 'high' ? 28 : port.congestion === 'medium' ? 11 : 4,
      median_speed: port.congestion === 'high' ? 1.2 : port.congestion === 'medium' ? 2.4 : 5.1,
    },
  }))
}

function timelineValues(rows: PortCongestionResponse[], fallbackSeed: number, demo: boolean): number[] {
  if (rows.length > 1) return rows.map(row => row.total_in_area)
  if (!demo) return []
  return Array.from({ length: 14 }, (_, i) => Math.max(8, Math.round(35 + Math.sin((i + fallbackSeed) / 2) * 12 + fallbackSeed)))
}

const PortCard: React.FC<{ port: PortViewModel; demo: boolean; onClick: () => void }> = ({ port, demo, onClick }) => {
  const row = port.congestion
  const sparkData = demo ? timelineValues([], port.id, true) : []
  return (
    <Card hover onClick={onClick} style={{ padding: '14px 16px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{port.name}</span>
            {port.stale && <Badge variant="warning">Stale</Badge>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{port.country} · {port.region ?? 'Unclassified'}</div>
        </div>
        <RiskBadge severity={port.severity} label={port.severity.toUpperCase()} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="mono-num" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>{row?.total_in_area ?? 0}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>vessels in area</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 12 }}>
            <div>
              <div className="mono-num" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{row?.anchored_count ?? 0}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>anchored</div>
            </div>
            <div>
              <div className="mono-num" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{row?.avg_dwell_hours?.toFixed(1) ?? 'n/a'}h</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>dwell</div>
            </div>
          </div>
        </div>
        <Sparkline data={sparkData} color={severityColor[port.severity]} width={72} height={36} />
      </div>
    </Card>
  )
}

const PortDetail: React.FC<{
  port: PortViewModel
  timeline: PortCongestionResponse[]
  loading: boolean
  demo: boolean
  onClose: () => void
  onNavigate?: (page: PageId) => void
}> = ({ port, timeline, loading, demo, onClose, onNavigate }) => {
  const values = timelineValues(timeline, port.id, demo)
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 1
  const range = max - min || 1
  const W = 360, H = 116
  const points = values.map((value, i) => ({
    x: 12 + (i / Math.max(values.length - 1, 1)) * (W - 24),
    y: 10 + (1 - (value - min) / range) * (H - 28),
  }))
  const path = points.map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')

  return (
    <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)', boxShadow: '-8px 0 28px rgba(0,0,0,0.32)', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 18, borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>{port.name}</h2>
            <RiskBadge severity={port.severity} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{port.country} · {port.locode ?? 'No LOCODE'} · radius {port.radius_km}km</div>
        </div>
        <button aria-label="Close port details" onClick={onClose} style={{ border: 0, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><Icons.X size={18} /></button>
      </div>
      <div style={{ padding: 18, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DataProvenance mode={demo ? 'demo' : port.congestion ? 'live' : 'empty'} source="Port congestion + reference table" timestamp={port.congestion ? formatDateTime(port.congestion.time) : undefined} stale={port.stale} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <MetricCard label="In Area" value={port.congestion?.total_in_area ?? 0} tone="info" />
          <MetricCard label="Anchored" value={port.congestion?.anchored_count ?? 0} tone={port.severity === 'high' ? 'danger' : 'default'} />
          <MetricCard label="Median Speed" value={`${port.congestion?.median_speed?.toFixed(1) ?? 'n/a'} kn`} tone="default" />
        </div>
        <Card style={{ padding: 14 }}>
          <SectionHeader title="Congestion Timeline" sub={loading ? 'Loading latest 30-day API timeline' : `${timeline.length || values.length} points`} />
          {loading ? <SkeletonBlock height={116} /> : values.length > 1 ? (
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img" aria-label={`${port.name} congestion timeline`}>
              <line x1="12" y1={H - 18} x2={W - 12} y2={H - 18} stroke="var(--border-subtle)" />
              <path d={path} fill="none" stroke={severityColor[port.severity]} strokeWidth="1.8" strokeLinejoin="round" />
              {points.map((point, i) => i === points.length - 1 ? <circle key={i} cx={point.x} cy={point.y} r="3.5" fill={severityColor[port.severity]} /> : null)}
            </svg>
          ) : (
            <EmptyState title="No congestion timeline rows" detail="Collector history has not populated this port yet." compact />
          )}
        </Card>
        <Card style={{ padding: 14 }}>
          <SectionHeader title="Why This Matters" sub="Operational interpretation" />
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            {port.severity === 'high'
              ? `${port.name} is in the high congestion band based on available congestion rows. Review dwell-time pressure and freight-rate ripple effects.`
              : port.severity === 'medium'
                ? `${port.name} is elevated but not critical. Review it as a regional port pressure watchlist candidate.`
                : `${port.name} is currently in the low congestion band based on the available frontend-derived thresholds.`}
          </p>
        </Card>
        <button onClick={() => onNavigate?.('vessels')} style={{ height: 34, borderRadius: 6, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer' }}>
          Open Vessel Map
        </button>
      </div>
    </aside>
  )
}

export const Ports: React.FC<{ onNavigate?: (page: PageId) => void }> = ({ onNavigate }) => {
  const [region, setRegion] = useState<Region>('All')
  const [selectedPort, setSelectedPort] = useState<PortViewModel | null>(null)
  const [search, setSearch] = useState('')

  const portsQuery = useQuery({
    queryKey: queryKeys.ports(region === 'All' ? undefined : region),
    queryFn: ({ signal }) => apiClient.ports(region === 'All' ? undefined : region, { signal }),
  })
  const congestionQuery = useQuery({
    queryKey: queryKeys.portCongestion,
    queryFn: ({ signal }) => apiClient.portCongestion({ signal }),
  })
  const livePorts = useMemo(() => buildPortViewModels(portsQuery.data ?? [], congestionQuery.data ?? []), [portsQuery.data, congestionQuery.data])
  const loading = portsQuery.isLoading || congestionQuery.isLoading
  const error = portsQuery.error ?? congestionQuery.error
  const usingDemo = shouldUseDemoRows({
    loading,
    error,
    rowCount: livePorts.length,
    demoEnabled: ENABLE_DEMO_FALLBACK,
  })
  const ports = usingDemo ? demoPorts() : livePorts
  const timelineQuery = useQuery({
    queryKey: selectedPort ? queryKeys.portTimeline(selectedPort.id, 30) : ['ports', 'no-selection'],
    queryFn: ({ signal }) => apiClient.portTimeline(selectedPort!.id, 30, { signal }),
    enabled: Boolean(selectedPort && !usingDemo),
    retry: false,
  })
  const regions = useMemo(() => ['All', ...Array.from(new Set(ports.map(port => port.region).filter(Boolean) as string[])).sort()], [ports])
  const filtered = ports.filter(port =>
    (region === 'All' || port.region === region) &&
    (search === '' || `${port.name} ${port.country} ${port.locode ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  )

  const highCount = ports.filter(port => port.severity === 'high').length
  const medCount = ports.filter(port => port.severity === 'medium').length
  const totalVessels = ports.reduce((sum, port) => sum + (port.congestion?.total_in_area ?? 0), 0)

  return (
    <PageShell
      title="Ports"
      subtitle="Congestion ranking, port search, and drill-down timeline from frontend-derived backend view models."
      action={<DataProvenance mode={rowDataMode({ loading, error, rowCount: livePorts.length, demoEnabled: ENABLE_DEMO_FALLBACK })} source={usingDemo ? 'Explicit demo fallback enabled' : '/api/ports + /api/ports/congestion'} />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <ErrorPanel error={error} title="Port API unavailable" compact />}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 12 }}>
          <MetricCard label="Tracked Ports" value={ports.length} />
          <MetricCard label="High Congestion" value={highCount} tone={highCount ? 'danger' : 'success'} />
          <MetricCard label="Watchlist Ports" value={medCount} tone={medCount ? 'warning' : 'success'} />
          <MetricCard label="Vessels In Areas" value={fmtNum(totalVessels)} tone="info" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 4, background: 'var(--bg-elevated)', padding: 3, borderRadius: 8, flexWrap: 'wrap' }}>
                  {regions.map(item => (
                    <button key={item} onClick={() => setRegion(item)} style={{
                      height: 26, padding: '0 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                      background: region === item ? 'var(--bg-card)' : 'transparent',
                      color: region === item ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}>{item}</button>
                  ))}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 10px', borderRadius: 6, background: 'var(--bg-input)', border: '1px solid var(--border-default)' }}>
                  <Icons.Search size={13} style={{ color: 'var(--text-muted)' } as React.CSSProperties} />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search ports"
                    aria-label="Search ports"
                    style={{ border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: 12, outline: 'none', width: 180 }}
                  />
                </label>
              </div>
            </Card>

            {loading && !usingDemo ? <SkeletonBlock height={240} lines={6} /> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {filtered.map(port => <PortCard key={port.id} port={port} demo={usingDemo} onClick={() => setSelectedPort(port)} />)}
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <EmptyState
                title={ports.length === 0 ? 'No live port rows' : 'No ports match your filter'}
                detail={ports.length === 0 ? 'Ports stay empty in normal mode until the backend returns reference or congestion rows.' : 'Clear search or change region.'}
              />
            )}
          </div>

          <Card style={{ padding: 16, height: 'fit-content' }}>
            <SectionHeader title="Port-To-Map Context" sub="Hotspots use the same severity language as the port ranking." />
            <MiniMap height={250} congestion={congestionQuery.data ?? []} />
          </Card>
        </div>

        {selectedPort && (
          <PortDetail
            port={selectedPort}
            timeline={timelineQuery.data ?? []}
            loading={timelineQuery.isLoading}
            demo={usingDemo}
            onClose={() => setSelectedPort(null)}
            onNavigate={onNavigate}
          />
        )}
      </div>
    </PageShell>
  )
}
