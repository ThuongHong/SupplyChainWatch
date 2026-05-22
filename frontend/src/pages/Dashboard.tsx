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
} from '../api/viewModels'
import type { PageId } from '../components/layout/Sidebar'

type FeedInsight = {
  text: string
  category: InsightCategory
  time: string
  aiGenerated?: boolean
}

const normalizeCategory = (category?: string | null): InsightCategory => {
  if (category === 'anomaly' || category === 'correlation' || category === 'forecast') return category
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
const shortReason = (row?: RiskScoreResponse) => row?.reasons?.[0] ?? row?.freshness_status ?? 'No live PortWatch score'
const demoPortRiskRows = (): RiskScoreResponse[] => MOCK.portRisk.map((item, index) => ({
  entity_id: `demo-${item.name}`,
  entity_name: item.name,
  entity_type: 'port',
  score: 78 - index * 7,
  severity: index < 2 ? 'high' : 'medium',
  component_scores: {},
  freshness_status: 'demo',
  as_of: new Date().toISOString(),
}))

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
  const portRiskRows = portRiskQuery.data ?? []
  const chokepointRows = chokepointRiskQuery.data ?? []
  const propagationRows = propagationQuery.data ?? []
  const freshnessRows = freshnessQuery.data ?? []
  const watchlistRows = watchlistQuery.data ?? []
  const topPort = portRiskRows[0]
  const topChokepoint = chokepointRows[0]
  const riskStoriesQuery = useQuery({
    queryKey: queryKeys.riskStories(topPort?.entity_id, 180, 5),
    queryFn: ({ signal }) => apiClient.riskStories({ entity_id: topPort?.entity_id, days: 180, limit: 5 }, { signal }),
    enabled: Boolean(topPort),
  })
  const riskForecastQuery = useQuery({
    queryKey: topPort ? queryKeys.riskEntityForecast(topPort.entity_id) : ['risk', 'forecast', 'no-entity'],
    queryFn: ({ signal }) => apiClient.riskEntityForecast(topPort!.entity_id, { signal }),
    enabled: Boolean(topPort),
  })
  const liveStats = statsQuery.data ?? null
  const apiError = portRiskQuery.error ?? chokepointRiskQuery.error ?? statsQuery.error ?? insightsQuery.error ?? congestionQuery.error ?? anomaliesQuery.error ?? riskStoriesQuery.error ?? riskForecastQuery.error ?? indexQueries.find(q => q.error)?.error
  const stale = isStale(liveStats?.generated_at, 6)
  const highAnomalies = activeHighAnomalies(anomaliesQuery.data ?? [])
  const risk = riskFromStats(liveStats, highAnomalies)
  const riskStoryRows = riskStoriesQuery.data ?? []
  const riskForecast = riskForecastQuery.data as EntityRiskForecastResponse | undefined
  const derivedRiskLive = portRiskRows.length > 0 || chokepointRows.length > 0
  const summaryUnavailable = !liveStats && !derivedRiskLive

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
  const useDemoPortRisk = shouldUseDemoRows({
    loading: portRiskQuery.isLoading,
    error: portRiskQuery.error,
    rowCount: portRiskRows.length,
    demoEnabled: ENABLE_DEMO_FALLBACK,
  })
  const displayedPortRiskRows = portRiskRows.length ? portRiskRows : useDemoPortRisk ? demoPortRiskRows() : []

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
              <button onClick={dismissTour} style={{ border: 0, borderRadius: 4, padding: '5px 10px', cursor: 'pointer', color: 'var(--accent-text)', background: 'var(--bg-elevated)' }}>Got it</button>
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

        <div style={{ display: 'grid', gridTemplateColumns: '1.35fr repeat(4, minmax(150px, 1fr))', gap: 12 }}>
          <Card style={{ padding: 16, border: `1px solid ${topPort?.severity === 'high' ? 'var(--danger)' : topPort?.severity === 'medium' ? 'var(--warning)' : 'var(--border-default)'}` }}>
            <SectionHeader
              title="PortWatch Intelligence"
              sub={topPort ? `${topPort.entity_name}: ${shortReason(topPort)}` : summaryUnavailable ? 'No live overview or PortWatch risk rows' : risk.detail}
              action={<Badge variant={topPort ? riskTone(topPort.severity) : summaryUnavailable ? 'default' : (risk.severity === 'high' ? 'danger' : risk.severity === 'medium' ? 'warning' : 'success')}>{topPort ? `${Math.round(topPort.score)}/100` : summaryUnavailable ? 'Unavailable' : risk.label}</Badge>}
            />
            <DataProvenance
              mode={rowDataMode({ loading: portRiskQuery.isLoading || chokepointRiskQuery.isLoading, error: portRiskQuery.error ?? chokepointRiskQuery.error, rowCount: Number(derivedRiskLive), demoEnabled: ENABLE_DEMO_FALLBACK })}
              source={derivedRiskLive ? 'PortWatch derived risk' : ENABLE_DEMO_FALLBACK ? 'Demo risk fallback enabled' : 'PortWatch derived risk unavailable'}
              timestamp={topPort ? `As of ${relativeTime(topPort.as_of)}` : liveStats ? `Updated ${relativeTime(liveStats.generated_at)}` : undefined}
              stale={topPort?.freshness_status === 'stale' || stale}
            />
          </Card>
          <MetricCard label="Top Port Risk" value={topPort ? `${riskScore(topPort)}` : '0'} sub={topPort?.entity_name ?? 'No score rows'} tone={topPort ? riskTone(topPort.severity) : 'info'} icon={<Icons.AlertTriangle size={15} />} footer={<Sparkline data={portRiskRows.slice(0, 8).map(row => row.score)} color="var(--danger)" width={90} height={28} />} />
          <MetricCard label="Chokepoint Stress" value={topChokepoint ? `${riskScore(topChokepoint)}` : '0'} sub={topChokepoint?.entity_name ?? 'No score rows'} tone={topChokepoint ? riskTone(topChokepoint.severity) : 'info'} icon={<Icons.Activity size={15} />} footer={<Sparkline data={chokepointRows.slice(0, 8).map(row => row.score)} color="var(--warning)" width={90} height={28} />} />
          <MetricCard label="Watchlist Vessels" value={fmtNum(watchlistRows.length)} sub={watchlistRows.length ? 'selective AIS layer' : 'No watchlist rows'} tone={watchlistRows.length ? 'success' : 'info'} icon={<Icons.Ship size={15} />} />
          <MetricCard label="Propagation Links" value={fmtNum(propagationRows.length)} sub={propagationRows.length ? 'downstream impact' : 'No active links'} tone={propagationRows.length > 0 ? 'warning' : 'success'} icon={<Icons.TrendingUp size={15} />} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(300px, 2fr)', gap: 12 }}>
          <Card style={{ padding: '16px', minWidth: 0 }}>
            <SectionHeader
              title="Global Port Risk Ranking"
              sub={portRiskRows.length ? `${portRiskRows.length} monitored ports scored` : useDemoPortRisk ? 'Demo fallback risk scores' : 'Awaiting PortWatch risk scores'}
              action={<DataProvenance mode={rowDataMode({ loading: portRiskQuery.isLoading, error: portRiskQuery.error, rowCount: portRiskRows.length, demoEnabled: ENABLE_DEMO_FALLBACK })} source="PortWatch · derived score" />}
            />
            {portRiskQuery.isLoading ? <SkeletonBlock height={200} /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {displayedPortRiskRows.slice(0, 7).map(row => (
                  <div key={row.entity_id} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 80px minmax(160px, 2fr)', gap: 10, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{row.entity_name}</span>
                    <Badge variant={riskTone(row.severity)}>{Math.round(row.score)}/100</Badge>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{shortReason(row)}</span>
                  </div>
                ))}
                {displayedPortRiskRows.length === 0 && <EmptyState title="No PortWatch risk score rows" detail="Run PortWatch collection and maritime risk scoring to populate this ranking." compact />}
              </div>
            )}
          </Card>

          <Card style={{ padding: '16px', minWidth: 0 }}>
            <SectionHeader
              title="Congestion Heatmap"
              sub={portRiskRows.length ? `${topPort?.entity_name ?? 'Port'} leads risk ranking` : 'No live risk overlay'}
              action={<DataProvenance mode={portRiskRows.length ? 'live' : congestionQuery.isLoading ? 'loading' : 'empty'} source="Risk heatmap" />}
            />
            <MiniMap height={176} congestion={congestionQuery.data ?? []} />
          </Card>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 2fr) minmax(260px, 1fr)', gap: 12 }}>
          <Card style={{ padding: '16px', minWidth: 0 }}>
            <SectionHeader title="Chokepoint Stress" sub="Suez, Panama, Malacca, Red Sea, Black Sea" />
            {(chokepointRows.length ? chokepointRows : []).slice(0, 5).map(row => (
              <div key={row.entity_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{row.entity_name}</span>
                <Badge variant={riskTone(row.severity)}>{Math.round(row.score)}</Badge>
              </div>
            ))}
            {!chokepointRiskQuery.isLoading && chokepointRows.length === 0 && <EmptyState title="No chokepoint score rows" detail="Run PortWatch collection and maritime risk scoring." compact />}
          </Card>
          <Card style={{ padding: '16px', minWidth: 0 }}>
            <SectionHeader title="Disruption Propagation" sub="Likely downstream route impact" />
            {(propagationRows.length ? propagationRows : []).slice(0, 4).map((row: DisruptionPropagationResponse) => (
              <div key={row.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{row.source_entity_name} → {row.target_entity_name}</span>
                  <span className="mono-num" style={{ fontSize: 11 }}>{Math.round(row.confidence * 100)}%</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>{row.route_lane ?? row.explanation}</div>
              </div>
            ))}
            {!propagationQuery.isLoading && propagationRows.length === 0 && <EmptyState title="No active propagation links" detail="Risk scores below configured propagation threshold." compact />}
          </Card>
          <Card style={{ padding: '16px', minWidth: 0 }}>
            <SectionHeader title="Source Freshness" sub="External data state" />
            {(freshnessRows.length ? freshnessRows : []).slice(0, 5).map(row => (
              <div key={row.source} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: 12 }}>{row.source}</span>
                <Badge variant={row.freshness_status === 'fresh' ? 'success' : row.freshness_status === 'stale' ? 'danger' : 'warning'}>{row.freshness_status}</Badge>
              </div>
            ))}
            {!freshnessQuery.isLoading && freshnessRows.length === 0 && <EmptyState title="No source freshness rows" detail="Collector status is unavailable until source runs are logged." compact />}
          </Card>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)', gap: 12 }}>
          <Card style={{ padding: '16px', minWidth: 0 }}>
            <SectionHeader
              title="Latest Insights"
              sub={liveInsights.length ? 'API narratives with AI badge when LLM text exists' : useDemoInsights ? 'Demo fallback narratives are labeled' : 'No live insight rows returned'}
              action={<button onClick={() => onNavigate?.('insights')} style={{ border: 0, background: 'transparent', cursor: 'pointer' }}><Badge variant="accent">Open Insights Hub</Badge></button>}
            />
            {!insightsQuery.isLoading && liveInsights.length === 0 && <DataProvenance mode={useDemoInsights ? 'demo' : 'empty'} source={useDemoInsights ? 'Explicit demo fallback enabled' : 'No live insight rows returned'} />}
            {insightsQuery.isLoading ? <SkeletonBlock height={160} lines={4} /> : insights.map((insight, i) => (
              <InsightRow key={`${insight.time}-${i}`} text={insight.text} category={insight.category} time={insight.time} aiGenerated={insight.aiGenerated ?? false} />
            ))}
            {!insightsQuery.isLoading && insights.length === 0 && <EmptyState title="No live insights" detail="Run insight generation after collectors populate source and risk tables." compact />}
          </Card>

          <Card style={{ padding: '16px', minWidth: 0 }}>
            <SectionHeader title="What Changed" sub="Operational deltas from live API rows." />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'BDI movement', value: bdiChange == null ? 'No live trend' : fmtPct(bdiChange), tone: bdiChange != null && bdiChange > 0 ? 'var(--success)' : 'var(--danger)' },
                { label: 'FBX movement', value: fbxChange == null ? 'No live trend' : fmtPct(fbxChange), tone: fbxChange != null && fbxChange > 0 ? 'var(--warning)' : 'var(--success)' },
                { label: 'High-pressure ports', value: congestionQuery.data?.length ? `${highPorts} flagged` : 'No live port rows', tone: highPorts > 0 ? 'var(--warning)' : 'var(--text-primary)' },
                { label: 'Latest sync', value: liveStats ? relativeTime(liveStats.generated_at) : 'Unavailable', tone: stale ? 'var(--warning)' : 'var(--text-primary)' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{row.label}</span>
                  <span className="mono-num" style={{ fontSize: 12, color: row.tone, fontWeight: 500 }}>{row.value}</span>
                </div>
              ))}
            </div>
            {!statsQuery.isLoading && !liveStats && <EmptyState title="Overview endpoint returned no usable summary" detail="Summary metrics stay unavailable in normal mode until the backend returns real rows." compact />}
          </Card>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)', gap: 12 }}>
          <Card style={{ padding: '16px', minWidth: 0 }}>
            <SectionHeader
              title="Risk Story Timeline"
              sub={topPort ? `${topPort.entity_name} historical events` : 'No ranked port selected'}
              action={<DataProvenance mode={rowDataMode({ loading: riskStoriesQuery.isLoading, error: riskStoriesQuery.error, rowCount: riskStoryRows.length, demoEnabled: false })} source="Real risk_story_events" />}
            />
            {riskStoriesQuery.isLoading ? <SkeletonBlock height={140} lines={4} /> : riskStoryRows.slice(0, 5).map((story: RiskStoryEventResponse) => (
              <div key={story.event_key} style={{ padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{story.entity_name} · {story.event_type.replace(/_/g, ' ')}</span>
                  <Badge variant={riskTone(story.severity)}>{Math.round(story.confidence * 100)}%</Badge>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>{story.narrative}</div>
              </div>
            ))}
            {!riskStoriesQuery.isLoading && riskStoryRows.length === 0 && <EmptyState title="No live risk story events" detail="Backfill history and refresh story generation; normal mode never fabricates event rows." compact />}
          </Card>

          <Card style={{ padding: '16px', minWidth: 0 }}>
            <SectionHeader
              title="Risk Forecast"
              sub={riskForecast?.data_sufficiency_status === 'sufficient' ? `${riskForecast.horizon_days}-day baseline` : 'Prediction needs enough real history'}
              action={<DataProvenance mode={riskForecastQuery.isLoading ? 'loading' : riskForecast?.data_sufficiency_status === 'sufficient' ? 'live' : 'empty'} source="Real risk feature snapshots" />}
            />
            {riskForecastQuery.isLoading ? <SkeletonBlock height={120} lines={3} /> : riskForecast?.data_sufficiency_status === 'sufficient' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <MetricCard label="Forecast Confidence" value={`${Math.round(riskForecast.confidence * 100)}%`} tone={riskForecast.confidence >= 0.6 ? 'success' : 'warning'} />
                <Sparkline data={riskForecast.predictions.map(point => Number(point.risk_score ?? 0))} color="var(--accent)" width={220} height={50} />
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Model: {riskForecast.model_name ?? 'baseline'} · train {riskForecast.train_window_start ?? 'n/a'} to {riskForecast.train_window_end ?? 'n/a'}</div>
              </div>
            ) : (
              <EmptyState title="Forecast unavailable" detail={riskForecast?.unavailable_reason ?? 'Need enough historical feature snapshots before prediction.'} compact />
            )}
          </Card>
        </div>
      </div>
    </PageShell>
  )
}
