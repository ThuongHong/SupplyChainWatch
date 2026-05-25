import React, { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Card } from '../components/Card'
import { Sparkline } from '../components/Sparkline'
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
  type CorrelationCell,
  type ForecastResponse,
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
  forecastLower,
  forecastPoints,
  forecastTimestamp,
  forecastUpper,
  forecastValue,
  metricValue,
} from '../api/viewModels'
import type { PageId } from '../components/layout/Sidebar'

const displayName = (name: string) => name === 'FBX_GLOBAL' ? 'FBX' : name === 'WCI_GLOBAL' ? 'WCI' : name
const apiName = (label: string) => label === 'FBX' ? 'FBX_GLOBAL' : label === 'WCI' ? 'WCI_GLOBAL' : label
const reliabilityScore = (mape: number | null) => mape == null ? null : Math.max(0, Math.min(100, 100 - mape))
const reliabilityTone = (score: number | null) => score == null ? 'default' : score >= 85 ? 'success' : score >= 70 ? 'warning' : 'danger'

const metricBadgeValue = (value: unknown): string => {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  if (typeof value === 'string' || typeof value === 'boolean') return String(value)
  if (value && typeof value === 'object') return 'structured'
  return 'n/a'
}

const numericMetricEntries = (metrics?: Record<string, unknown> | null) => {
  if (!metrics) return []
  return Object.entries(metrics)
    .flatMap(([key, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) return [{ key, value }]
      if (value && typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>)
          .filter(([, nested]) => typeof nested === 'number' && Number.isFinite(nested))
          .map(([nestedKey, nested]) => ({ key: `${key}.${nestedKey}`, value: nested as number }))
      }
      return []
    })
    .slice(0, 6)
}

const MiniMetricBars: React.FC<{ metrics?: Record<string, unknown> | null }> = ({ metrics }) => {
  const entries = numericMetricEntries(metrics)
  if (entries.length === 0) return null
  const max = Math.max(...entries.map(item => Math.abs(item.value)), 1)
  return (
    <div className="insight-metric-bars" aria-label="Insight source metric chart">
      {entries.map(item => (
        <div key={item.key} className="insight-metric-bars__row">
          <span title={item.key}>{item.key.replace(/_/g, ' ')}</span>
          <div><i style={{ width: `${Math.max(4, Math.abs(item.value) / max * 100)}%` }} /></div>
          <b className="mono-num">{metricBadgeValue(item.value)}</b>
        </div>
      ))}
    </div>
  )
}

const corrToColor = (v: number | null) => {
  if (v == null) return 'var(--bg-hover)'
  const abs = Math.abs(v)
  if (abs >= 0.85) return v > 0 ? 'rgba(47,179,68,0.62)' : 'rgba(224,82,82,0.62)'
  if (abs >= 0.65) return v > 0 ? 'rgba(47,179,68,0.38)' : 'rgba(224,82,82,0.38)'
  if (abs >= 0.4) return 'rgba(74,143,231,0.25)'
  return 'rgba(74,143,231,0.08)'
}

const correlationCell = (matrix: CorrelationCell[], row: string, col: string) => {
  if (row === col) return { correlation: 1, overlap: 0, lag_days: 0 }
  const a = apiName(row)
  const b = apiName(col)
  return matrix.find(c =>
    (c.index_a === a && c.index_b === b) ||
    (c.index_a === b && c.index_b === a)
  )
}

