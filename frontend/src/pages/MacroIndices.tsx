import React, { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { apiClient, type CorrelationCell, type ForecastResponse, type IndexPoint, type IndexSummary } from '../api/client'
import { queryKeys } from '../api/queries'
import {
  DataProvenance,
  EmptyState,
  ErrorPanel,
  MetricCard,
  PageShell,
  SectionHeader,
  SkeletonBlock,
} from '../components/DataState'
import { Badge } from '../components/Badge'
import { Card } from '../components/Card'
import { fmtNum, fmtPct } from '../data/mock'
import {
  forecastLower,
  forecastPoints,
  forecastTimestamp,
  forecastUpper,
  forecastValue,
  latestPoint,
  metricValue,
  normalizeSeries,
  percentChange,
  relativeTime,
} from '../api/viewModels'

const PERIODS = ['30D', '90D', '1Y', 'All'] as const
type Period = typeof PERIODS[number]
type Mode = 'raw' | 'normalized'
const PERIOD_DAYS: Record<Period, number | null> = { '30D': 30, '90D': 90, '1Y': 365, All: null }
const COLORS = ['#3B82F6', '#06B6D4', '#A78BFA', '#F59E0B', '#22C55E', '#EF4444', '#EC4899', '#94A3B8']
const ALLOWED_INDICES = new Set(['DCOILBRENTEU', 'T10Y2Y', 'RSAFS'])

interface IndexMeta extends IndexSummary {
  color: string
  label: string
  abbr: string
}

const preferredOrder = ['BDI', 'FBX_GLOBAL', 'WCI_GLOBAL', 'DCOILBRENTEU', 'DTWEXBGS', 'INDPRO']

const friendlyName = (name: string): string => ({
  BDI: 'Baltic Dry Index',
  FBX_GLOBAL: 'Freightos Baltic Global',
  WCI_GLOBAL: 'Drewry World Container Index',
  DCOILBRENTEU: 'Brent Crude Oil',
  DTWEXBGS: 'Trade Weighted U.S. Dollar',
  INDPRO: 'U.S. Industrial Production',
  CPIAUCSL: 'U.S. Consumer Price Index',
  FEDFUNDS: 'Federal Funds Rate',
  DGS10: '10-Year Treasury Yield',
  T10Y2Y: '10Y-2Y Treasury Spread',
  PAYEMS: 'U.S. Nonfarm Payrolls',
  RSAFS: 'U.S. Retail Sales',
}[name] ?? name.replace(/_/g, ' '))

const shortName = (name: string): string => ({
  BDI: 'BDI',
  FBX_GLOBAL: 'FBX',
  WCI_GLOBAL: 'WCI',
  DCOILBRENTEU: 'BRENT',
  DTWEXBGS: 'USD',
  INDPRO: 'INDPRO',
  CPIAUCSL: 'CPI',
  FEDFUNDS: 'FED',
  DGS10: '10Y',
  T10Y2Y: '10Y-2Y',
  PAYEMS: 'PAYROLLS',
  RSAFS: 'RETAIL',
}[name] ?? name.split('_').slice(0, 2).join(' '))

const valuePrefix = (name: string): string => (name === 'DCOILBRENTEU' || name === 'FBX_GLOBAL' || name === 'WCI_GLOBAL' ? '$' : '')
const valueUnit = (name: string): string => {
  if (['FEDFUNDS', 'DGS10', 'T10Y2Y'].includes(name)) return '%'
  if (name === 'PAYEMS') return 'k'
  if (name === 'RSAFS') return 'M'
  return ''
}

const strongestCorrelation = (cells: CorrelationCell[]): CorrelationCell | null => cells
  .filter(cell => cell.index_a !== cell.index_b && typeof cell.correlation === 'number')
  .sort((a, b) => Math.abs(b.correlation ?? 0) - Math.abs(a.correlation ?? 0))[0] ?? null

const periodSlice = (points: IndexPoint[], period: Period) => {
  const days = PERIOD_DAYS[period]
  if (days === null) return points
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return points.filter(point => new Date(point.time).getTime() >= cutoff)
}

const PillButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{
    padding: '4px 11px', borderRadius: 4, border: 0, cursor: 'pointer', fontSize: 12, fontWeight: 500,
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
  }}>{children}</button>
)

