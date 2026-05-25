import React, { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Card } from '../components/Card'
import { Sparkline } from '../components/Sparkline'
import { MiniMap } from '../components/MiniMap'
import { InsightRow, type InsightCategory } from '../components/InsightRow'
import { Icons } from '../components/icons'
import { Badge } from '../components/Badge'
import {
  DataProvenance,
  EmptyState,
  ErrorPanel,
  MetricCard,
  PageShell,
  SectionHeader,
  SkeletonBlock,
} from '../components/DataState'
import { MOCK, fmtNum, fmtPct } from '../data/mock'
import {
  apiClient,
  type DisruptionPropagationResponse,
  type EntityRiskForecastResponse,
  type InsightResponse,
  type OverviewStats,
  type RiskScoreResponse,
  type RiskStoryEventResponse,
  type PortResponse,
  type PortCongestionResponse,
} from '../api/client'
import { ENABLE_DEMO_FALLBACK } from '../api/config'
import { queryKeys } from '../api/queries'
import {
  activeHighAnomalies,
  formatDateTime,
  isStale,
  percentChange,
  relativeTime,
  rowDataMode,
  shouldUseDemoRows,
  buildPortViewModels,
  type PortViewModel,
} from '../api/viewModels'
import type { PageId } from '../components/layout/Sidebar'

type FeedInsight = {
  text: string
  category: InsightCategory
  time: string
  aiGenerated?: boolean
}

const normalizeCategory = (category?: string | null): InsightCategory => {
  if (category === 'anomaly' || category === 'correlation' || category === 'forecast' || category === 'risk_story' || category === 'data_quality' || category === 'port_risk') return category
  return 'trend'
}

const riskFromStats = (stats: OverviewStats | null, highAnomalies: number) => {
  const count = stats?.high_severity_anomalies ?? highAnomalies
  if (count >= 5) return { label: 'Elevated global risk', severity: 'high' as const, detail: `${count} high-severity anomalies in the recent window.` }
  if (count > 0) return { label: 'Watchlist active', severity: 'medium' as const, detail: `${count} high-severity anomalies require review.` }
  return { label: 'Normal operating band', severity: 'low' as const, detail: 'No high-severity anomaly concentration in the latest API window.' }
}

const riskTone = (severity?: string) => severity === 'high' ? 'danger' : severity === 'medium' ? 'warning' : 'success'
const riskScore = (row?: RiskScoreResponse) => row ? Math.round(row.score) : 0
const forecastDirection = (forecast?: EntityRiskForecastResponse) => {
  const scores = (forecast?.predictions ?? [])
    .map(point => Number(point.risk_score ?? NaN))
    .filter(Number.isFinite)
  if (forecast?.data_sufficiency_status !== 'sufficient' || scores.length < 2) return null
  const delta = scores[scores.length - 1] - scores[0]
  return { delta, label: delta >= 0 ? 'rising' : 'easing' }
}

const getRiskEntityId = (port: PortViewModel): string | null => {
  return port.locode ? `port-${port.locode.toLowerCase()}` : null
}

