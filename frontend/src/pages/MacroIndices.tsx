import React, { useState, useId } from 'react'
import { Card } from '../components/Card'
import { Badge } from '../components/Badge'
import { fmtNum, fmtPct } from '../data/mock'

// ---- Data Generation ----

function genSeries(days: number, start: number, end: number, vol: number, seed: number): number[] {
  const arr = [start]
  for (let i = 1; i < days; i++) {
    const trend = (end - start) / days
    const n = Math.sin(i * 0.31 + seed) * vol * 0.4
            + Math.cos(i * 0.73 + seed * 2) * vol * 0.3
            + Math.sin(i * 1.7 + seed * 3) * vol * 0.15
    arr.push(Math.round(arr[i - 1] + trend + n))
  }
  arr[arr.length - 1] = end
  return arr
}

function genDates(days: number): string[] {
  const d: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(2026, 4, 14)
    dt.setDate(dt.getDate() - i)
    d.push(dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
  }
  return d
}

function genForecastDates(days: number): string[] {
  const d: string[] = []
  for (let i = 1; i <= days; i++) {
    const dt = new Date(2026, 4, 14)
    dt.setDate(dt.getDate() + i)
    d.push(dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
  }
  return d
}

function genForecastV2(series: number[]): { val: number; upper: number; lower: number }[] {
  const last = series[series.length - 1]
  const trend = (series[series.length - 1] - series[series.length - 15]) / 14
  const pts = []
  for (let i = 1; i <= FORECAST_DAYS; i++) {
    const val = last + trend * i + Math.sin(i * 0.8) * 15
    const spread = 20 + i * 8
    pts.push({ val: Math.round(val), upper: Math.round(val + spread), lower: Math.round(val - spread) })
  }
  return pts
}

const INDICES = [
  { id: 'bdi', label: 'Baltic Dry Index', abbr: 'BDI', color: 'var(--chart-1)', colorHex: '#3B82F6', current: 1847, prefix: '', unit: '' },
  { id: 'fbx', label: 'Freightos Baltic Index', abbr: 'FBX', color: 'var(--chart-2)', colorHex: '#06B6D4', current: 2156, prefix: '$', unit: 'USD/FEU' },
  { id: 'wci', label: 'World Container Index', abbr: 'WCI', color: 'var(--chart-3)', colorHex: '#A78BFA', current: 2891, prefix: '$', unit: 'USD/FEU' },
  { id: 'scfi', label: 'Shanghai Container Freight', abbr: 'SCFI', color: 'var(--chart-4)', colorHex: '#F59E0B', current: 1423, prefix: '', unit: '' },
]

const SERIES_365 = {
  bdi: genSeries(365, 1220, 1847, 45, 1),
  fbx: genSeries(365, 2810, 2156, 38, 2),
  wci: genSeries(365, 2420, 2891, 55, 3),
  scfi: genSeries(365, 1680, 1423, 32, 4),
}

const ANOMALY_INDICES: Record<string, number[]> = {
  bdi: [42, 98, 167, 234, 301, 340],
  fbx: [55, 130, 210, 289],
  wci: [78, 180, 260, 330],
  scfi: [65, 155, 245, 350],
}

const DATES_365 = genDates(365)
const FORECAST_DAYS = 14

const PERIODS = ['7D', '30D', '90D', '1Y', 'All'] as const
type Period = typeof PERIODS[number]

const PERIOD_DAYS: Record<Period, number> = { '7D': 7, '30D': 30, '90D': 90, '1Y': 365, 'All': 365 }

// ---- Sub-components ----

const PillTabs: React.FC<{ options: readonly string[]; value: string; onChange: (v: string) => void }> = ({ options, value, onChange }) => (
  <div style={{ display: 'inline-flex', background: 'var(--bg-input)', borderRadius: 6, border: '1px solid var(--border-subtle)', padding: 2 }}>
    {options.map(opt => (
      <button key={opt} onClick={() => onChange(opt)} style={{
        padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
        background: value === opt ? 'var(--accent)' : 'transparent',
        color: value === opt ? '#fff' : 'var(--text-muted)',
        transition: 'all 0.15s',
      }}>{opt}</button>
    ))}
  </div>
)

const CheckPill: React.FC<{ label: string; color: string; checked: boolean; onChange: () => void }> = ({ label, color, checked, onChange }) => (
  <div onClick={onChange} style={{
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
    borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 500,
    background: checked ? 'var(--bg-hover)' : 'transparent',
    color: checked ? 'var(--text-primary)' : 'var(--text-muted)',
    border: `1px solid ${checked ? 'var(--border-default)' : 'transparent'}`,
    transition: 'all 0.15s',
  }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, opacity: checked ? 1 : 0.4 }} />
    {label}
  </div>
)