const CheckPill: React.FC<{ label: string; color: string; checked: boolean; onChange: () => void }> = ({ label, color, checked, onChange }) => (
  <button onClick={onChange} style={{
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px',
    borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 500,
    background: checked ? 'var(--bg-hover)' : 'transparent',
    color: checked ? 'var(--text-primary)' : 'var(--text-muted)',
    border: `1px solid ${checked ? 'var(--border-default)' : 'transparent'}`,
  }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, opacity: checked ? 1 : 0.4 }} />
    {label}
  </button>
)

interface ChartProps {
  indices: IndexMeta[]
  activeNames: string[]
  histories: Record<string, IndexPoint[]>
  period: Period
  mode: Mode
}

const MacroChart: React.FC<ChartProps> = ({ indices, activeNames, histories, period, mode }) => {
  const [hover, setHover] = useState<{ idx: number; x: number } | null>(null)
  const W = 940, H = 340
  const pad = { top: 16, right: 20, bottom: 32, left: 58 }
  const cw = W - pad.left - pad.right
  const ch = H - pad.top - pad.bottom
  const active = indices.filter(ix => activeNames.includes(ix.index_name))
  const series = active.map(ix => {
    const points = periodSlice(histories[ix.index_name] ?? [], period)
    const values = mode === 'normalized' ? normalizeSeries(points) : points.map(point => point.value)
    return { ix, points, values }
  }).filter(item => item.points.length > 1)
  const values = series.flatMap(item => item.values)
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 1
  const range = max - min || 1
  const yPad = range * 0.08
  const yMin = min - yPad
  const yRange = range + yPad * 2
  const maxLen = Math.max(1, ...series.map(item => item.points.length))
  const toX = (i: number, len: number) => pad.left + (i / Math.max(len - 1, 1)) * cw
  const toY = (v: number) => pad.top + (1 - (v - yMin) / yRange) * ch
  const ticks = Array.from({ length: 6 }, (_, i) => yMin + (i / 5) * yRange)

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const rawX = (e.clientX - rect.left) * (W / rect.width)
    const x = Math.max(pad.left, Math.min(W - pad.right, rawX))
    setHover({ idx: Math.round(((x - pad.left) / cw) * (maxLen - 1)), x })
  }

  if (series.length === 0) {
    return <EmptyState title="No index points for this selection" detail="Pick a broader period or wait for collectors to populate freight_indices." />
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Macro index comparison chart">
      {ticks.map((value, i) => {
        const y = toY(value)
        return (
          <React.Fragment key={i}>
            <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="var(--chart-grid)" />
            <text x={pad.left - 8} y={y + 3.5} textAnchor="end" style={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>
              {mode === 'normalized' ? value.toFixed(0) : fmtNum(value)}
            </text>
          </React.Fragment>
        )
      })}
      {series.map(({ ix, points, values }) => {
        const path = values.map((value, i) => `${i === 0 ? 'M' : 'L'}${toX(i, values.length).toFixed(1)},${toY(value).toFixed(1)}`).join(' ')
        const step = Math.max(1, Math.ceil(points.length / 7))
        return (
          <g key={ix.index_name}>
            <path d={path} fill="none" stroke={ix.color} strokeWidth="1.9" strokeLinejoin="round" />
            {points.map((point, i) => (i % step === 0 || i === points.length - 1) ? (
              <text key={`${ix.index_name}-${point.time}`} x={toX(i, points.length)} y={H - 5} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--text-muted)' }}>
                {new Date(point.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </text>
            ) : null)}
          </g>
        )
      })}
      {hover && (
        <>
          <line x1={hover.x} y1={pad.top} x2={hover.x} y2={pad.top + ch} stroke="var(--border-strong)" strokeDasharray="3,3" />
          <g transform={`translate(${Math.min(hover.x + 12, W - 190)}, ${pad.top + 8})`}>
            <rect width="178" height={series.length * 22 + 28} rx="7" fill="var(--bg-elevated)" stroke="var(--border-default)" opacity="0.96" />
            {series.map(({ ix, points, values }, i) => {
              const idx = Math.max(0, Math.min(points.length - 1, Math.round((hover.idx / Math.max(maxLen - 1, 1)) * (points.length - 1))))
              const point = points[idx]
              const value = values[idx]
              return (
                <g key={ix.index_name} transform={`translate(10, ${22 + i * 22})`}>
                  <circle cx="4" cy="-4" r="3" fill={ix.color} />
                  <text x="14" y="0" style={{ fontSize: 10.5, fill: 'var(--text-primary)', fontFamily: 'IBM Plex Mono' }}>
                    {ix.abbr}: {mode === 'normalized' ? value.toFixed(1) : `${valuePrefix(ix.index_name)}${fmtNum(point.value)}${valueUnit(ix.index_name)}`}
                  </text>
                </g>
              )
            })}
          </g>
        </>
      )}
    </svg>
  )
}

const ForecastPanel: React.FC<{ index: IndexMeta; forecast?: ForecastResponse; isLoading: boolean; error: unknown }> = ({ index, forecast, isLoading, error }) => {
  const points = forecastPoints(forecast).slice(0, forecast?.horizon_days ?? 14)
  const usable = points.map(point => ({ point, value: forecastValue(point), lower: forecastLower(point), upper: forecastUpper(point) })).filter(item => item.value != null)
  const mape = metricValue(forecast?.metrics, 'mape') ?? metricValue(forecast?.metrics, 'MAPE')

  return (
    <Card style={{ padding: 14 }}>
      <SectionHeader
        title={`${index.abbr} Forecast`}
        sub={forecast ? `${forecast.model_name ?? 'model'} · ${forecast.horizon_days} days · created ${relativeTime(forecast.created_at)}` : 'No forecast row returned'}
        action={mape == null ? <Badge variant="default">MAPE n/a</Badge> : <Badge variant={mape <= 15 ? 'success' : mape <= 30 ? 'warning' : 'danger'}>MAPE {mape.toFixed(1)}%</Badge>}
      />
      {isLoading && <SkeletonBlock height={90} lines={3} />}
      {!isLoading && Boolean(error) && <EmptyState title="No forecast yet" detail={error instanceof Error ? error.message : 'The backend returned no latest forecast for this index.'} compact />}
      {!isLoading && !error && usable.length > 0 && (
        <>
          <svg width="100%" viewBox="0 0 260 88" style={{ display: 'block' }} role="img" aria-label={`${index.abbr} forecast chart`}>
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
                  {band && <path d={band} fill={index.color} opacity="0.12" />}
                  <path d={line} fill="none" stroke={index.color} strokeWidth="1.7" strokeDasharray="4,3" />
                  <text x="28" y="84" style={{ fontSize: 9, fill: 'var(--text-muted)' }}>{forecastTimestamp(usable[0].point)?.slice(5, 10) ?? 'start'}</text>
                  <text x="226" y="84" style={{ fontSize: 9, fill: 'var(--text-muted)' }}>{forecastTimestamp(usable[usable.length - 1].point)?.slice(5, 10) ?? 'end'}</text>
                </>
              )
            })()}
          </svg>
          {forecast?.commentary && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{forecast.commentary}</div>}
        </>
      )}
    </Card>
  )
}