const CorrelationHeatmap: React.FC<{ data: CorrelationCell[]; labels: string[] }> = ({ data, labels }) => {
  if (labels.length < 2 || data.length === 0) {
    return <EmptyState title="No correlation rows" detail="Need at least two live freight index series with overlapping history." compact />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="panel-note" style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
        Pearson correlation over aligned freight-index history. <b style={{ color: 'var(--success)' }}>Green near +1</b> means two series move together, <b style={{ color: 'var(--danger)' }}>red near -1</b> means they move opposite, and pale cells mean weak co-movement. It is relationship evidence, not proof of cause.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `44px repeat(${labels.length}, 1fr)`, gap: 3, alignItems: 'center' }}>
        <div />
        {labels.map(label => <div key={label} style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'center' }}>{label}</div>)}
        {labels.map(row => (
          <React.Fragment key={row}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'right', paddingRight: 6 }}>{row}</div>
            {labels.map(col => {
              const cell = correlationCell(data, row, col)
              const value = cell?.correlation ?? null
              return (
                <div key={`${row}-${col}`} title={`${row} vs ${col}: ${value == null ? 'no overlap' : value.toFixed(2)} · overlap ${cell?.overlap ?? 0} days · lag ${cell?.lag_days ?? 0} days · co-movement, not causation`} style={{
                  aspectRatio: '1',
                  borderRadius: 4,
                  background: row === col ? 'var(--bg-hover)' : corrToColor(value),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--border-subtle)',
                }}>
                  <span className="mono-num" style={{ fontSize: 12, fontWeight: 500, color: value == null ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                    {value == null ? 'n/a' : value.toFixed(2)}
                  </span>
                </div>
              )
            })}
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
        <span><b className="mono-num" style={{ color: 'var(--text-primary)' }}>+0.70 to +1.00</b> strong same direction</span>
        <span><b className="mono-num" style={{ color: 'var(--text-primary)' }}>-0.70 to -1.00</b> strong opposite direction</span>
        <span><b className="mono-num" style={{ color: 'var(--text-primary)' }}>0.00</b> little linear relationship</span>
      </div>
    </div>
  )
}

const ForecastCard: React.FC<{ name: string; forecast?: ForecastResponse; isLoading: boolean; error: unknown }> = ({ name, forecast, isLoading, error }) => {
  const points = forecastPoints(forecast).slice(0, forecast?.horizon_days ?? 14)
  const usable = points.map(point => ({ point, value: forecastValue(point), lower: forecastLower(point), upper: forecastUpper(point) })).filter(item => item.value != null)
  const mape = metricValue(forecast?.metrics, 'mape') ?? metricValue(forecast?.metrics, 'MAPE')
  const mae = metricValue(forecast?.metrics, 'mae') ?? metricValue(forecast?.metrics, 'MAE')
  const rmse = metricValue(forecast?.metrics, 'rmse') ?? metricValue(forecast?.metrics, 'RMSE')
  const score = reliabilityScore(mape)
  const delta = usable.length >= 2 && usable[0].value != null && usable[usable.length - 1].value != null
    ? (usable[usable.length - 1].value ?? 0) - (usable[0].value ?? 0)
    : null
  const direction = delta == null ? 'No forward path' : delta >= 0 ? 'Rising pressure' : 'Easing pressure'

  return (
    <Card style={{ padding: 14 }}>
      <SectionHeader
        title={`${displayName(name)} Forward Read`}
        sub={forecast ? `${direction} over ${forecast.horizon_days} days · ${relativeTime(forecast.created_at)}` : 'No forecast row returned'}
        action={score == null ? <Badge variant="default">Score n/a</Badge> : <Badge variant={reliabilityTone(score)}>Score {score.toFixed(1)}</Badge>}
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <Badge variant={delta == null ? 'default' : delta >= 0 ? 'warning' : 'success'}>{delta == null ? 'Direction n/a' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} move`}</Badge>
        {mape != null && (
          <span title={`Model: ${forecast?.model_name ?? 'moving_average_baseline'} · MAE ${mae?.toFixed(1) ?? 'n/a'} · RMSE ${rmse?.toFixed(1) ?? 'n/a'}`}>
            <Badge variant={mape <= 15 ? 'success' : mape <= 30 ? 'warning' : 'danger'}>MAPE {mape.toFixed(1)}% error</Badge>
          </span>
        )}
      </div>
      {isLoading && <SkeletonBlock height={90} lines={3} />}
      {!isLoading && Boolean(error) && <EmptyState title="No forecast yet" detail={error instanceof Error ? error.message : 'Backend returned no latest forecast.'} compact />}
      {!isLoading && !error && usable.length > 0 && (
        <svg width="100%" viewBox="0 0 260 88" style={{ display: 'block' }} role="img" aria-label={`${displayName(name)} forecast chart`}>
          {(() => {
            const vals = usable.flatMap(item => [item.value, item.lower, item.upper]).filter((v): v is number => typeof v === 'number')
            const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1
            const toX = (i: number) => 28 + (i / Math.max(usable.length - 1, 1)) * 218
            const toY = (v: number) => 8 + (1 - (v - min) / range) * 58
            const line = usable.map((item, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(item.value ?? 0).toFixed(1)}`).join(' ')
            const bandPoints = usable.filter(item => item.lower != null && item.upper != null)
            const band = bandPoints.length > 1
              ? 'M' + bandPoints.map((item, i) => `${toX(i).toFixed(1)},${toY(item.upper ?? 0).toFixed(1)}`).join(' L') +
              ' L' + bandPoints.slice().reverse().map((item, i) => `${toX(bandPoints.length - 1 - i).toFixed(1)},${toY(item.lower ?? 0).toFixed(1)}`).join(' L') + ' Z'
              : ''
            return (
              <>
                <line x1="28" y1="66" x2="246" y2="66" stroke="var(--border-subtle)" />
                {band && <path d={band} fill="var(--accent)" opacity="0.12" />}
                <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeDasharray="4,3" />
                <text x="28" y="84" style={{ fontSize: 9, fill: 'var(--text-muted)' }}>{forecastTimestamp(usable[0].point)?.slice(5, 10) ?? 'start'}</text>
                <text x="226" y="84" style={{ fontSize: 9, fill: 'var(--text-muted)' }}>{forecastTimestamp(usable[usable.length - 1].point)?.slice(5, 10) ?? 'end'}</text>
              </>
            )
          })()}
        </svg>
      )}
    </Card>
  )
}