const ToggleSwitch: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
    {label}
    <div onClick={() => onChange(!checked)} style={{
      width: 34, height: 18, borderRadius: 9, padding: 2, cursor: 'pointer',
      background: checked ? 'var(--accent)' : 'var(--bg-hover)',
      border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-default)'}`,
      transition: 'all 0.15s',
    }}>
      <div style={{
        width: 12, height: 12, borderRadius: '50%', background: '#fff',
        transform: checked ? 'translateX(16px)' : 'translateX(0)',
        transition: 'transform 0.15s',
      }} />
    </div>
  </label>
)

// ---- Main Chart (v2: forecast integrated into unified timeline) ----

interface MacroChartProps {
  activeIndices: string[]
  period: Period
  showAnomalies: boolean
  showForecast: boolean
}

const MacroChart: React.FC<MacroChartProps> = ({ activeIndices, period, showAnomalies, showForecast }) => {
  const [hover, setHover] = React.useState<{ idx: number; svgX: number } | null>(null)
  const chartId = useId()

  const W = 900, H = 340
  const pad = { top: 16, right: 20, bottom: 32, left: 56 }
  const cw = W - pad.left - pad.right
  const ch = H - pad.top - pad.bottom

  const days = PERIOD_DAYS[period]
  const totalPts = showForecast ? days + FORECAST_DAYS : days
  const sliceStart = Math.max(0, 365 - days)

  const indices = INDICES.filter(ix => activeIndices.includes(ix.id))

  // Build sliced data + forecasts, track global Y range
  const slicedData: Record<string, number[]> = {}
  const forecasts: Record<string, { val: number; upper: number; lower: number }[]> = {}
  let globalMin = Infinity, globalMax = -Infinity

  indices.forEach(ix => {
    const d = SERIES_365[ix.id as keyof typeof SERIES_365].slice(sliceStart)
    slicedData[ix.id] = d
    globalMin = Math.min(globalMin, ...d)
    globalMax = Math.max(globalMax, ...d)
    if (showForecast) {
      const fc = genForecastV2(SERIES_365[ix.id as keyof typeof SERIES_365])
      forecasts[ix.id] = fc
      fc.forEach(f => {
        globalMin = Math.min(globalMin, f.lower)
        globalMax = Math.max(globalMax, f.upper)
      })
    }
  })

  if (!isFinite(globalMin)) { globalMin = 0; globalMax = 1 }
  const range = globalMax - globalMin || 1
  const yPad = range * 0.08
  const adjMin = globalMin - yPad
  const adjRange = range + yPad * 2

  const toX = (i: number) => pad.left + (i / Math.max(totalPts - 1, 1)) * cw
  const toY = (v: number) => pad.top + (1 - (v - adjMin) / adjRange) * ch

  const dates = DATES_365.slice(sliceStart)
  const fcDates = showForecast ? genForecastDates(FORECAST_DAYS) : []
  const allDates = [...dates, ...fcDates]
  const dividerX = toX(days - 1)

  const gridCount = 5
  const yTicks = Array.from({ length: gridCount + 1 }, (_, i) => adjMin + (i / gridCount) * adjRange)

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const rawX = (e.clientX - rect.left) * (W / rect.width)
    const svgX = Math.max(pad.left, Math.min(W - pad.right, rawX))
    const idx = Math.max(0, Math.min(totalPts - 1, Math.round(((svgX - pad.left) / cw) * (totalPts - 1))))
    setHover({ idx, svgX })
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}
      onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <defs>
        {indices.map(ix => (
          <linearGradient key={ix.id} id={`${chartId}-g-${ix.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ix.colorHex} stopOpacity="0.12" />
            <stop offset="100%" stopColor={ix.colorHex} stopOpacity="0" />
          </linearGradient>
        ))}
        <pattern id={`${chartId}-stripe`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(148,163,194,0.04)" strokeWidth="3" />
        </pattern>
      </defs>

      {/* Y grid + labels */}
      {yTicks.map((v, i) => {
        const y = toY(v)
        return (
          <React.Fragment key={i}>
            <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="var(--border-subtle)" strokeWidth="1" />
            <text x={pad.left - 8} y={y + 3.5} textAnchor="end"
              style={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>
              {Math.round(v).toLocaleString()}
            </text>
          </React.Fragment>
        )
      })}

      {/* Forecast zone background */}
      {showForecast && (
        <>
          <rect x={dividerX} y={pad.top} width={W - pad.right - dividerX} height={ch}
            fill={`url(#${chartId}-stripe)`} />
          <line x1={dividerX} y1={pad.top} x2={dividerX} y2={pad.top + ch}
            stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="4,3" />
          <text x={dividerX + 6} y={pad.top + 12}
            style={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'IBM Plex Sans', fontWeight: 500, letterSpacing: '0.04em' }}>
            FORECAST
          </text>
        </>
      )}

      {/* X-axis labels */}
      {allDates.map((d, i) => {
        const step = Math.max(1, Math.ceil(totalPts / 8))
        if (i % step !== 0 && i !== totalPts - 1 && i !== days - 1) return null
        const isFc = i >= days
        return (
          <text key={i} x={toX(i)} y={H - 4} textAnchor="middle"
            style={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'IBM Plex Sans', opacity: isFc ? 0.6 : 1 }}>
            {d}
          </text>
        )
      })}

      {/* Confidence bands — drawn before lines */}
      {showForecast && indices.map(ix => {
        const fc = forecasts[ix.id]
        if (!fc?.length) return null
        const startIdx = days - 1
        const lastActualY = toY(slicedData[ix.id][days - 1])
        const bandPath = `M${toX(startIdx).toFixed(1)},${lastActualY.toFixed(1)} `
          + fc.map((f, i) => `L${toX(startIdx + i + 1).toFixed(1)},${toY(f.upper).toFixed(1)}`).join(' ')
          + ' L' + fc.slice().reverse().map((f, i) => `${toX(startIdx + fc.length - i).toFixed(1)},${toY(f.lower).toFixed(1)}`).join(' L')
          + ` L${toX(startIdx).toFixed(1)},${lastActualY.toFixed(1)} Z`
        return <path key={ix.id + '-band'} d={bandPath} fill={ix.colorHex} opacity="0.06" />
      })}

      {/* Area fills (historical only) */}
      {indices.map(ix => {
        const d = slicedData[ix.id]
        const pts = d.map((v, i) => ({ x: toX(i), y: toY(v) }))
        const area = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ')
          + ` L${pts[pts.length - 1].x.toFixed(1)},${pad.top + ch} L${pts[0].x.toFixed(1)},${pad.top + ch} Z`
        return <path key={ix.id + '-area'} d={area} fill={`url(#${chartId}-g-${ix.id})`} />
      })}

      {/* Historical lines */}
      {indices.map(ix => {
        const d = slicedData[ix.id]
        const line = d.map((v, i) => (i === 0 ? 'M' : 'L') + toX(i).toFixed(1) + ',' + toY(v).toFixed(1)).join(' ')
        return <path key={ix.id + '-line'} d={line} fill="none" stroke={ix.colorHex} strokeWidth="1.75" strokeLinejoin="round" />
      })}

      {/* Forecast lines (dashed, continuous from last actual) */}
      {showForecast && indices.map(ix => {
        const fc = forecasts[ix.id]
        if (!fc?.length) return null
        const startIdx = days - 1
        const lastVal = slicedData[ix.id][days - 1]
        const fcLine = `M${toX(startIdx).toFixed(1)},${toY(lastVal).toFixed(1)} `
          + fc.map((f, i) => `L${toX(startIdx + i + 1).toFixed(1)},${toY(f.val).toFixed(1)}`).join(' ')
        return <path key={ix.id + '-fc'} d={fcLine} fill="none" stroke={ix.colorHex}
          strokeWidth="1.5" strokeDasharray="5,4" opacity="0.7" />
      })}

      {/* Anomaly markers */}
      {showAnomalies && indices.map(ix =>
        (ANOMALY_INDICES[ix.id] ?? [])
          .filter(ai => ai >= sliceStart)
          .map(ai => {
            const localIdx = ai - sliceStart
            const d = slicedData[ix.id]
            if (localIdx < 0 || localIdx >= d.length) return null
            return (
              <g key={`${ix.id}-a-${ai}`}>
                <circle cx={toX(localIdx)} cy={toY(d[localIdx])} r="6" fill="var(--danger)" opacity="0.15" />
                <circle cx={toX(localIdx)} cy={toY(d[localIdx])} r="3" fill="var(--danger)" />
              </g>
            )
          })
      )}

      {/* Crosshair + tooltip */}
      {hover !== null && (() => {
        const { idx, svgX } = hover
        const isFc = idx >= days
        const tooltipH = indices.length * 22 + 30
        return (
          <>
            {/* Crosshair at exact mouse position */}
            <line x1={svgX} y1={pad.top} x2={svgX} y2={pad.top + ch}
              stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="3,3" />
            {/* Data dots snapped to nearest index */}
            {indices.map(ix => {
              const val = !isFc
                ? slicedData[ix.id][idx]
                : forecasts[ix.id]?.[idx - days]?.val
              if (val == null) return null
              return <circle key={ix.id} cx={toX(idx)} cy={toY(val)}
                r="4" fill="var(--bg-card)" stroke={ix.colorHex} strokeWidth="2" />
            })}
            {/* Tooltip follows mouse */}
            <g transform={`translate(${Math.min(svgX + 12, W - 156)}, ${pad.top + 8})`}>
              <rect x="0" y="0" width="148" height={tooltipH} rx="7"
                fill="var(--bg-elevated)" stroke="var(--border-default)" strokeWidth="1" opacity="0.96" />
              <text x="10" y="18" style={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'IBM Plex Sans' }}>
                {allDates[idx] ?? ''}{isFc ? ' (fcst)' : ''}
              </text>
              {indices.map((ix, i) => {
                const val = !isFc
                  ? slicedData[ix.id][idx]
                  : forecasts[ix.id]?.[idx - days]?.val
                if (val == null) return null
                return (
                  <g key={ix.id} transform={`translate(10, ${30 + i * 22})`}>
                    <circle cx="4" cy="-4" r="3" fill={ix.colorHex} />
                    <text x="14" y="0" style={{ fontSize: 11, fill: 'var(--text-primary)', fontFamily: 'IBM Plex Mono', fontWeight: 500 }}>
                      {ix.prefix}{val.toLocaleString()}
                      {isFc && <tspan style={{ fill: 'var(--text-muted)', fontSize: 9 }}> est.</tspan>}
                    </text>
                  </g>
                )
              })}
            </g>
          </>
        )
      })()}
    </svg>
  )
}

