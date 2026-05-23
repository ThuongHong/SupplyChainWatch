import React, { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Card } from '../components/Card'
import { Badge } from '../components/Badge'
import { InsightRow, type InsightCategory } from '../components/InsightRow'
import { Sparkline } from '../components/Sparkline'
import {
  DataProvenance,
  EmptyState,
  ErrorPanel,
  PageShell,
  SectionHeader,
  SkeletonBlock,
} from '../components/DataState'
import {
  apiClient,
  type AnomalyResponse,
  type CorrelationCell,
  type DataCoverageResponse,
  type EntityRiskForecastResponse,
  type ForecastResponse,
  type InsightResponse,
  type RiskScoreResponse,
  type RiskStoryEventResponse,
  type StoryAnalyzeResponse,
  type StoryEntity,
} from '../api/client'
import { ENABLE_DEMO_FALLBACK } from '../api/config'
import { queryKeys } from '../api/queries'
import {
  forecastLower,
  forecastPoints,
  forecastTimestamp,
  forecastUpper,
  forecastValue,
  metricValue,
  relativeTime,
  rowDataMode,
  shouldUseDemoRows,
} from '../api/viewModels'

type CatFilter = 'all' | InsightCategory
type FeedInsight = {
  title: string
  text: string
  category: InsightCategory
  time: string
  aiGenerated?: boolean
  model?: string | null
  metrics?: Record<string, unknown> | null
  confidence?: number | null
  attentionLevel?: string | null
  eventType?: string | null
  affectedEntities?: Array<Record<string, unknown>> | null
  sourceMetrics?: Record<string, unknown> | null
}

const CATS: CatFilter[] = ['all', 'port_risk', 'risk_story', 'data_quality', 'correlation', 'trend', 'anomaly', 'forecast']
const CAT_LABELS: Record<CatFilter, string> = { all: 'All', port_risk: 'Port Risk', risk_story: 'Risk Story', data_quality: 'Data Quality', correlation: 'Correlation', trend: 'Trend', anomaly: 'Anomaly', forecast: 'Forecast' }

const DEMO_INSIGHTS: FeedInsight[] = [
  { title: 'Demo trend', text: 'BDI surged over several sessions, a pattern to verify against live freight_indices data.', category: 'trend', time: 'demo', aiGenerated: false },
  { title: 'Demo anomaly', text: 'Shanghai port pressure is shown as an example until the backend returns current insight rows.', category: 'anomaly', time: 'demo', aiGenerated: false },
  { title: 'Demo correlation', text: 'Container indices often co-move; live correlation cells replace this fallback when available.', category: 'correlation', time: 'demo', aiGenerated: false },
]

const normalizeCategory = (category?: string | null): InsightCategory => {
  if (category === 'anomaly' || category === 'correlation' || category === 'forecast' || category === 'risk_story' || category === 'data_quality' || category === 'port_risk') return category
  return 'trend'
}

const insightText = (insight: InsightResponse) => insight.narrative_llm || insight.narrative
const displayName = (name: string) => name === 'FBX_GLOBAL' ? 'FBX' : name === 'WCI_GLOBAL' ? 'WCI' : name
const apiName = (label: string) => label === 'FBX' ? 'FBX_GLOBAL' : label === 'WCI' ? 'WCI_GLOBAL' : label
const metricBadgeValue = (value: unknown): string => {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  if (typeof value === 'string' || typeof value === 'boolean') return String(value)
  if (value && typeof value === 'object') return 'structured'
  return 'n/a'
}

const entityBadgeLabel = (entity: Record<string, unknown>): string => {
  const name = entity.name ?? entity.id
  const type = entity.type ? `${entity.type}: ` : ''
  return `${type}${String(name ?? 'entity')}`
}

const corrToColor = (v: number | null) => {
  if (v == null) return 'var(--bg-hover)'
  const abs = Math.abs(v)
  if (abs >= 0.85) return v > 0 ? 'rgba(34,197,94,0.62)' : 'rgba(239,68,68,0.62)'
  if (abs >= 0.65) return v > 0 ? 'rgba(34,197,94,0.38)' : 'rgba(239,68,68,0.38)'
  if (abs >= 0.4) return 'rgba(59,130,246,0.25)'
  return 'rgba(59,130,246,0.08)'
}