const MarketStoryPanel: React.FC<{
  active: IndexMeta[]
  histories: Record<string, IndexPoint[]>
  period: Period
  forecasts: Array<ForecastResponse | undefined>
  correlations: CorrelationCell[]
  loading: boolean
}> = ({ active, histories, period, forecasts, correlations, loading }) => {
  const movers = active
    .map(index => ({ index, change: percentChange(periodSlice(histories[index.index_name] ?? [], period)) }))
    .filter((item): item is { index: IndexMeta; change: number } => item.change != null)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
  const topMover = movers[0]
  const corr = strongestCorrelation(correlations)
  const forecastNotes = active
    .map((index, i) => {
      const points = forecastPoints(forecasts[i])
      const first = forecastValue(points[0])
      const last = forecastValue(points[points.length - 1])
      if (first == null || last == null || first === 0) return null
      return { index, change: ((last - first) / first) * 100 }
    })
    .filter((item): item is { index: IndexMeta; change: number } => item != null)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
  const forecastNote = forecastNotes[0]

  return (
    <Card style={{ padding: 16 }}>
      <SectionHeader
        title="Market Story"
        sub="Deterministic narrative from live histories, correlations, and forecasts."
        action={<DataProvenance mode={loading ? 'loading' : active.length ? 'live' : 'empty'} source="Index histories + forecast rows" />}
      />
      {loading ? <SkeletonBlock height={112} lines={4} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          <div style={{ padding: 12, borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <Badge variant={topMover && topMover.change >= 0 ? 'success' : topMover ? 'danger' : 'default'}>Top move</Badge>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.55 }}>
              {topMover
                ? `${topMover.index.abbr} moved ${fmtPct(topMover.change)} over ${period}. This is the strongest selected-series move and anchors the current macro read.`
                : 'Need at least two points in selected period before ranking index moves.'}
            </div>
          </div>
          <div style={{ padding: 12, borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <Badge variant={corr && Math.abs(corr.correlation ?? 0) >= 0.75 ? 'warning' : 'info'}>Relationship</Badge>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.55 }}>
              {corr
                ? `${shortName(corr.index_a)} and ${shortName(corr.index_b)} show ${(corr.correlation ?? 0) >= 0 ? 'positive' : 'negative'} correlation (${(corr.correlation ?? 0).toFixed(2)}) across ${corr.overlap} overlapping days.`
                : 'Select at least two series with overlapping daily history to see relationship context.'}
            </div>
          </div>
          <div style={{ padding: 12, borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <Badge variant={forecastNote && forecastNote.change >= 0 ? 'success' : forecastNote ? 'danger' : 'default'}>Forward read</Badge>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.55 }}>
              {forecastNote
                ? `${forecastNote.index.abbr} forecast path changes ${fmtPct(forecastNote.change)} across the returned horizon; compare with MAPE before treating it as reliable.`
                : 'Forecast rows are unavailable for the selected series or lack numeric prediction points.'}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

export const MacroIndices: React.FC = () => {
  const [period, setPeriod] = useState<Period>('90D')
  const [mode, setMode] = useState<Mode>('raw')
  const [activeNames, setActiveNames] = useState<string[]>([])

  const indicesQuery = useQuery({
    queryKey: queryKeys.indices,
    queryFn: ({ signal }) => apiClient.indices({ signal }),
  })

  const indices: IndexMeta[] = useMemo(() => {
    const rows = indicesQuery.data ?? []
    return rows
      .slice()
      .sort((a, b) => {
        const ai = preferredOrder.indexOf(a.index_name)
        const bi = preferredOrder.indexOf(b.index_name)
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.index_name.localeCompare(b.index_name)
      })
      .map((summary, i) => ({
        ...summary,
        color: COLORS[i % COLORS.length],
        label: friendlyName(summary.index_name),
        abbr: shortName(summary.index_name),
      }))
  }, [indicesQuery.data])

  React.useEffect(() => {
    if (indices.length === 0 || activeNames.length > 0) return
    setActiveNames(indices.slice(0, Math.min(3, indices.length)).map(index => index.index_name))
  }, [indices, activeNames.length])

  const historyQueries = useQueries({
    queries: indices.map(index => ({
      queryKey: queryKeys.indexHistory(index.index_name, 5000),
      queryFn: ({ signal }: { signal: AbortSignal }) => apiClient.indexHistory(index.index_name, { limit: 5000 }, { signal }),
      enabled: indices.length > 0,
    })),
  })

  const histories = useMemo(() => Object.fromEntries(indices.map((index, i) => [index.index_name, historyQueries[i]?.data ?? []])), [indices, historyQueries])
  const activeIndices = indices.filter(index => activeNames.includes(index.index_name))

  const forecastQueries = useQueries({
    queries: activeIndices.map(index => ({
      queryKey: queryKeys.indexForecast(index.index_name),
      queryFn: ({ signal }: { signal: AbortSignal }) => apiClient.indexForecast(index.index_name, { signal }),
      retry: false,
    })),
  })
  const correlationNames = activeNames.join(',')
  const correlationsQuery = useQuery({
    queryKey: queryKeys.correlations(correlationNames || 'none', PERIOD_DAYS[period] ?? 365),
    queryFn: ({ signal }) => apiClient.correlations(correlationNames, PERIOD_DAYS[period] ?? 365, { signal }),
    enabled: activeNames.length >= 2,
  })

  const toggleIndex = (name: string) => {
    setActiveNames(prev => prev.includes(name)
      ? (prev.length > 1 ? prev.filter(item => item !== name) : prev)
      : [...prev, name])
  }

  const loading = indicesQuery.isLoading || historyQueries.some(query => query.isLoading)
  const error = indicesQuery.error ?? historyQueries.find(query => query.error)?.error

  return (
    <PageShell
      title="Macro Indices"
      subtitle="Freight and macro time series from the backend, with normalized comparison and forecast reliability."
      action={<DataProvenance mode={error ? 'error' : loading ? 'loading' : indices.length ? 'live' : 'empty'} source="/api/indices" />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <ErrorPanel error={error} title="Index API unavailable" compact />}

        <Card style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', background: 'var(--bg-input)', borderRadius: 6, border: '1px solid var(--border-subtle)', padding: 2 }}>
                {PERIODS.map(opt => <PillButton key={opt} active={period === opt} onClick={() => setPeriod(opt)}>{opt}</PillButton>)}
              </div>
              <div style={{ display: 'inline-flex', background: 'var(--bg-input)', borderRadius: 6, border: '1px solid var(--border-subtle)', padding: 2 }}>
                <PillButton active={mode === 'raw'} onClick={() => setMode('raw')}>Raw</PillButton>
                <PillButton active={mode === 'normalized'} onClick={() => setMode('normalized')}>Normalized</PillButton>
              </div>
              {indices.map(index => <CheckPill key={index.index_name} label={index.abbr} color={index.color} checked={activeNames.includes(index.index_name)} onChange={() => toggleIndex(index.index_name)} />)}
            </div>
            <Badge variant="info">{mode === 'normalized' ? 'Base = 100 at period start' : 'Native units'}</Badge>
          </div>
        </Card>

        <Card style={{ padding: '16px 16px 8px' }}>
          <SectionHeader title="Index Comparison" sub="Unsupported series such as SCFI are hidden unless returned by the backend." />
          {loading ? <SkeletonBlock height={340} lines={5} /> : (
            <MacroChart indices={indices} activeNames={activeNames} histories={histories} period={period} mode={mode} />
          )}
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          {activeIndices.map(index => {
            const points = periodSlice(histories[index.index_name] ?? [], period)
            const last = latestPoint(points)
            const change = percentChange(points)
            return (
              <MetricCard
                key={index.index_name}
                label={index.label}
                value={last == null ? 'n/a' : `${valuePrefix(index.index_name)}${fmtNum(last.value)}${valueUnit(index.index_name)}`}
                sub={`${points.length.toLocaleString()} points · ${change == null ? 'trend unavailable' : fmtPct(change)}`}
                tone={change == null ? 'default' : change >= 0 ? 'success' : 'danger'}
              />
            )
          })}
        </div>

        <MarketStoryPanel
          active={activeIndices}
          histories={histories}
          period={period}
          forecasts={forecastQueries.map(query => query.data)}
          correlations={correlationsQuery.data ?? []}
          loading={loading || correlationsQuery.isLoading || forecastQueries.some(query => query.isLoading)}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 12 }}>
          {activeIndices.map((index, i) => (
            <ForecastPanel
              key={index.index_name}
              index={index}
              forecast={forecastQueries[i]?.data}
              isLoading={forecastQueries[i]?.isLoading ?? false}
              error={forecastQueries[i]?.error}
            />
          ))}
          {!loading && activeIndices.length === 0 && <EmptyState title="Select at least one index" detail="The comparison chart and forecast cards update from selected API series." />}
        </div>
      </div>
    </PageShell>
  )
}