const IndexStatCard: React.FC<{ idx: typeof INDICES[0]; period: Period }> = ({ idx, period }) => {
  const days = PERIOD_DAYS[period]
  const series = SERIES_365[idx.id as keyof typeof SERIES_365]
  const slice = series.slice(Math.max(0, 365 - days))
  const first = slice[0] ?? idx.current
  const last = slice[slice.length - 1] ?? idx.current
  const changePct = ((last - first) / first) * 100
  const meanVal = slice.reduce((a, b) => a + b, 0) / slice.length
  const variance = slice.reduce((acc, v) => acc + (v - meanVal) ** 2, 0) / slice.length
  const vol = (Math.sqrt(variance) / meanVal) * 100
  const high = Math.max(...slice), low = Math.min(...slice)

  return (
    <Card style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: idx.colorHex, display: 'inline-block' }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{idx.abbr}</span>
      </div>
      <div className="mono-num" style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
        {idx.prefix}{fmtNum(last)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
        <Badge variant={changePct >= 0 ? 'success' : 'danger'} style={{ fontSize: 11 }}>{fmtPct(changePct)}</Badge>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{period}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 11 }}>
        {[
          { label: 'Volatility', value: `σ ${vol.toFixed(2)}%` },
          { label: 'High', value: `${idx.prefix}${fmtNum(high)}` },
          { label: 'Low', value: `${idx.prefix}${fmtNum(low)}` },
        ].map(({ label, value }) => (
          <React.Fragment key={label}>
            <div style={{ color: 'var(--text-muted)' }}>{label}</div>
            <div className="mono-num" style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>{value}</div>
          </React.Fragment>
        ))}
      </div>
    </Card>
  )
}