const correlationValue = (matrix: CorrelationCell[], row: string, col: string) => {
  if (row === col) return 1
  const a = apiName(row)
  const b = apiName(col)
  const hit = matrix.find(c =>
    (c.index_a === a && c.index_b === b) ||
    (c.index_a === b && c.index_b === a)
  )
  return hit?.correlation ?? null
}

const CorrelationHeatmap: React.FC<{ data: CorrelationCell[]; labels: string[]; demo: boolean }> = ({ data, labels, demo }) => {
  const finalLabels = labels.length >= 2 ? labels : demo ? ['BDI', 'FBX', 'WCI'] : []
  if (finalLabels.length < 2 || (!demo && data.length === 0)) {
    return (
      <div>
        <EmptyState title="No correlation rows" detail="Correlation cells need at least two live freight index series with overlapping history." compact />
        <DataProvenance mode="empty" source="/api/correlations" />
      </div>
    )
  }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: `44px repeat(${finalLabels.length}, 1fr)`, gap: 3, alignItems: 'center' }}>
        <div />
        {finalLabels.map(label => <div key={label} style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'center' }}>{label}</div>)}
        {finalLabels.map(row => (
          <React.Fragment key={row}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'right', paddingRight: 6 }}>{row}</div>
            {finalLabels.map(col => {
              const live = correlationValue(data, row, col)
              const value = demo && live == null ? (row === col ? 1 : row === 'BDI' ? 0.42 : 0.76) : live
              return (
                <div key={`${row}-${col}`} style={{
                  aspectRatio: '1', borderRadius: 4,
                  background: row === col ? 'var(--bg-hover)' : corrToColor(value),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
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
      <DataProvenance mode={demo ? 'demo' : 'live'} source={demo ? 'Explicit demo correlation matrix' : 'Aligned daily freight index correlations'} />
    </div>
  )
}

const ForecastCard: React.FC<{ name: string; forecast?: ForecastResponse; isLoading: boolean; error: unknown }> = ({ name, forecast, isLoading, error }) => {
  const points = forecastPoints(forecast).slice(0, forecast?.horizon_days ?? 14)
  const usable = points.map(point => ({ point, value: forecastValue(point), lower: forecastLower(point), upper: forecastUpper(point) })).filter(item => item.value != null)
  const mape = metricValue(forecast?.metrics, 'mape') ?? metricValue(forecast?.metrics, 'MAPE')

  return (
    <Card style={{ padding: 14 }}>
      <SectionHeader
        title={`${displayName(name)} Forecast`}
        sub={forecast ? `${forecast.model_name ?? 'model'} · generated ${relativeTime(forecast.created_at)}` : 'Backend forecast row not available'}
        action={mape == null ? <Badge variant="default">Reliability n/a</Badge> : <Badge variant={mape <= 15 ? 'success' : mape <= 30 ? 'warning' : 'danger'}>MAPE {mape.toFixed(1)}%</Badge>}
      />
      {isLoading && <SkeletonBlock height={92} />}
      {!isLoading && Boolean(error) && <EmptyState title="No forecast yet" detail={error instanceof Error ? error.message : 'Missing forecast row.'} compact />}
      {!isLoading && !error && usable.length > 0 && (
        <svg width="100%" viewBox="0 0 260 90" style={{ display: 'block' }} role="img" aria-label={`${displayName(name)} forecast with uncertainty`}>
          {(() => {
            const vals = usable.flatMap(item => [item.value, item.lower, item.upper]).filter((v): v is number => typeof v === 'number')
            const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1
            const toX = (i: number) => 24 + (i / Math.max(usable.length - 1, 1)) * 220
            const toY = (v: number) => 8 + (1 - (v - min) / range) * 60
            const line = usable.map((item, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(item.value ?? 0).toFixed(1)}`).join(' ')
            const bandPoints = usable.filter(item => item.lower != null && item.upper != null)
            const band = bandPoints.length > 1
              ? 'M' + bandPoints.map((item, i) => `${toX(i).toFixed(1)},${toY(item.upper ?? 0).toFixed(1)}`).join(' L') +
              ' L' + bandPoints.slice().reverse().map((item, i) => `${toX(bandPoints.length - 1 - i).toFixed(1)},${toY(item.lower ?? 0).toFixed(1)}`).join(' L') + ' Z'
              : ''
            return (
              <>
                {band && <path d={band} fill="var(--chart-2)" opacity="0.14" />}
                <path d={line} fill="none" stroke="var(--chart-2)" strokeWidth="1.7" strokeDasharray="4,3" />
                <text x="24" y="86" style={{ fontSize: 9, fill: 'var(--text-muted)' }}>{forecastTimestamp(usable[0].point)?.slice(5, 10) ?? 'start'}</text>
                <text x="216" y="86" style={{ fontSize: 9, fill: 'var(--text-muted)' }}>{forecastTimestamp(usable[usable.length - 1].point)?.slice(5, 10) ?? 'end'}</text>
              </>
            )
          })()}
        </svg>
      )}
      {forecast?.commentary && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{forecast.commentary}</div>}
    </Card>
  )
}

const liveAnomalyEvents = (anomalies: AnomalyResponse[]) => anomalies.slice(0, 12).map(anomaly => {
  const ageMs = Date.now() - new Date(anomaly.detected_at).getTime()
  const ageDays = Math.max(0, Math.min(90, Math.round(ageMs / 86400000)))
  return {
    day: 90 - ageDays,
    severity: anomaly.severity,
    label: anomaly.explanation || anomaly.description || `${anomaly.entity_type} ${anomaly.entity_id}`,
  }
})

const SEV_COLOR: Record<string, string> = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--accent)' }
const riskTone = (severity?: string) => severity === 'high' ? 'danger' : severity === 'medium' ? 'warning' : 'success'
const compactType = (type?: string) => (type ?? 'entity').replace(/_/g, ' ')

const forecastRiskScore = (point: Record<string, unknown>): number | null => {
  const value = point.risk_score ?? point.yhat ?? point.prediction ?? point.value
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const CoverageRows: React.FC<{ rows: DataCoverageResponse[] }> = ({ rows }) => {
  if (rows.length === 0) {
    return <EmptyState title="No coverage rows" detail="Coverage appears after risk refresh records source depth for monitored entities." compact />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.slice(0, 4).map(row => (
        <div key={`${row.source}-${row.entity_id}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 1fr) 70px 92px', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{row.source}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.observed_rows} rows · {row.expected_days} expected days</div>
          </div>
          <Badge variant={row.missing_days > 10 ? 'danger' : row.missing_days > 0 ? 'warning' : 'success'}>{row.missing_days} gaps</Badge>
          <Badge variant={row.freshness_status === 'fresh' ? 'success' : row.freshness_status === 'stale' ? 'danger' : 'warning'}>{row.freshness_status}</Badge>
        </div>
      ))}
    </div>
  )
}

const RiskStoryWorkbench: React.FC<{
  entities: RiskScoreResponse[]
  selectedEntityId: string
  onSelectEntity: (id: string) => void
  stories: RiskStoryEventResponse[]
  coverage: DataCoverageResponse[]
  forecast?: EntityRiskForecastResponse
  loading: boolean
}> = ({ entities, selectedEntityId, onSelectEntity, stories, coverage, forecast, loading }) => {
  const selected = entities.find(row => row.entity_id === selectedEntityId) ?? entities[0]
  const predictedScores = (forecast?.predictions ?? []).map(forecastRiskScore).filter((value): value is number => value != null)
  const gapDays = coverage.reduce((sum, row) => sum + row.missing_days, 0)
  return (
    <Card style={{ padding: 16 }}>
      <SectionHeader
        title="Risk Story Workbench"
        sub={selected ? `${selected.entity_name} · ${compactType(selected.entity_type)} · ${Math.round(selected.score)}/100` : 'Waiting for ranked PortWatch entities'}
        action={<DataProvenance mode={selected ? 'live' : loading ? 'loading' : 'empty'} source="Real risk stories, coverage, forecasts" />}
      />
      {entities.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {entities.slice(0, 8).map(entity => (
            <button key={entity.entity_id} onClick={() => onSelectEntity(entity.entity_id)} style={{
              border: '1px solid var(--border-subtle)', borderRadius: 5, padding: '5px 9px', cursor: 'pointer',
              background: selectedEntityId === entity.entity_id ? 'var(--accent-muted)' : 'var(--bg-elevated)',
              color: selectedEntityId === entity.entity_id ? 'var(--accent-text)' : 'var(--text-secondary)',
              fontSize: 11, fontWeight: 600,
            }}>{entity.entity_name}</button>
          ))}
        </div>
      )}
      {loading ? <SkeletonBlock height={190} lines={5} /> : selected ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
              <Badge variant={riskTone(selected.severity)}>{selected.severity}</Badge>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Coverage gaps: {gapDays} days</span>
            </div>
            {stories.slice(0, 4).map(story => (
              <div key={story.event_key} style={{ padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{story.event_type.replace(/_/g, ' ')} · {story.metric}</span>
                  <Badge variant={riskTone(story.severity)}>{story.attention_level}</Badge>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, marginTop: 4 }}>{story.narrative}</div>
              </div>
            ))}
            {stories.length === 0 && <EmptyState title="No story events for selected entity" detail="No fabricated timeline; event detector needs enough feature snapshots and threshold movement." compact />}
          </div>
          <div style={{ minWidth: 0 }}>
            <CoverageRows rows={coverage} />
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Forecast readiness</span>
                <Badge variant={forecast?.data_sufficiency_status === 'sufficient' ? 'success' : 'warning'}>{forecast?.data_sufficiency_status ?? 'unknown'}</Badge>
              </div>
              {forecast?.data_sufficiency_status === 'sufficient' && predictedScores.length > 0 ? (
                <>
                  <Sparkline data={predictedScores} color="var(--accent)" width={210} height={44} />
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                    Confidence {Math.round(forecast.confidence * 100)}% · train {forecast.train_window_start ?? 'n/a'} to {forecast.train_window_end ?? 'n/a'}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{forecast?.unavailable_reason ?? 'Need historical snapshots before forecast generation.'}</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <EmptyState title="No ranked risk entities" detail="Run PortWatch collection and maritime risk scoring to unlock the workbench." compact />
      )}
    </Card>
  )
}

const AnomalyTimeline: React.FC<{ anomalies: AnomalyResponse[]; demo: boolean }> = ({ anomalies, demo }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const events = anomalies.length > 0 ? liveAnomalyEvents(anomalies) : [
    { day: 18, severity: 'medium', label: 'Demo FBX movement' },
    { day: 52, severity: 'high', label: 'Demo LA/LB queue' },
    { day: 83, severity: 'high', label: 'Demo Shanghai congestion' },
  ].filter(() => demo)
  if (events.length === 0) {
    return (
      <div>
        <EmptyState title="No live anomaly rows" detail="Anomaly events appear after detection jobs write backend rows." compact />
        <DataProvenance mode="empty" source="/api/anomalies" />
      </div>
    )
  }
  return (
    <div>
      <div style={{ position: 'relative', height: 72, marginTop: 4 }}>
        <div style={{ position: 'absolute', top: 28, left: 0, right: 0, height: 1, background: 'var(--border-subtle)' }} />
        {events.map((event, i) => (
          <div key={i} style={{ position: 'absolute', left: `${(event.day / 90) * 100}%`, top: 22, transform: 'translateX(-50%)' }}
            onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
            <div style={{ width: event.severity === 'high' ? 12 : 10, height: event.severity === 'high' ? 12 : 10, borderRadius: '50%', background: SEV_COLOR[event.severity] ?? 'var(--accent)', cursor: 'pointer' }} />
            {hoverIdx === i && (
              <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', width: 260, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '4px 8px', whiteSpace: 'nowrap', zIndex: 5, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11, color: 'var(--text-primary)', boxShadow: 'var(--shadow-md)' }}>
                {event.label}
              </div>
            )}
          </div>
        ))}
        {['90d ago', '60d ago', '30d ago', 'Today'].map((label, i) => (
          <div key={label} style={{ position: 'absolute', bottom: 0, left: `${(i / 3) * 100}%`, transform: 'translateX(-50%)', fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
        ))}
      </div>
      <DataProvenance mode={demo ? 'demo' : 'live'} source={demo ? 'Explicit demo anomaly examples' : '/api/anomalies'} />
    </div>
  )
}

const STORY_PAIRS: { label: string; entityA: StoryEntity; entityB: StoryEntity }[] = [
  { label: 'BDI × FBX', entityA: { type: 'index', id: 'BDI' }, entityB: { type: 'index', id: 'FBX_GLOBAL' } },
  { label: 'Shanghai × FBX', entityA: { type: 'port', id: 'Shanghai' }, entityB: { type: 'index', id: 'FBX_GLOBAL' } },
  { label: 'Suez × WCI', entityA: { type: 'chokepoint', id: 'suez_canal' }, entityB: { type: 'index', id: 'WCI_GLOBAL' } },
]

const StoryMode: React.FC = () => {
  const [selected, setSelected] = useState(0)
  const pair = STORY_PAIRS[selected]
  const storyQuery = useQuery<StoryAnalyzeResponse>({
    queryKey: queryKeys.story(pair.label),
    queryFn: ({ signal }) => apiClient.storyAnalyze({ entity_a: pair.entityA, entity_b: pair.entityB, period_days: 90 }, { signal }),
    retry: false,
  })
  const storyUsesTemplate = storyQuery.data?.narrative.includes('template summary is shown') ?? false

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {STORY_PAIRS.map((item, i) => (
          <button key={item.label} onClick={() => setSelected(i)} style={{
            padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 500, background: selected === i ? 'var(--accent-muted)' : 'var(--bg-hover)',
            color: selected === i ? 'var(--accent-text)' : 'var(--text-muted)',
          }}>{item.label}</button>
        ))}
      </div>
      <div style={{ padding: 14, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <Badge variant="accent">{pair.entityA.id}</Badge>
          <Badge variant="info">{pair.entityB.id}</Badge>
          {storyQuery.data && (
            <Badge variant={storyUsesTemplate ? 'default' : 'success'}>
              {storyUsesTemplate ? 'Template' : 'AI-generated'}
            </Badge>
          )}
        </div>
        {storyQuery.isLoading && <SkeletonBlock height={100} />}
        {storyQuery.error && <ErrorPanel error={storyQuery.error} title="Story Mode unavailable" compact />}
        {storyQuery.data && (
          <>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>{storyQuery.data.headline}</div>
            <div style={{ whiteSpace: 'pre-line' }}>{storyQuery.data.narrative}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {storyQuery.data.key_findings.slice(0, 3).map(finding => <Badge key={finding} variant="default">{finding}</Badge>)}
            </div>
            {storyQuery.data.caveats.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Caveats</div>
                {storyQuery.data.caveats.map(caveat => <div key={caveat} style={{ fontSize: 12 }}>{caveat}</div>)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export const InsightsHub: React.FC = () => {
  const [catFilter, setCatFilter] = useState<CatFilter>('all')
  const insightsQuery = useQuery({
    queryKey: queryKeys.insights(20),
    queryFn: ({ signal }) => apiClient.latestInsights(20, { signal }),
  })
  const indicesQuery = useQuery({
    queryKey: queryKeys.indices,
    queryFn: ({ signal }) => apiClient.indices({ signal }),
  })
  const anomaliesQuery = useQuery({
    queryKey: queryKeys.anomalies(90),
    queryFn: ({ signal }) => apiClient.anomalies({ days: 90 }, { signal }),
  })
  const portRiskQuery = useQuery({
    queryKey: queryKeys.globalPortRisk(12),
    queryFn: ({ signal }) => apiClient.globalPortRisk(12, { signal }),
  })
  const chokepointRiskQuery = useQuery({
    queryKey: queryKeys.chokepointStress(12),
    queryFn: ({ signal }) => apiClient.chokepointStress(12, { signal }),
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
  const [selectedRiskEntityId, setSelectedRiskEntityId] = useState('')
  const riskEntities = useMemo(() => [
    ...(portRiskQuery.data ?? []),
    ...(chokepointRiskQuery.data ?? []),
  ].sort((a, b) => b.score - a.score), [portRiskQuery.data, chokepointRiskQuery.data])
  const activeRiskEntityId = selectedRiskEntityId && riskEntities.some(row => row.entity_id === selectedRiskEntityId)
    ? selectedRiskEntityId
    : riskEntities[0]?.entity_id || ''
  const riskCoverageQuery = useQuery({
    queryKey: queryKeys.riskCoverage(activeRiskEntityId || undefined),
    queryFn: ({ signal }) => apiClient.riskCoverage(activeRiskEntityId || undefined, { signal }),
    enabled: Boolean(activeRiskEntityId),
  })
  const riskStoriesQuery = useQuery({
    queryKey: queryKeys.riskStories(activeRiskEntityId || undefined, 180, 8),
    queryFn: ({ signal }) => apiClient.riskStories({ entity_id: activeRiskEntityId, days: 180, limit: 8 }, { signal }),
    enabled: Boolean(activeRiskEntityId),
  })
  const riskForecastQuery = useQuery({
    queryKey: activeRiskEntityId ? queryKeys.riskEntityForecast(activeRiskEntityId) : ['risk', 'forecast', 'no-entity'],
    queryFn: ({ signal }) => apiClient.riskEntityForecast(activeRiskEntityId, { signal }),
    enabled: Boolean(activeRiskEntityId),
    retry: false,
  })

  const liveFeed = useMemo<FeedInsight[]>(() => (insightsQuery.data ?? []).map((insight: InsightResponse) => ({
    title: insight.title,
    text: insightText(insight),
    category: normalizeCategory(insight.category),
    time: relativeTime(insight.narrative_generated_at || insight.generated_at),
    aiGenerated: Boolean(insight.narrative_llm),
    model: insight.narrative_model,
    metrics: insight.metrics,
    confidence: insight.confidence,
    attentionLevel: insight.attention_level,
    eventType: insight.event_type,
    affectedEntities: insight.affected_entities,
    sourceMetrics: insight.source_metrics,
  })), [insightsQuery.data])
  const usingDemoFeed = shouldUseDemoRows({
    loading: insightsQuery.isLoading,
    error: insightsQuery.error,
    rowCount: liveFeed.length,
    demoEnabled: ENABLE_DEMO_FALLBACK,
  })
  const feed = usingDemoFeed ? DEMO_INSIGHTS : liveFeed
  const filtered = catFilter === 'all' ? feed : feed.filter(item => item.category === catFilter)
  const error = insightsQuery.error ?? indicesQuery.error ?? anomaliesQuery.error ?? correlationsQuery.error ?? portRiskQuery.error ?? chokepointRiskQuery.error ?? riskCoverageQuery.error ?? riskStoriesQuery.error ?? riskForecastQuery.error
  const labels = supportedNames.map(displayName)
  const useDemoCorrelations = shouldUseDemoRows({
    loading: correlationsQuery.isLoading,
    error: correlationsQuery.error,
    rowCount: correlationsQuery.data?.length ?? 0,
    demoEnabled: ENABLE_DEMO_FALLBACK,
  })
  const useDemoAnomalies = shouldUseDemoRows({
    loading: anomaliesQuery.isLoading,
    error: anomaliesQuery.error,
    rowCount: anomaliesQuery.data?.length ?? 0,
    demoEnabled: ENABLE_DEMO_FALLBACK,
  })

  return (
    <PageShell
      title="Insights Hub"
      subtitle="Evidence-backed narratives, correlations, forecasts, anomalies, and Story Mode."
      action={<DataProvenance mode={rowDataMode({ loading: insightsQuery.isLoading, error: insightsQuery.error, rowCount: liveFeed.length, demoEnabled: ENABLE_DEMO_FALLBACK })} source={usingDemoFeed ? 'Explicit demo fallback enabled' : '/api/insights/latest'} />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <ErrorPanel error={error} title="One or more insight APIs are unavailable" compact />}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
              {CATS.map(category => (
                <button key={category} onClick={() => setCatFilter(category)} style={{
                  padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500, background: catFilter === category ? 'var(--accent-muted)' : 'transparent',
                  color: catFilter === category ? 'var(--accent-text)' : 'var(--text-muted)',
                }}>{CAT_LABELS[category]}</button>
              ))}
            </div>
            <Card style={{ padding: '4px 16px' }}>
              {insightsQuery.isLoading && <SkeletonBlock height={180} lines={5} />}
              {!insightsQuery.isLoading && usingDemoFeed && <DataProvenance mode="demo" source="Explicit demo examples until insight rows exist" />}
              {filtered.map((insight, i) => (
                <div key={`${insight.title}-${i}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <InsightRow text={insight.text} category={insight.category} time={insight.time} aiGenerated={insight.aiGenerated ?? false} />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '-8px 0 10px 40px' }}>
                    <Badge variant="default">{insight.title}</Badge>
                    {insight.model && <Badge variant="info">{insight.model}</Badge>}
                    {insight.attentionLevel && <Badge variant={insight.attentionLevel === 'urgent' ? 'danger' : insight.attentionLevel === 'watch' ? 'warning' : 'default'}>{insight.attentionLevel}</Badge>}
                    {typeof insight.confidence === 'number' && <Badge variant="default">{Math.round(insight.confidence * 100)}% confidence</Badge>}
                    {insight.eventType && <Badge variant="default">{insight.eventType.replace(/_/g, ' ')}</Badge>}
                    {insight.affectedEntities?.slice(0, 2).map(entity => <Badge key={entityBadgeLabel(entity)} variant="accent">{entityBadgeLabel(entity)}</Badge>)}
                    {insight.sourceMetrics?.source != null && <Badge variant="info">source: {String(insight.sourceMetrics.source)}</Badge>}
                    {insight.metrics && Object.keys(insight.metrics).slice(0, 2).map(key => <Badge key={key} variant="default">{key}: {metricBadgeValue(insight.metrics?.[key])}</Badge>)}
                  </div>
                </div>
              ))}
              {!insightsQuery.isLoading && filtered.length === 0 && (
                <EmptyState
                  title={feed.length === 0 ? 'No live insights' : 'No insights in this category'}
                  detail={feed.length === 0 ? 'Insight feed stays empty in normal mode until analysis jobs generate rows.' : 'Change filter or wait for analysis jobs to generate rows.'}
                />
              )}
            </Card>
          </div>

          <Card style={{ padding: 16 }}>
            <SectionHeader title="Correlation Heatmap" sub={labels.length ? labels.join(' · ') : 'Waiting for index overlap'} />
            {correlationsQuery.isLoading ? <SkeletonBlock height={140} /> : <CorrelationHeatmap data={correlationsQuery.data ?? []} labels={labels} demo={useDemoCorrelations} />}
          </Card>
        </div>

        <Card style={{ padding: 16 }}>
          <SectionHeader title="Forecast Reliability" sub="Forecast cards use backend uncertainty and MAPE when available." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
            {supportedNames.slice(0, 3).map((name, i) => (
              <ForecastCard key={name} name={name} forecast={forecastQueries[i]?.data} isLoading={forecastQueries[i]?.isLoading ?? false} error={forecastQueries[i]?.error} />
            ))}
            {supportedNames.length === 0 && <EmptyState title="No forecast candidates" detail="The indices endpoint did not return BDI, FBX, WCI, or alternate series." />}
          </div>
        </Card>

        <RiskStoryWorkbench
          entities={riskEntities}
          selectedEntityId={activeRiskEntityId}
          onSelectEntity={setSelectedRiskEntityId}
          stories={riskStoriesQuery.data ?? []}
          coverage={riskCoverageQuery.data ?? []}
          forecast={riskForecastQuery.data}
          loading={portRiskQuery.isLoading || chokepointRiskQuery.isLoading || riskCoverageQuery.isLoading || riskStoriesQuery.isLoading || riskForecastQuery.isLoading}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
          <Card style={{ padding: 16 }}>
            <SectionHeader title="Anomaly Timeline" sub="90-day anomaly events with explicit fallback state." />
            {anomaliesQuery.isLoading ? <SkeletonBlock height={94} /> : <AnomalyTimeline anomalies={anomaliesQuery.data ?? []} demo={useDemoAnomalies} />}
          </Card>
          <Card style={{ padding: 16 }}>
            <SectionHeader title="Story Mode" sub="LLM-assisted relationship analysis with caveats." />
            <StoryMode />
          </Card>
        </div>
      </div>
    </PageShell>
  )
}