const demoDashboardPorts = (): PortViewModel[] => {
  return [
    { id: 1, locode: 'CNSHA', name: 'Shanghai', country: 'China', region: 'Asia', lat: 31.2, lon: 121.5, radius_km: 25, twenty_ft_eq_units_year: 47300000, severity: 'high', stale: false, congestion: { time: new Date().toISOString(), port_id: 1, port_name: 'Shanghai', anchored_count: 52, total_in_area: 118, moored_count: 0, underway_count: 0 } },
    { id: 2, locode: 'SGSIN', name: 'Singapore', country: 'Singapore', region: 'Asia', lat: 1.3, lon: 103.8, radius_km: 25, twenty_ft_eq_units_year: 37200000, severity: 'medium', stale: false, congestion: { time: new Date().toISOString(), port_id: 2, port_name: 'Singapore', anchored_count: 24, total_in_area: 68, moored_count: 0, underway_count: 0 } },
    { id: 3, locode: 'NLRTM', name: 'Rotterdam', country: 'Netherlands', region: 'Europe', lat: 51.9, lon: 4.1, radius_km: 25, twenty_ft_eq_units_year: 14400000, severity: 'low', stale: false, congestion: { time: new Date().toISOString(), port_id: 3, port_name: 'Rotterdam', anchored_count: 11, total_in_area: 32, moored_count: 0, underway_count: 0 } },
    { id: 4, locode: 'USLAX', name: 'Los Angeles', country: 'USA', region: 'Americas', lat: 33.7, lon: -118.2, radius_km: 25, twenty_ft_eq_units_year: 10600000, severity: 'low', stale: false, congestion: { time: new Date().toISOString(), port_id: 4, port_name: 'Los Angeles', anchored_count: 8, total_in_area: 25, moored_count: 0, underway_count: 0 } },
    { id: 5, locode: 'DEHAM', name: 'Hamburg', country: 'Germany', region: 'Europe', lat: 53.5, lon: 9.9, radius_km: 25, twenty_ft_eq_units_year: 8500000, severity: 'low', stale: false, congestion: { time: new Date().toISOString(), port_id: 5, port_name: 'Hamburg', anchored_count: 5, total_in_area: 18, moored_count: 0, underway_count: 0 } }
  ]
}

