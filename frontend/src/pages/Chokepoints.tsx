import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  apiClient,
  type ChokepointResponse,
  type ChokepointTimelinePoint,
} from '../api/client'
import { ENABLE_DEMO_FALLBACK } from '../api/config'
import { queryKeys } from '../api/queries'
import {
  buildChokepointViewModels,
  chokepointSeverity,
  formatDateTime,
  rowDataMode,
  shouldUseDemoRows,
  type ChokepointViewModel,
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
import { Sparkline } from '../components/Sparkline'
import { fmtNum } from '../data/mock'
import type { PageId } from '../components/layout/Sidebar'

const severityColor: Record<Severity, string> = {
  low: 'var(--success)',
  medium: 'var(--warning)',
  high: 'var(--danger)',
}

const SEED_CHOKEPOINTS: { id: number; name: string; risk: number; vessels: number; speed: number }[] = [
  { id: 1, name: 'Suez Canal', risk: 0.72, vessels: 38, speed: 6.4 },
  { id: 2, name: 'Panama Canal', risk: 0.41, vessels: 19, speed: 8.1 },
  { id: 3, name: 'Strait of Hormuz', risk: 0.58, vessels: 47, speed: 9.7 },
  { id: 4, name: 'Strait of Malacca', risk: 0.34, vessels: 92, speed: 11.2 },
  { id: 5, name: 'Bab-el-Mandeb', risk: 0.81, vessels: 24, speed: 5.3 },
]

function demoChokepoints(): ChokepointViewModel[] {
  return SEED_CHOKEPOINTS.map(seed => ({
    id: seed.id,
    name: seed.name,
    vessel_count: seed.vessels,
    median_speed: seed.speed,
    risk_score: seed.risk,
    time: new Date(Date.now() - seed.id * 18 * 60_000).toISOString(),
    severity: chokepointSeverity({ risk_score: seed.risk }),
    stale: false,
  }))
}

function demoTimeline(seed: number, severity: Severity): ChokepointTimelinePoint[] {
  const base = severity === 'high' ? 0.7 : severity === 'medium' ? 0.45 : 0.22
  return Array.from({ length: 30 }, (_, i) => ({
    time: new Date(Date.now() - (29 - i) * 86_400_000).toISOString(),
    chokepoint_id: seed,
    vessel_count: Math.max(4, Math.round(30 + Math.sin((i + seed) / 3) * 12 + seed * 2)),
    median_speed: Math.max(3, 9 + Math.sin((i + seed) / 4) * 3),
    risk_score: Math.max(0.05, Math.min(0.98, base + Math.sin((i + seed) / 2.5) * 0.18)),
  }))
}

function timelineRisk(rows: ChokepointTimelinePoint[]): number[] {
  return rows
    .map(row => row.risk_score)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
}

function timelineVessels(rows: ChokepointTimelinePoint[]): number[] {
  return rows.map(row => row.vessel_count)
}

const ChokepointCard: React.FC<{ choke: ChokepointViewModel; spark: number[]; onClick: () => void }> = ({ choke, spark, onClick }) => {
  const risk = choke.risk_score ?? 0
  return (
    <Card hover onClick={onClick} style={{ padding: '14px 16px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{choke.name}</span>
            {choke.stale && <Badge variant="warning">Stale</Badge>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            risk score · vessel transit · median speed
          </div>
        </div>
        <RiskBadge severity={choke.severity} label={choke.severity.toUpperCase()} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="mono-num" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>{risk.toFixed(2)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>risk score</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 12 }}>
            <div>
              <div className="mono-num" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{choke.vessel_count ?? 0}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>vessels</div>
            </div>
            <div>
              <div className="mono-num" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{choke.median_speed?.toFixed(1) ?? 'n/a'} kn</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>median speed</div>
            </div>
          </div>
        </div>
        <Sparkline data={spark} color={severityColor[choke.severity]} width={72} height={36} />
      </div>
    </Card>
  )
}

const ChokepointDetail: React.FC<{
  choke: ChokepointViewModel
  timeline: ChokepointTimelinePoint[]
  loading: boolean
  onClose: () => void
}> = ({ choke, timeline, loading, onClose }) => {
  const riskValues = timelineRisk(timeline)
  const vesselValues = timelineVessels(timeline)
  const W = 360, H = 116
  const min = riskValues.length ? Math.min(...riskValues) : 0
  const max = riskValues.length ? Math.max(...riskValues) : 1
  const range = max - min || 1
  const points = riskValues.map((value, i) => ({
    x: 12 + (i / Math.max(riskValues.length - 1, 1)) * (W - 24),
    y: 10 + (1 - (value - min) / range) * (H - 28),
  }))
  const path = points.map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')

  const vesselMin = vesselValues.length ? Math.min(...vesselValues) : 0
  const vesselMax = vesselValues.length ? Math.max(...vesselValues) : 1
  const vRange = vesselMax - vesselMin || 1
  const vesselPath = vesselValues.map((value, i) => {
    const x = 12 + (i / Math.max(vesselValues.length - 1, 1)) * (W - 24)
    const y = 10 + (1 - (value - vesselMin) / vRange) * (H - 28)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)', boxShadow: '-8px 0 28px rgba(0,0,0,0.32)', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 18, borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>{choke.name}</h2>
            <RiskBadge severity={choke.severity} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Strategic maritime chokepoint · live AIS-derived risk score
          </div>
        </div>
        <button aria-label="Close chokepoint details" onClick={onClose} style={{ border: 0, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
          <Icons.X size={18} />
        </button>
      </div>
      <div style={{ padding: 18, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DataProvenance mode={choke.time ? 'live' : 'demo'} source="/api/chokepoints/{id}/timeline" timestamp={choke.time ? formatDateTime(choke.time) : undefined} stale={choke.stale} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <MetricCard label="Risk Score" value={(choke.risk_score ?? 0).toFixed(2)} tone={choke.severity === 'high' ? 'danger' : choke.severity === 'medium' ? 'warning' : 'success'} />
          <MetricCard label="Vessels In Polygon" value={choke.vessel_count ?? 0} tone="info" />
          <MetricCard label="Median Speed" value={`${choke.median_speed?.toFixed(1) ?? 'n/a'} kn`} tone="default" />
        </div>
        <Card style={{ padding: 14 }}>
          <SectionHeader title="Risk Score · 30-day timeline" sub={loading ? 'Loading timeline' : `${riskValues.length} points`} />
          {loading ? <SkeletonBlock height={H} /> : riskValues.length === 0 ? (
            <EmptyState title="No timeline data" detail="Backend returned no chokepoint_status rows for this entity." compact />
          ) : (
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img" aria-label={`${choke.name} risk timeline`}>
              <line x1="12" y1={H - 18} x2={W - 12} y2={H - 18} stroke="var(--border-subtle)" />
              <path d={path} fill="none" stroke={severityColor[choke.severity]} strokeWidth="1.8" strokeLinejoin="round" />
              {points.map((point, i) => i === points.length - 1 ? <circle key={i} cx={point.x} cy={point.y} r="3.5" fill={severityColor[choke.severity]} /> : null)}
            </svg>
          )}
        </Card>
        <Card style={{ padding: 14 }}>
          <SectionHeader title="Vessel Count · 30-day timeline" sub={`${vesselValues.length} points`} />
          {vesselValues.length === 0 ? (
            <EmptyState title="No transit data" compact />
          ) : (
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img" aria-label={`${choke.name} vessel count timeline`}>
              <line x1="12" y1={H - 18} x2={W - 12} y2={H - 18} stroke="var(--border-subtle)" />
              <path d={vesselPath} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          )}
        </Card>
        <Card style={{ padding: 14 }}>
          <SectionHeader title="Why this matters" sub="Operational interpretation" />
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            {choke.severity === 'high'
              ? `${choke.name} is in the high-risk band — congestion and slow transit speed combine to elevate disruption probability. Watch for downstream impacts on the freight indices that route through this corridor.`
              : choke.severity === 'medium'
                ? `${choke.name} is elevated but not critical. Useful as a watch-list item for regional supply-chain pressure.`
                : `${choke.name} is currently in the low-risk band. Vessel throughput and transit speed are within normal envelopes.`}
          </p>
        </Card>
      </div>
    </aside>
  )
}

export const Chokepoints: React.FC<{ onNavigate?: (page: PageId) => void }> = () => {
  const [selected, setSelected] = useState<ChokepointViewModel | null>(null)

  const chokepointsQuery = useQuery({
    queryKey: queryKeys.chokepoints,
    queryFn: ({ signal }) => apiClient.chokepoints({ signal }),
  })
  const liveChokepoints = useMemo(
    () => buildChokepointViewModels(chokepointsQuery.data ?? []),
    [chokepointsQuery.data],
  )
  const rowState = {
    loading: chokepointsQuery.isLoading,
    error: chokepointsQuery.error,
    rowCount: liveChokepoints.length,
    demoEnabled: ENABLE_DEMO_FALLBACK,
  }
  const useDemo = shouldUseDemoRows(rowState)
  const chokepoints = useDemo ? demoChokepoints() : liveChokepoints
  const mode = rowDataMode(rowState)

  const timelineQuery = useQuery({
    queryKey: selected ? queryKeys.chokepointTimeline(selected.id, 30) : ['chokepoints', 'no-selection'],
    queryFn: ({ signal }) => apiClient.chokepointTimeline(selected!.id, 30, { signal }),
    enabled: Boolean(selected && !useDemo),
    retry: false,
  })
  const liveTimeline = timelineQuery.data ?? []
  const timeline = selected && useDemo ? demoTimeline(selected.id, selected.severity) : liveTimeline

  const highCount = chokepoints.filter(c => c.severity === 'high').length
  const medCount = chokepoints.filter(c => c.severity === 'medium').length
  const totalVessels = chokepoints.reduce((sum, c) => sum + (c.vessel_count ?? 0), 0)

  const cardSparks = useMemo(() => {
    const result = new Map<number, number[]>()
    chokepoints.forEach(c => {
      const fallback = demoTimeline(c.id, c.severity).map(row => row.risk_score ?? 0)
      result.set(c.id, fallback)
    })
    return result
  }, [chokepoints])

  return (
    <PageShell
      title="Chokepoints"
      subtitle="Strategic maritime chokepoints — risk score, vessel count, and 30-day timeline from /api/chokepoints."
      action={<DataProvenance mode={mode} source={useDemo ? 'Demo fallback' : '/api/chokepoints'} />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {chokepointsQuery.error && !useDemo && (
          <ErrorPanel error={chokepointsQuery.error} title="Chokepoint API unavailable" compact />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 12 }}>
          <MetricCard label="Tracked Chokepoints" value={chokepoints.length} />
          <MetricCard label="High Risk" value={highCount} tone={highCount ? 'danger' : 'success'} />
          <MetricCard label="Watchlist" value={medCount} tone={medCount ? 'warning' : 'success'} />
          <MetricCard label="Vessels In Transit" value={fmtNum(totalVessels)} tone="info" />
        </div>

        {chokepointsQuery.isLoading && !useDemo ? (
          <SkeletonBlock height={240} lines={5} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {chokepoints.map(choke => (
              <ChokepointCard
                key={choke.id}
                choke={choke}
                spark={cardSparks.get(choke.id) ?? []}
                onClick={() => setSelected(choke)}
              />
            ))}
          </div>
        )}

        {chokepoints.length === 0 && !chokepointsQuery.isLoading && (
          <EmptyState title="No chokepoints returned" detail="Backend chokepoint_status table may be empty. Run the PortWatch collector to populate." />
        )}

        {selected && (
          <ChokepointDetail
            choke={selected}
            timeline={timeline}
            loading={timelineQuery.isLoading && !useDemo}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </PageShell>
  )
}
