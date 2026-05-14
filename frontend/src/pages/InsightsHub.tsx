import React, { useEffect, useMemo, useState, useId } from 'react'
import { Card } from '../components/Card'
import { Badge } from '../components/Badge'
import { InsightRow, type InsightCategory } from '../components/InsightRow'
import { apiClient, type InsightResponse } from '../api/client'

// ---- Types ----

type CatFilter = 'all' | InsightCategory
type FeedInsight = {
  text: string
  category: InsightCategory
  time: string
  aiGenerated?: boolean
}

const CATS: CatFilter[] = ['all', 'correlation', 'trend', 'anomaly', 'forecast']
const CAT_LABELS: Record<CatFilter, string> = { all: 'All', correlation: 'Correlation', trend: 'Trend', anomaly: 'Anomaly', forecast: 'Forecast' }

// ---- Data ----

const INSIGHTS_FEED = [
  { text: 'BDI surged 4.2% over 3 consecutive sessions, correlating with a spike in Chinese iron ore imports.', category: 'trend' as InsightCategory, time: '12m ago', severity: 'medium' },
  { text: 'Shanghai port congestion hit a 90-day high — 142 vessels currently at anchor.', category: 'anomaly' as InsightCategory, time: '38m ago', severity: 'high' },
  { text: 'FBX China→US West Coast rates diverging from historical BDI correlation (r² dropped to 0.61).', category: 'correlation' as InsightCategory, time: '1h ago', severity: 'medium' },
  { text: '14-day forecast: BDI expected to test resistance at 1,900 (82% confidence).', category: 'forecast' as InsightCategory, time: '2h ago', severity: 'low' },
  { text: 'Suez Canal average transit time increased 18% WoW, signaling potential bottleneck.', category: 'anomaly' as InsightCategory, time: '3h ago', severity: 'high' },
  { text: 'WCI and FBX 30-day rolling correlation strengthened to 0.89, highest since Q1 2025.', category: 'correlation' as InsightCategory, time: '4h ago', severity: 'low' },
  { text: 'Bulk carrier spot rates for Capesize vessels up 6.1% on Australia→China route.', category: 'trend' as InsightCategory, time: '5h ago', severity: 'medium' },
  { text: 'SCFI forecast: gradual decline expected over next 14 days, 74% confidence.', category: 'forecast' as InsightCategory, time: '6h ago', severity: 'low' },
  { text: 'Rotterdam dwell times dropped to 2.1 days — lowest in 6 months.', category: 'anomaly' as InsightCategory, time: '7h ago', severity: 'low' },
  { text: 'Trans-Pacific container rates show early seasonal uptick, 3 weeks ahead of historical pattern.', category: 'trend' as InsightCategory, time: '8h ago', severity: 'medium' },
]