export const Dashboard: React.FC<{ onNavigate?: (page: PageId) => void }> = ({ onNavigate }) => {
  const [showTour, setShowTour] = useState(() => localStorage.getItem('gsw-onboarding-seen') !== '1')

  const statsQuery = useQuery({
    queryKey: queryKeys.overview,
    queryFn: ({ signal }) => apiClient.overviewStats({ signal }),
    refetchInterval: 60_000,
  })
  const insightsQuery = useQuery({
    queryKey: queryKeys.insights(5),
    queryFn: ({ signal }) => apiClient.latestInsights(5, { signal }),
  })
  const congestionQuery = useQuery({
    queryKey: queryKeys.portCongestion,
    queryFn: ({ signal }) => apiClient.portCongestion({ signal }),
  })
  const portsQuery = useQuery({
    queryKey: queryKeys.ports(),
    queryFn: ({ signal }) => apiClient.ports(undefined, { signal }),
  })
  const chokepointRiskQuery = useQuery({
    queryKey: queryKeys.chokepointStress(25),
    queryFn: ({ signal }) => apiClient.chokepointStress(25, { signal }),
    refetchInterval: 60_000,
  })
  const propagationQuery = useQuery({
    queryKey: queryKeys.disruptionPropagation,
    queryFn: ({ signal }) => apiClient.disruptionPropagation({ signal }),
  })
  const freshnessQuery = useQuery({
    queryKey: queryKeys.dataFreshness,
    queryFn: ({ signal }) => apiClient.dataFreshness({ signal }),
  })
  const watchlistQuery = useQuery({
    queryKey: queryKeys.vesselWatchlist,
    queryFn: ({ signal }) => apiClient.vesselWatchlist({ signal }),
  })
  const anomaliesQuery = useQuery({
    queryKey: queryKeys.anomalies(30),
    queryFn: ({ signal }) => apiClient.anomalies({ days: 30 }, { signal }),
  })
  const indexQueries = useQueries({
    queries: ['BDI', 'FBX_GLOBAL'].map(name => ({
      queryKey: queryKeys.indexHistory(name, 180),
      queryFn: ({ signal }: { signal: AbortSignal }) => apiClient.indexHistory(name, { limit: 180 }, { signal }),
      retry: 1,
    })),
  })

  const bdi = indexQueries[0].data ?? []
  const fbx = indexQueries[1].data ?? []
  const chokepointRows = chokepointRiskQuery.data ?? []
  const propagationRows = propagationQuery.data ?? []
  const freshnessRows = freshnessQuery.data ?? []
  const watchlistRows = watchlistQuery.data ?? []

  const livePorts = useMemo(() => buildPortViewModels(portsQuery.data ?? [], congestionQuery.data ?? []), [portsQuery.data, congestionQuery.data])
  const useDemoPorts = shouldUseDemoRows({
    loading: portsQuery.isLoading || congestionQuery.isLoading,
    error: portsQuery.error ?? congestionQuery.error,
    rowCount: livePorts.length,
    demoEnabled: ENABLE_DEMO_FALLBACK,
  })
  const displayedPorts = livePorts.length ? livePorts : useDemoPorts ? demoDashboardPorts() : []

  const topPort = displayedPorts[0]
  const topChokepoint = chokepointRows[0]
  const selectedRiskEntityId = topPort ? getRiskEntityId(topPort) : null

  const riskStoriesQuery = useQuery({
    queryKey: queryKeys.riskStories(selectedRiskEntityId ?? undefined, 180, 5),
    queryFn: ({ signal }) => apiClient.riskStories({ entity_id: selectedRiskEntityId!, days: 180, limit: 5 }, { signal }),
    enabled: Boolean(selectedRiskEntityId),
  })
  const riskForecastQuery = useQuery({
    queryKey: selectedRiskEntityId ? queryKeys.riskEntityForecast(selectedRiskEntityId) : ['risk', 'forecast', 'no-entity'],
    queryFn: ({ signal }) => apiClient.riskEntityForecast(selectedRiskEntityId!, { signal }),
    enabled: Boolean(selectedRiskEntityId),
  })
  const liveStats = statsQuery.data ?? null
  const apiError = portsQuery.error ?? congestionQuery.error ?? chokepointRiskQuery.error ?? statsQuery.error ?? insightsQuery.error ?? anomaliesQuery.error ?? riskStoriesQuery.error ?? riskForecastQuery.error ?? indexQueries.find(q => q.error)?.error
  const stale = isStale(liveStats?.generated_at, 6)
  const highAnomalies = activeHighAnomalies(anomaliesQuery.data ?? [])
  const risk = riskFromStats(liveStats, highAnomalies)
  const riskStoryRows = riskStoriesQuery.data ?? []
  const riskForecast = riskForecastQuery.data as EntityRiskForecastResponse | undefined
  const riskForecastDirection = forecastDirection(riskForecast)
  const derivedRiskLive = displayedPorts.length > 0 || chokepointRows.length > 0
  const summaryUnavailable = !liveStats && !derivedRiskLive
  const staleSources = freshnessRows.filter(row => row.freshness_status === 'stale').length
  const freshSources = freshnessRows.filter(row => row.freshness_status === 'fresh').length

  const topPortAnomaly = useMemo(() => {
    if (!topPort) return undefined
    return (anomaliesQuery.data ?? []).find((a: any) => a.port_id === topPort.id && (a.severity === 'high' || a.severity === 'medium'))
  }, [topPort, anomaliesQuery.data])

  const topPortDetail = useMemo(() => {
    if (topPortAnomaly) {
      return `${topPortAnomaly.severity.toUpperCase()} anomaly: ${topPortAnomaly.main_driver?.replace(/_/g, ' ')}`
    }
    return topPort?.congestion 
      ? `${topPort.congestion.total_in_area} vessels in area (${topPort.congestion.anchored_count} anchored)`
      : 'No active anomalies'
  }, [topPort, topPortAnomaly])

  const liveInsights = useMemo<FeedInsight[]>(() => (insightsQuery.data ?? []).map((insight: InsightResponse) => ({
    text: insight.narrative_llm || insight.narrative,
    category: normalizeCategory(insight.category),
    time: relativeTime(insight.narrative_generated_at || insight.generated_at),
    aiGenerated: Boolean(insight.narrative_llm),
  })), [insightsQuery.data])
  const useDemoInsights = shouldUseDemoRows({
    loading: insightsQuery.isLoading,
    error: insightsQuery.error,
    rowCount: liveInsights.length,
    demoEnabled: ENABLE_DEMO_FALLBACK,
  })
  const insights: FeedInsight[] = liveInsights.length > 0 ? liveInsights : useDemoInsights ? MOCK.insights.map(item => ({ ...item, aiGenerated: false })) : []

  const bdiChange = percentChange(bdi)
  const fbxChange = percentChange(fbx)
  const evidenceCards = [
    {
      label: 'Pipeline',
      value: freshnessRows.length ? `${freshSources}/${freshnessRows.length}` : '0',
      detail: freshnessRows.length ? 'sources fresh in latest API window' : 'source freshness not reported yet',
    },
    {
      label: 'Analysis',
      value: fmtNum((anomaliesQuery.data ?? []).length),
      detail: 'anomaly rows feeding trend, risk, and timeline views',
    },
    {
      label: 'Dashboard',
      value: fmtNum(displayedPorts.length),
      detail: 'ports ranked with congestion and risk context',
    },
    {
      label: 'Interpretation',
      value: fmtNum(liveInsights.length),
      detail: liveInsights.length ? 'live narratives available for review' : 'waiting for generated insight rows',
    },
  ]

  const highPorts = (congestionQuery.data ?? []).filter(row => row.total_in_area >= 100 || row.anchored_count >= 45).length

  const dismissTour = () => {
    localStorage.setItem('gsw-onboarding-seen', '1')
    setShowTour(false)
  }

  return (
    <PageShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {showTour && (
          <Card style={{ padding: 14, borderColor: 'var(--accent)', background: 'var(--accent-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-text)' }}>GlobalSupplyWatch command center</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                  Start with global risk, inspect map and port pressure, then use Insights Hub for evidence-backed narratives.
                </div>
              </div>
              <button onClick={dismissTour} style={{ border: 0, borderRadius: 4, padding: '5px 10px', cursor: 'pointer', color: 'var(--accent-text)', background: 'var(--bg-elevated)', whiteSpace: 'nowrap' }}>Got it</button>
            </div>
          </Card>
        )}

        {stale && (
          <Card style={{ padding: 12, borderColor: 'var(--warning)', background: 'var(--warning-muted)' }}>
            <span style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 600 }}>Data may be stale.</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
              Last overview refresh: {formatDateTime(liveStats?.generated_at)}.
            </span>
          </Card>
        )}
        {apiError && <ErrorPanel error={apiError} title="Some dashboard APIs are unavailable" compact />}

        <div className="evidence-strip">
          {evidenceCards.map(card => (
            <div className="evidence-card" key={card.label}>
              <div className="evidence-card__label">{card.label}</div>
              <div className="evidence-card__value">{card.value}</div>
              <div className="evidence-card__detail">{card.detail}</div>
            </div>
          ))}
        </div>

        <div className="responsive-grid grid-kpi">
          <Card style={{ padding: 16, border: `1px solid ${topPort ? topPort.severity === 'high' ? 'var(--danger)' : topPort.severity === 'medium' ? 'var(--warning)' : 'var(--border-default)' : 'var(--border-default)'}` }}>
            <SectionHeader
              title="Port Congestion Intelligence"
              sub={topPort ? `${topPort.name}: ${topPortDetail}` : summaryUnavailable ? 'No live PortWatch congestion data' : risk.detail}
              action={<Badge variant={topPort ? (topPort.severity === 'high' ? 'danger' : topPort.severity === 'medium' ? 'warning' : 'success') : summaryUnavailable ? 'default' : (risk.severity === 'high' ? 'danger' : risk.severity === 'medium' ? 'warning' : 'success')}>{topPort ? topPort.severity.toUpperCase() : summaryUnavailable ? 'Unavailable' : risk.label}</Badge>}
            />
            <DataProvenance
              mode={rowDataMode({ loading: portsQuery.isLoading || congestionQuery.isLoading || chokepointRiskQuery.isLoading, error: portsQuery.error ?? congestionQuery.error ?? chokepointRiskQuery.error, rowCount: displayedPorts.length, demoEnabled: ENABLE_DEMO_FALLBACK })}
              source={displayedPorts.length > 0 ? 'PortWatch congestion' : ENABLE_DEMO_FALLBACK ? 'Demo congestion fallback enabled' : 'PortWatch congestion unavailable'}
              timestamp={topPort?.congestion?.time ? `As of ${relativeTime(topPort.congestion.time)}` : liveStats ? `Updated ${relativeTime(liveStats.generated_at)}` : undefined}
              stale={topPort?.stale || stale}
            />
          </Card>
          <MetricCard label="Top Port Congestion" value={topPort?.congestion ? `${topPort.congestion.total_in_area}` : '0'} sub={topPort?.name ?? 'No active ports'} tone={topPort ? (topPort.severity === 'high' ? 'danger' : topPort.severity === 'medium' ? 'warning' : 'success') : 'info'} icon={<Icons.AlertTriangle size={15} />} footer={<Sparkline data={displayedPorts.slice(0, 8).map(port => port.congestion?.total_in_area ?? 0)} color="var(--danger)" width={90} height={28} />} />
          <MetricCard label="Chokepoint Stress" value={topChokepoint ? `${riskScore(topChokepoint)}` : '0'} sub={topChokepoint?.entity_name ?? 'No score rows'} tone={topChokepoint ? riskTone(topChokepoint.severity) : 'info'} icon={<Icons.Activity size={15} />} footer={<Sparkline data={chokepointRows.slice(0, 8).map(row => row.score)} color="var(--warning)" width={90} height={28} />} />
          <MetricCard label="Propagation Links" value={fmtNum(propagationRows.length)} sub={propagationRows.length ? 'downstream impact' : 'No active links'} tone={propagationRows.length > 0 ? 'warning' : 'success'} icon={<Icons.TrendingUp size={15} />} />
        </div>

        <Card style={{ padding: 16 }}>
          <SectionHeader
            title="Executive Brief"
            sub="One-screen operational story from live congestion, story, forecast, and source rows."
            action={<DataProvenance mode={derivedRiskLive ? 'live' : portsQuery.isLoading || congestionQuery.isLoading ? 'loading' : 'empty'} source="Dashboard live synthesis" />}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
            <div className="panel-note">
              <Badge variant={topPort ? (topPort.severity === 'high' ? 'danger' : topPort.severity === 'medium' ? 'warning' : 'success') : 'default'}>Current pressure</Badge>
              <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                {topPort ? `${topPort.name} leads port congestion with ${topPort.congestion?.total_in_area ?? 0} vessels in area and ${topPort.congestion?.anchored_count ?? 0} anchored.` : 'No live ranked port congestion row is available yet.'}
              </div>
            </div>
            <div className="panel-note">
              <Badge variant={riskStoryRows[0] ? riskTone(riskStoryRows[0].severity) : 'default'}>Latest story</Badge>
              <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                {riskStoryRows[0]?.narrative ?? 'No live risk story event has been generated for the top port.'}
              </div>
            </div>
            <div className="panel-note">
              <Badge variant={riskForecastDirection ? riskForecastDirection.delta >= 0 ? 'warning' : 'success' : staleSources ? 'danger' : 'default'}>Forward read</Badge>
              <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                {riskForecastDirection
                  ? `${topPort?.name ?? 'Selected entity'} forecast is ${riskForecastDirection.label} by ${Math.abs(riskForecastDirection.delta).toFixed(1)} points at ${Math.round((riskForecast?.confidence ?? 0) * 100)}% confidence.`
                  : staleSources
                    ? `${staleSources} source${staleSources === 1 ? '' : 's'} stale; treat downstream stories as lower-confidence.`
                    : 'Forecast path unavailable until enough real feature history exists.'}
              </div>
            </div>
          </div>
        </Card>

        <div className="responsive-grid grid-main-side">
          <Card style={{ padding: '16px', minWidth: 0 }}>
            <SectionHeader
              title="Global Port Congestion Ranking"
              sub={displayedPorts.length ? `${displayedPorts.length} monitored ports ranked` : useDemoPorts ? 'Demo fallback congestion' : 'Awaiting PortWatch congestion'}
              action={<DataProvenance mode={rowDataMode({ loading: portsQuery.isLoading || congestionQuery.isLoading, error: portsQuery.error ?? congestionQuery.error, rowCount: displayedPorts.length, demoEnabled: ENABLE_DEMO_FALLBACK })} source="PortWatch · congestion" />}
            />
            {portsQuery.isLoading || congestionQuery.isLoading ? <SkeletonBlock height={200} /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {displayedPorts.slice(0, 7).map(port => (
                  <div key={port.id} className="row-compact">
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{port.name}</span>
                    <Badge variant={port.severity === 'high' ? 'danger' : port.severity === 'medium' ? 'warning' : 'success'}>
                      {port.severity.toUpperCase()}
                    </Badge>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {port.congestion ? `${port.congestion.total_in_area} vessels in area (${port.congestion.anchored_count} anchored)` : 'No live AIS telemetry'}
                    </span>
                  </div>
                ))}
                {displayedPorts.length === 0 && <EmptyState title="No PortWatch congestion telemetry" detail="Run PortWatch collection to populate this ranking." compact />}
              </div>
            )}
          </Card>

          <Card style={{ padding: '16px', minWidth: 0 }}>
            <SectionHeader
              title="Congestion Heatmap"
              sub={displayedPorts.length ? `${topPort?.name ?? 'Port'} leads congestion ranking` : 'No live congestion overlay'}
              action={<DataProvenance mode={displayedPorts.length ? 'live' : congestionQuery.isLoading ? 'loading' : 'empty'} source="Congestion heatmap" />}
            />
            <MiniMap height={176} congestion={congestionQuery.data ?? []} anomalies={anomaliesQuery.data ?? []} />
          </Card>
        </div>

        <div className="responsive-grid grid-two">
          <Card style={{ padding: '16px', minWidth: 0 }}>
            <SectionHeader title="Disruption Propagation (The Ripple Effect)" sub="Modeled downstream impact based on current physical bottlenecks" />
            {(propagationRows.length ? propagationRows : []).slice(0, 4).map((row: DisruptionPropagationResponse) => (
              <div key={row.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{row.source_entity_name} → {row.target_entity_name}</span>
                  <Badge variant={riskTone(row.severity)}>{Math.round(row.confidence * 100)}% prob</Badge>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{row.route_lane ?? row.explanation}</div>
              </div>
            ))}
            {!propagationQuery.isLoading && propagationRows.length === 0 && <EmptyState title="No active propagation links" detail="Risk scores below configured propagation threshold." compact />}
          </Card>

          <Card style={{ padding: '16px', minWidth: 0 }}>
            <SectionHeader title="Operational Pulse" sub="High-level systemic pressure indicators" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'BDI (Raw Materials) Trend', value: bdiChange == null ? 'No live trend' : fmtPct(bdiChange), tone: bdiChange != null && bdiChange > 0 ? 'var(--success)' : 'var(--danger)' },
                { label: 'FBX (Containers) Trend', value: fbxChange == null ? 'No live trend' : fmtPct(fbxChange), tone: fbxChange != null && fbxChange > 0 ? 'var(--warning)' : 'var(--success)' },
                { label: 'High-pressure ports (Bottlenecks)', value: congestionQuery.data?.length ? `${highPorts} flagged` : 'No live port rows', tone: highPorts > 0 ? 'var(--danger)' : 'var(--text-primary)' },
                { label: 'Data Freshness (API Sync)', value: liveStats ? relativeTime(liveStats.generated_at) : 'Unavailable', tone: stale ? 'var(--warning)' : 'var(--success)' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{row.label}</span>
                  <span className="mono-num" style={{ fontSize: 13, color: row.tone, fontWeight: 600 }}>{row.value}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => onNavigate?.('analytics')} style={{ border: 0, background: 'transparent', cursor: 'pointer' }}><Badge variant="accent">Open Exploratory Analysis →</Badge></button>
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  )
}