type FeedInsight = {
  title: string
  text: string
  category: InsightCategory
  time: string
  aiGenerated?: boolean
  model?: string | null
  confidence?: number | null
  attentionLevel?: string | null
  metrics?: Record<string, unknown> | null
  sourceMetrics?: Record<string, unknown> | null
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

const demoDashboardRiskRows = (): RiskScoreResponse[] => {
  return [
    { entity_id: 'port-cnsha', entity_name: 'Shanghai', entity_type: 'port', score: 86, severity: 'high', component_scores: { portwatch_anomaly: 42, weather: 10, data_quality: 0 }, freshness_status: 'fresh', as_of: new Date().toISOString(), lat: 31.2, lon: 121.5 },
    { entity_id: 'port-sgsin', entity_name: 'Singapore', entity_type: 'port', score: 62, severity: 'medium', component_scores: { portwatch_anomaly: 28, weather: 8, data_quality: 0 }, freshness_status: 'fresh', as_of: new Date().toISOString(), lat: 1.3, lon: 103.8 },
    { entity_id: 'port-nlrtm', entity_name: 'Rotterdam', entity_type: 'port', score: 31, severity: 'low', component_scores: { portwatch_anomaly: 14, weather: 5, data_quality: 0 }, freshness_status: 'fresh', as_of: new Date().toISOString(), lat: 51.9, lon: 4.1 },
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
    queryKey: queryKeys.insights(20),
    queryFn: ({ signal }) => apiClient.latestInsights(20, { signal }),
  })
  const indicesQuery = useQuery({
    queryKey: queryKeys.indices,
    queryFn: ({ signal }) => apiClient.indices({ signal }),
  })
  const supportedNames = useMemo(() => {
    const available = new Set((indicesQuery.data ?? []).map(row => row.index_name))
    const preferred = ['BDI', 'FBX_GLOBAL', 'WCI_GLOBAL'].filter(name => available.has(name))
    return preferred.length >= 2 ? preferred : Array.from(available).slice(0, 4)
  }, [indicesQuery.data])
  const correlationNames = supportedNames.join(',')
  const correlationsQuery = useQuery({
    queryKey: queryKeys.correlations(correlationNames || 'none', 180),
    queryFn: ({ signal }) => apiClient.correlations(correlationNames, 180, { signal }),
    enabled: supportedNames.length >= 2,
  })
  const forecastQueries = useQueries({
    queries: supportedNames.slice(0, 3).map(name => ({
      queryKey: queryKeys.indexForecast(name),
      queryFn: ({ signal }: { signal: AbortSignal }) => apiClient.indexForecast(name, { signal }),
      retry: false,
    })),
  })
  const portRiskQuery = useQuery({
    queryKey: queryKeys.globalPortRisk(25),
    queryFn: ({ signal }) => apiClient.globalPortRisk(25, { signal }),
    refetchInterval: 60_000,
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

  const liveRiskPorts = portRiskQuery.data ?? []
  const useDemoRiskPorts = shouldUseDemoRows({
    loading: portRiskQuery.isLoading,
    error: portRiskQuery.error,
    rowCount: liveRiskPorts.length,
    demoEnabled: ENABLE_DEMO_FALLBACK,
  })
  const displayedRiskPorts = liveRiskPorts.length ? liveRiskPorts : useDemoRiskPorts ? demoDashboardRiskRows() : []

  const topPort = displayedRiskPorts[0]
  const topChokepoint = chokepointRows[0]
  const selectedRiskEntityId = topPort?.entity_id ?? null

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
  const apiError = portRiskQuery.error ?? chokepointRiskQuery.error ?? statsQuery.error ?? insightsQuery.error ?? anomaliesQuery.error ?? riskStoriesQuery.error ?? riskForecastQuery.error ?? indexQueries.find(q => q.error)?.error
  const stale = isStale(liveStats?.generated_at, 6)
  const highAnomalies = activeHighAnomalies(anomaliesQuery.data ?? [])
  const risk = riskFromStats(liveStats, highAnomalies)
  const riskStoryRows = riskStoriesQuery.data ?? []
  const riskForecast = riskForecastQuery.data as EntityRiskForecastResponse | undefined
  const riskForecastDirection = forecastDirection(riskForecast)
  const derivedRiskLive = displayedRiskPorts.length > 0 || chokepointRows.length > 0
  const summaryUnavailable = !liveStats && !derivedRiskLive
  const staleSources = freshnessRows.filter(row => row.freshness_status === 'stale').length
  const freshSources = freshnessRows.filter(row => row.freshness_status === 'fresh').length

  const topPortDetail = useMemo(() => {
    const reasons = topPort?.reasons?.slice(0, 2).join('; ')
    return reasons || (topPort ? `${Math.round(topPort.score)} risk score from PortWatch risk snapshots` : 'No active PortWatch risk row')
  }, [topPort])

  const liveInsights = useMemo<FeedInsight[]>(() => (insightsQuery.data ?? []).map((insight: InsightResponse) => ({
    title: insight.title || 'Trend Signal',
    text: insight.narrative_llm || insight.narrative,
    category: normalizeCategory(insight.category),
    time: relativeTime(insight.narrative_generated_at || insight.generated_at),
    aiGenerated: Boolean(insight.narrative_llm),
    model: insight.narrative_model,
    confidence: insight.confidence,
    attentionLevel: insight.attention_level,
    metrics: insight.metrics,
    sourceMetrics: insight.source_metrics,
  })), [insightsQuery.data])
  const useDemoInsights = shouldUseDemoRows({
    loading: insightsQuery.isLoading,
    error: insightsQuery.error,
    rowCount: liveInsights.length,
    demoEnabled: ENABLE_DEMO_FALLBACK,
  })
  const insights: FeedInsight[] = liveInsights.length > 0 ? liveInsights : useDemoInsights ? MOCK.insights.map(item => ({ ...item, title: 'Alert Analysis', category: normalizeCategory(item.category), aiGenerated: false })) : []

  const useDemoCorrelations = shouldUseDemoRows({
    loading: correlationsQuery.isLoading,
    error: correlationsQuery.error,
    rowCount: correlationsQuery.data?.length ?? 0,
    demoEnabled: ENABLE_DEMO_FALLBACK,
  })
  const labels = supportedNames.map(displayName)

  const bdiChange = percentChange(bdi)
  const fbxChange = percentChange(fbx)
  const evidenceCards = [
    {
      label: 'Data Health',
      value: freshnessRows.length ? `${freshSources}/${freshnessRows.length}` : '0',
      detail: freshnessRows.length ? 'sources fresh in latest API window' : 'source freshness not reported yet',
    },
    {
      label: 'Anomalies',
      value: fmtNum((anomaliesQuery.data ?? []).length),
      detail: 'anomaly rows feeding trend, risk, and timeline views',
    },
    {
      label: 'Risk Rows',
      value: fmtNum(displayedRiskPorts.length),
      detail: 'ports ranked with PortWatch risk snapshots',
    },
    {
      label: 'Insights',
      value: fmtNum(liveInsights.length),
      detail: liveInsights.length ? 'live narratives available for review' : 'waiting for generated insight rows',
    },
  ]

  const topInsights = insights
    .filter(insight => insight.attentionLevel === 'high' || insight.category === 'port_risk' || insight.category === 'risk_story' || insight.category === 'forecast')
    .slice(0, 3)
  const displayedTopInsights = topInsights.length ? topInsights : insights.slice(0, 3)

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

        <Card style={{ padding: 16, borderColor: topPort?.severity === 'high' ? 'var(--danger)' : topPort?.severity === 'medium' ? 'var(--warning)' : 'var(--border-default)' }}>
          <div className="overview-summary">
            <div>
              <div className="overview-summary__eyebrow">Executive Summary</div>
              <div className="overview-summary__title">
                {topPort
                  ? `${topPort.entity_name} is the active supply-chain watchpoint.`
                  : summaryUnavailable
                    ? 'Global supply-chain risk is unavailable.'
                    : risk.label}
              </div>
              <div className="overview-summary__detail">
                {topPort
                  ? `${Math.round(topPort.score)}/100 PortWatch risk. ${topPortDetail}`
                  : summaryUnavailable
                    ? 'Run collectors and risk scoring to populate overview signals.'
                    : risk.detail}
              </div>
            </div>
            <div className="overview-summary__actions">
              <DataProvenance
                mode={derivedRiskLive ? 'live' : portRiskQuery.isLoading ? 'loading' : 'empty'}
                source="Dashboard live synthesis"
                timestamp={liveStats ? `Updated ${relativeTime(liveStats.generated_at)}` : undefined}
                stale={stale}
              />
              <button onClick={() => onNavigate?.('ports')} className="app-button">
                <Icons.ArrowUpRight size={14} /> Inspect Port
              </button>
            </div>
          </div>
        </Card>

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
              title="PortWatch Risk Intelligence"
              sub={topPort ? `${topPort.entity_name}: ${topPortDetail}` : summaryUnavailable ? 'No live PortWatch risk data' : risk.detail}
              action={<Badge variant={topPort ? (topPort.severity === 'high' ? 'danger' : topPort.severity === 'medium' ? 'warning' : 'success') : summaryUnavailable ? 'default' : (risk.severity === 'high' ? 'danger' : risk.severity === 'medium' ? 'warning' : 'success')}>{topPort ? topPort.severity.toUpperCase() : summaryUnavailable ? 'Unavailable' : risk.label}</Badge>}
            />
            <DataProvenance
              mode={rowDataMode({ loading: portRiskQuery.isLoading || chokepointRiskQuery.isLoading, error: portRiskQuery.error ?? chokepointRiskQuery.error, rowCount: displayedRiskPorts.length, demoEnabled: ENABLE_DEMO_FALLBACK })}
              source={displayedRiskPorts.length > 0 ? 'PortWatch risk snapshots' : ENABLE_DEMO_FALLBACK ? 'Demo risk fallback enabled' : 'PortWatch risk unavailable'}
              timestamp={topPort?.as_of ? `As of ${relativeTime(topPort.as_of)}` : liveStats ? `Updated ${relativeTime(liveStats.generated_at)}` : undefined}
              stale={topPort ? isStale(topPort.as_of, 72) : stale}
            />
          </Card>
          <MetricCard label="Top PortWatch Risk" value={topPort ? `${Math.round(topPort.score)}` : '0'} sub={topPort?.entity_name ?? 'No active ports'} tone={topPort ? (topPort.severity === 'high' ? 'danger' : topPort.severity === 'medium' ? 'warning' : 'success') : 'info'} icon={<Icons.AlertTriangle size={15} />} footer={<Sparkline data={displayedRiskPorts.slice(0, 8).map(port => port.score)} color="var(--danger)" width={90} height={28} />} />
          <MetricCard label="Chokepoint Stress" value={topChokepoint ? `${riskScore(topChokepoint)}` : '0'} sub={topChokepoint?.entity_name ?? 'No score rows'} tone={topChokepoint ? riskTone(topChokepoint.severity) : 'info'} icon={<Icons.Activity size={15} />} footer={<Sparkline data={chokepointRows.slice(0, 8).map(row => row.score)} color="var(--warning)" width={90} height={28} />} />
          <MetricCard label="Propagation Links" value={fmtNum(propagationRows.length)} sub={propagationRows.length ? 'downstream impact' : 'No active links'} tone={propagationRows.length > 0 ? 'warning' : 'success'} icon={<Icons.TrendingUp size={15} />} />
        </div>

        <Card style={{ padding: 16 }}>
          <SectionHeader
            title="Executive Brief"
            sub="Now, why, and next from PortWatch risk, forecast, and source rows."
            action={<DataProvenance mode={derivedRiskLive ? 'live' : portRiskQuery.isLoading ? 'loading' : 'empty'} source="Dashboard live synthesis" />}
          />
          <div className="overview-timeline">
            <div className="overview-timeline__item">
              <Badge variant={topPort ? (topPort.severity === 'high' ? 'danger' : topPort.severity === 'medium' ? 'warning' : 'success') : 'default'}>Current pressure</Badge>
              <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                {topPort ? `${topPort.entity_name} leads PortWatch risk at ${Math.round(topPort.score)}/100. ${topPortDetail}` : 'No live ranked PortWatch risk row is available yet.'}
              </div>
            </div>
            <div className="overview-timeline__item">
              <Badge variant={riskStoryRows[0] ? riskTone(riskStoryRows[0].severity) : 'default'}>Latest story</Badge>
              <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                {riskStoryRows[0]?.narrative ?? 'No live risk story event has been generated for the top port.'}
              </div>
            </div>
            <div className="overview-timeline__item">
              <Badge variant={riskForecastDirection ? riskForecastDirection.delta >= 0 ? 'warning' : 'success' : staleSources ? 'danger' : 'default'}>Forward read</Badge>
              <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                {riskForecastDirection
                  ? `${topPort?.entity_name ?? 'Selected entity'} forecast is ${riskForecastDirection.label} by ${Math.abs(riskForecastDirection.delta).toFixed(1)} points at ${Math.round((riskForecast?.confidence ?? 0) * 100)}% confidence.`
                  : staleSources
                    ? `${staleSources} source${staleSources === 1 ? '' : 's'} stale; treat downstream stories as lower-confidence.`
                    : 'Forecast path unavailable until enough real feature history exists.'}
              </div>
            </div>
          </div>
        </Card>

        <div>
          <Card style={{ padding: '16px', minWidth: 0 }}>
            <SectionHeader
              title="Risk Source Coverage"
              sub={freshnessRows.length ? `${freshSources}/${freshnessRows.length} sources fresh` : 'No freshness rows yet'}
              action={<DataProvenance mode={freshnessRows.length ? 'live' : freshnessQuery.isLoading ? 'loading' : 'empty'} source="PortWatch source freshness" />}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {freshnessRows.slice(0, 6).map(row => (
                <div key={row.source} className="row-compact">
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{row.source}</span>
                  <Badge variant={row.freshness_status === 'fresh' ? 'success' : row.freshness_status === 'stale' ? 'danger' : 'warning'}>{row.freshness_status}</Badge>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{row.rows} rows · {row.latest_observed_at ? relativeTime(row.latest_observed_at) : 'no observation'}</span>
                </div>
              ))}
              {!freshnessQuery.isLoading && freshnessRows.length === 0 && <EmptyState title="No source freshness rows" detail="Run PortWatch collection to populate coverage and freshness." compact />}
            </div>
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
            <SectionHeader title="Market Pulse" sub="Freight index direction without duplicate system-health signals" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'BDI (Raw Materials) Trend', value: bdiChange == null ? 'No live trend' : fmtPct(bdiChange), tone: bdiChange != null && bdiChange > 0 ? 'var(--success)' : 'var(--danger)' },
                { label: 'FBX (Containers) Trend', value: fbxChange == null ? 'No live trend' : fmtPct(fbxChange), tone: fbxChange != null && fbxChange > 0 ? 'var(--warning)' : 'var(--success)' },
                { label: 'Supported Indexes', value: supportedNames.length ? supportedNames.map(displayName).join(' / ') : 'No live indexes', tone: supportedNames.length >= 2 ? 'var(--success)' : 'var(--warning)' },
                { label: 'Correlation Window', value: supportedNames.length >= 2 ? '180 days' : 'Waiting for overlap', tone: supportedNames.length >= 2 ? 'var(--info)' : 'var(--text-muted)' },
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

        {/* Top Insights & Market Analysis Section */}
        <div style={{ marginTop: 24, marginBottom: 8 }}>
          <SectionHeader
            title="Top Insights & Market Analysis"
            sub="Highest-priority narratives, index correlations, and forward reads"
          />
        </div>

        <div className="responsive-grid grid-feed" style={{ alignItems: 'start' }}>
          <div style={{ minWidth: 0, maxHeight: 520, overflow: 'auto', paddingRight: 4 }}>
            <div className="tab-strip" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-base)', paddingBottom: 8 }}>
              <Badge variant="accent">Top 3 insight feed</Badge>
              <button onClick={() => onNavigate?.('analytics')} className="tab-button">Open full analysis</button>
            </div>

            <Card style={{ padding: '4px 16px', minWidth: 0 }}>
              {insightsQuery.isLoading && <SkeletonBlock height={180} lines={5} />}
              {!insightsQuery.isLoading && useDemoInsights && <DataProvenance mode="demo" source="Explicit demo examples until insight rows exist" />}
              {displayedTopInsights
                .map((insight, i) => (
                  <div key={`${insight.title}-${i}`} style={{ borderBottom: '1px solid var(--border-subtle)', padding: '12px 0' }}>
                    <InsightRow text={insight.text} category={insight.category} time={insight.time} aiGenerated={insight.aiGenerated ?? false} />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 10px 40px' }}>
                      <Badge variant="default">{insight.title}</Badge>
                      {insight.model && <Badge variant="info">{insight.model}</Badge>}
                      {insight.confidence != null && <Badge variant={insight.confidence >= 0.8 ? 'success' : insight.confidence >= 0.5 ? 'warning' : 'default'}>conf {Math.round(insight.confidence * 100)}%</Badge>}
                      {insight.attentionLevel && <Badge variant={insight.attentionLevel === 'high' ? 'danger' : insight.attentionLevel === 'medium' ? 'warning' : 'success'}>{insight.attentionLevel.toUpperCase()}</Badge>}
                    </div>
                    {insight.metrics && <MiniMetricBars metrics={insight.metrics} />}
                  </div>
                ))}
              {displayedTopInsights.length === 0 && (
                <div style={{ padding: '24px 0' }}>
                  <EmptyState title="No priority insights" detail="No generated insight rows are available in the current window." compact />
                </div>
              )}
            </Card>
          </div>

          <Card style={{ padding: 16, minWidth: 0, maxHeight: 520, overflow: 'auto' }}>
            <SectionHeader
              title="Correlation Heatmap"
              sub={labels.length ? labels.join(' · ') : 'Waiting for index overlap'}
              action={<DataProvenance mode={useDemoCorrelations ? 'demo' : correlationsQuery.isLoading ? 'loading' : 'live'} source="Freight index correlation matrix" />}
            />
            {correlationsQuery.isLoading ? <SkeletonBlock height={140} /> : <CorrelationHeatmap data={correlationsQuery.data ?? []} labels={labels} />}
          </Card>
        </div>

        <div className="responsive-grid grid-two" style={{ marginTop: 16 }}>
          <Card style={{ padding: 16, maxHeight: 360, overflow: 'auto' }}>
            <SectionHeader
              title="What May Change Next"
              sub="Forward market direction first; model error stays available as supporting evidence."
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {supportedNames.slice(0, 3).map((name, idx) => {
                const q = forecastQueries[idx]
                return (
                  <ForecastCard
                    key={name}
                    name={name}
                    forecast={q?.data as ForecastResponse | undefined}
                    isLoading={q?.isLoading ?? true}
                    error={q?.error}
                  />
                )
              })}
            </div>
          </Card>

        </div>
      </div>
    </PageShell>
  )
}