export const MacroIndices: React.FC = () => {
  const [period, setPeriod] = useState<Period>('90D')
  const [activeIndices, setActiveIndices] = useState<string[]>(['bdi', 'fbx'])
  const [showAnomalies, setShowAnomalies] = useState(true)
  const [showForecast, setShowForecast] = useState(false)

  const toggleIndex = (id: string) => {
    setActiveIndices(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(x => x !== id) : prev) : [...prev, id]
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-base)', padding: '20px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Macro Indices</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Multi-index time series comparison with forecasting and anomaly detection</p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <PillTabs options={PERIODS} value={period} onChange={v => setPeriod(v as Period)} />
          <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />
          {INDICES.map(ix => (
            <CheckPill key={ix.id} label={ix.abbr} color={ix.colorHex}
              checked={activeIndices.includes(ix.id)} onChange={() => toggleIndex(ix.id)} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <ToggleSwitch label="Anomalies" checked={showAnomalies} onChange={setShowAnomalies} />
          <ToggleSwitch label="14-day Forecast" checked={showForecast} onChange={setShowForecast} />
        </div>
      </div>

      {/* Chart */}
      <Card style={{ padding: '16px 16px 8px', marginBottom: 16 }}>
        <MacroChart activeIndices={activeIndices} period={period} showAnomalies={showAnomalies} showForecast={showForecast} />
      </Card>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        {INDICES.map(idx => <IndexStatCard key={idx.id} idx={idx} period={period} />)}
      </div>
    </div>
  )
}