const relativeTime = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.max(0, Math.round(diffMs / 60000))
  if (mins < 60) return `${mins || 1}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

const normalizeCategory = (category?: string | null): InsightCategory => {
  if (category === 'anomaly' || category === 'correlation' || category === 'forecast') return category
  return 'trend'
}

const insightText = (insight: InsightResponse) => insight.narrative_llm || insight.narrative

// ---- Correlation Heatmap ----

const CORR_LABELS = ['BDI', 'FBX', 'WCI', 'SCFI']
const CORR_MATRIX = [
  [1.00, 0.72, 0.45, 0.38],
  [0.72, 1.00, 0.81, 0.67],
  [0.45, 0.81, 1.00, 0.74],
  [0.38, 0.67, 0.74, 1.00],
]

const corrToColor = (v: number) => {
  if (v >= 0.9) return 'rgba(59,130,246,0.6)'
  if (v >= 0.7) return 'rgba(59,130,246,0.4)'
  if (v >= 0.5) return 'rgba(59,130,246,0.25)'
  if (v >= 0.3) return 'rgba(59,130,246,0.12)'
  return 'rgba(59,130,246,0.05)'
}

const CorrelationHeatmap: React.FC = () => {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(${CORR_LABELS.length}, 1fr)`, gap: 3, alignItems: 'center' }}>
      <div />
      {CORR_LABELS.map(l => (
        <div key={l} style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'center' }}>{l}</div>
      ))}
      {CORR_MATRIX.map((row, r) => (
        <React.Fragment key={r}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'right', paddingRight: 6 }}>
            {CORR_LABELS[r]}
          </div>
          {row.map((v, c) => (
            <div key={c}
              onMouseEnter={() => setHover({ r, c })}
              onMouseLeave={() => setHover(null)}
              style={{
                aspectRatio: '1', borderRadius: 4,
                background: r === c ? 'var(--bg-hover)' : corrToColor(v),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: hover?.r === r && hover?.c === c ? '1px solid var(--accent)' : '1px solid transparent',
                transition: 'border 0.15s', cursor: 'default',
              }}>
              <span className="mono-num" style={{
                fontSize: 12, fontWeight: 500,
                color: r === c ? 'var(--text-muted)' : v >= 0.6 ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}>
                {v.toFixed(2)}
              </span>
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  )
}

// ---- Forecast Mini Charts (3 individual, per-index) ----

const FORECAST_DATA = [
  {
    label: 'BDI', color: '#3B82F6',
    data: [1821, 1835, 1829, 1818, 1841, 1856, 1862, 1839, 1851, 1847],
    forecast: [1852, 1860, 1873, 1881, 1890, 1898, 1905],
    upper:    [1872, 1890, 1913, 1931, 1950, 1968, 1985],
    lower:    [1832, 1830, 1833, 1831, 1830, 1828, 1825],
  },
  {
    label: 'FBX', color: '#06B6D4',
    data: [2141, 2155, 2132, 2147, 2138, 2161, 2149, 2163, 2145, 2156],
    forecast: [2148, 2140, 2131, 2125, 2118, 2112, 2105],
    upper:    [2178, 2180, 2181, 2185, 2188, 2192, 2195],
    lower:    [2118, 2100, 2081, 2065, 2048, 2032, 2015],
  },
  {
    label: 'WCI', color: '#A78BFA',
    data: [2855, 2862, 2871, 2878, 2865, 2880, 2875, 2889, 2884, 2891],
    forecast: [2896, 2902, 2908, 2913, 2918, 2922, 2926],
    upper:    [2926, 2942, 2958, 2973, 2988, 3002, 3016],
    lower:    [2866, 2862, 2858, 2853, 2848, 2842, 2836],
  },
]

const ForecastMiniChart: React.FC<{ item: typeof FORECAST_DATA[0] }> = ({ item }) => {
  const id = useId()
  const W = 260, H = 90
  const pad = { top: 8, right: 8, bottom: 18, left: 40 }
  const cw = W - pad.left - pad.right
  const ch = H - pad.top - pad.bottom

  const allVals = [...item.data, ...item.upper, ...item.lower]
  const min = Math.min(...allVals), max = Math.max(...allVals)
  const range = max - min || 1
  const totalPts = item.data.length + item.forecast.length

  const toX = (i: number) => pad.left + (i / (totalPts - 1)) * cw
  const toY = (v: number) => pad.top + (1 - (v - min) / range) * ch

  const dataLine = item.data.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')
  const fcLine = `M${toX(item.data.length - 1).toFixed(1)},${toY(item.data[item.data.length - 1]).toFixed(1)} `
    + item.forecast.map((v, i) => `L${toX(item.data.length + i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')
  const bandPath = 'M' + item.upper.map((v, i) => `${toX(item.data.length + i).toFixed(1)},${toY(v).toFixed(1)}`).join(' L')
    + ' L' + item.lower.slice().reverse().map((v, i) => `${toX(item.data.length + item.lower.length - 1 - i).toFixed(1)},${toY(v).toFixed(1)}`).join(' L')
    + ' Z'

  const divX = toX(item.data.length - 1)

  return (
    <div style={{ flex: '1 1 0', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>{item.label}</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <line x1={divX} y1={pad.top} x2={divX} y2={H - pad.bottom}
          stroke="var(--border-default)" strokeWidth="1" strokeDasharray="3,3" />
        <path d={bandPath} fill={item.color} opacity="0.1" />
        <path d={dataLine} fill="none" stroke={item.color} strokeWidth="1.5" />
        <path d={fcLine} fill="none" stroke={item.color} strokeWidth="1.5" strokeDasharray="4,3" />
        {[min, max].map((v, i) => (
          <text key={i} x={pad.left - 4} y={toY(v) + 3} textAnchor="end"
            style={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>
            {Math.round(v).toLocaleString()}
          </text>
        ))}
      </svg>
    </div>
  )
}

// ---- Anomaly Timeline ----

const ANOMALY_EVENTS = [
  { day: 5,  severity: 'high',   label: 'Shanghai congestion spike' },
  { day: 12, severity: 'medium', label: 'BDI 3-day surge' },
  { day: 23, severity: 'low',    label: 'Rotterdam dwell time drop' },
  { day: 31, severity: 'high',   label: 'Suez transit delay' },
  { day: 38, severity: 'medium', label: 'FBX correlation break' },
  { day: 45, severity: 'low',    label: 'SCFI seasonal shift' },
  { day: 52, severity: 'high',   label: 'LA/LB vessel queue' },
  { day: 61, severity: 'medium', label: 'Pacific rate anomaly' },
  { day: 70, severity: 'high',   label: 'Cape bulk rate jump' },
  { day: 78, severity: 'medium', label: 'Trans-Pacific uptick' },
  { day: 85, severity: 'high',   label: 'Shanghai 90-day high' },
  { day: 88, severity: 'high',   label: 'Suez +18% WoW' },
] as const

const SEV_COLOR: Record<string, string> = {
  high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--accent)',
}

const AnomalyTimeline: React.FC = () => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  return (
    <div style={{ position: 'relative', height: 72, marginTop: 4 }}>
      <div style={{ position: 'absolute', top: 28, left: 0, right: 0, height: 1, background: 'var(--border-subtle)' }} />
      {ANOMALY_EVENTS.map((ev, i) => (
        <div key={i} style={{ position: 'absolute', left: `${(ev.day / 90) * 100}%`, top: 22, transform: 'translateX(-50%)' }}
          onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
          <div style={{
            width: ev.severity === 'high' ? 12 : 10,
            height: ev.severity === 'high' ? 12 : 10,
            borderRadius: '50%', background: SEV_COLOR[ev.severity],
            cursor: 'pointer', transition: 'transform 0.15s',
            transform: hoverIdx === i ? 'scale(1.4)' : 'scale(1)',
          }} />
          {hoverIdx === i && (
            <div style={{
              position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
              borderRadius: 6, padding: '4px 8px', whiteSpace: 'nowrap', zIndex: 5,
              fontSize: 11, color: 'var(--text-primary)', boxShadow: 'var(--shadow-md)',
            }}>
              {ev.label}
            </div>
          )}
        </div>
      ))}
      {['90d ago', '60d ago', '30d ago', 'Today'].map((l, i) => (
        <div key={l} style={{
          position: 'absolute', bottom: 0, left: `${(i / 3) * 100}%`, transform: 'translateX(-50%)',
          fontSize: 10, color: 'var(--text-muted)',
        }}>{l}</div>
      ))}
    </div>
  )
}

// ---- Story Mode ----

const STORY_PAIRS = [
  {
    a: 'Shanghai Port', b: 'FBX China-US',
    narrative: 'Shanghai congestion has shown a 0.73 correlation with FBX China→US rates over the past 90 days. As Shanghai anchorage counts surged to 142 vessels (90-day high), FBX rates responded with a 3.8% increase within 5 trading days — consistent with the historical 3-7 day lag pattern.',
  },
  {
    a: 'BDI', b: 'Iron Ore Imports',
    narrative: 'The Baltic Dry Index closely tracks Chinese iron ore import volumes. The recent 4.2% BDI surge aligns with a reported 8% increase in weekly iron ore arrivals at Chinese ports, suggesting sustained demand for Capesize and Panamax bulk carriers on the Australia→China route.',
  },
  {
    a: 'Suez Canal', b: 'WCI',
    narrative: 'Suez Canal transit delays have historically preceded WCI increases by 1-2 weeks. The current 18% WoW increase in transit times, if sustained, could push WCI above the $3,000 threshold based on regression analysis of 2023-2025 disruption events.',
  },
]

const StoryMode: React.FC = () => {
  const [selected, setSelected] = useState(0)
  const story = STORY_PAIRS[selected]
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {STORY_PAIRS.map((s, i) => (
          <button key={i} onClick={() => setSelected(i)} style={{
            padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 500, fontFamily: 'IBM Plex Sans',
            background: selected === i ? 'var(--accent-muted)' : 'var(--bg-hover)',
            color: selected === i ? 'var(--accent-text)' : 'var(--text-muted)',
            transition: 'all 0.15s',
          }}>
            {s.a} × {s.b}
          </button>
        ))}
      </div>
      <div style={{
        padding: 14, borderRadius: 8, background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)', fontSize: 13, lineHeight: 1.7,
        color: 'var(--text-secondary)',
      }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <Badge variant="accent">{story.a}</Badge>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, alignSelf: 'center' }}>↔</span>
          <Badge variant="info">{story.b}</Badge>
        </div>
        {story.narrative}
      </div>
    </div>
  )
}

// ---- Main Page (v2: 3-row layout, no overlap) ----

export const InsightsHub: React.FC = () => {
  const [catFilter, setCatFilter] = useState<CatFilter>('all')
  const [apiInsights, setApiInsights] = useState<InsightResponse[]>([])

  useEffect(() => {
    let cancelled = false
    apiClient.latestInsights(20)
      .then(rows => {
        if (!cancelled) setApiInsights(rows)
      })
      .catch(() => {
        if (!cancelled) setApiInsights([])
      })
    return () => { cancelled = true }
  }, [])

  const liveFeed = useMemo(() => apiInsights.map(insight => ({
    text: insightText(insight),
    category: normalizeCategory(insight.category),
    time: relativeTime(insight.narrative_generated_at || insight.generated_at),
    aiGenerated: Boolean(insight.narrative_llm),
  })), [apiInsights])

  const feed: FeedInsight[] = liveFeed.length > 0 ? liveFeed : INSIGHTS_FEED
  const filtered = catFilter === 'all' ? feed : feed.filter(i => i.category === catFilter)

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-base)', padding: '20px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Insights Hub</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>AI-generated analysis, correlations, forecasts, and anomaly detection</p>
      </div>

      {/* Row 1: Feed (left) + Correlation Matrix (right, fixed width) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 16 }}>
        {/* Feed */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
            {CATS.map(c => (
              <button key={c} onClick={() => setCatFilter(c)} style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 500, fontFamily: 'IBM Plex Sans',
                background: catFilter === c ? 'var(--accent-muted)' : 'transparent',
                color: catFilter === c ? 'var(--accent-text)' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}>{CAT_LABELS[c]}</button>
            ))}
          </div>
          <Card style={{ padding: '4px 16px' }}>
            {filtered.map((ins, i) => (
              <InsightRow
                key={i}
                text={ins.text}
                category={ins.category}
                time={ins.time}
                aiGenerated={ins.aiGenerated ?? false}
              />
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No insights in this category.
              </div>
            )}
          </Card>
        </div>

        {/* Correlation Matrix */}
        <div style={{ minWidth: 0 }}>
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Index Correlation Matrix</div>
            <CorrelationHeatmap />
          </Card>
        </div>
      </div>

      {/* Row 2: 14-day forecasts — 3 charts side by side */}
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14 }}>14-Day Forecasts</div>
        <div style={{ display: 'flex', gap: 24 }}>
          {FORECAST_DATA.map(f => <ForecastMiniChart key={f.label} item={f} />)}
        </div>
      </Card>

      {/* Row 3: Anomaly Timeline + Story Mode */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Anomaly Timeline — 90 Days</div>
          <AnomalyTimeline />
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Story Mode</div>
          <StoryMode />
        </Card>
      </div>
    </div>
  )
}
