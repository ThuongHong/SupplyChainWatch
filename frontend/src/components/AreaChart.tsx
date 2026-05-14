import React, { useId } from 'react'

interface Dataset {
  data: number[]
  color: string
  prefix?: string
  suffix?: string
}

interface AreaChartProps {
  datasets: Dataset[]
  labels?: string[]
  width?: number
  height?: number
}

export const AreaChart: React.FC<AreaChartProps> = ({ datasets, labels, width: W = 520, height: H = 220 }) => {
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null)
  const id = useId()
  const pad = { top: 12, right: 16, bottom: 28, left: 0 }
  const cw = W - pad.left - pad.right
  const ch = H - pad.top - pad.bottom

  const scaledSets = datasets.map(ds => {
    const min = Math.min(...ds.data), max = Math.max(...ds.data)
    const range = max - min || 1
    return {
      ...ds, min, max,
      points: ds.data.map((v, i) => ({
        x: pad.left + (i / (ds.data.length - 1)) * cw,
        y: pad.top + (1 - (v - min) / range) * ch,
        val: v,
      })),
    }
  })

  const makePath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ')
  const makeArea = (pts: { x: number; y: number }[]) =>
    makePath(pts) + ` L${pts[pts.length - 1].x.toFixed(1)},${pad.top + ch} L${pts[0].x.toFixed(1)},${pad.top + ch} Z`

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const idx = Math.round(((mx - pad.left) / cw) * (datasets[0].data.length - 1))
    setHoverIdx(Math.max(0, Math.min(datasets[0].data.length - 1, idx)))
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}
      onMouseMove={onMove} onMouseLeave={() => setHoverIdx(null)}>
      <defs>
        {scaledSets.map((ds, i) => (
          <linearGradient key={i} id={`${id}-g${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ds.color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={ds.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {Array.from({ length: 5 }, (_, i) => {
        const y = pad.top + (i / 4) * ch
        return <line key={i} x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="var(--border-subtle)" strokeWidth="1" />
      })}
      {labels && labels.map((l, i) => {
        if (i % Math.ceil(labels.length / 7) !== 0 && i !== labels.length - 1) return null
        const x = pad.left + (i / (labels.length - 1)) * cw
        return <text key={i} x={x} y={H - 4} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'IBM Plex Sans' }}>{l}</text>
      })}
      {scaledSets.map((ds, i) => (
        <React.Fragment key={i}>
          <path d={makeArea(ds.points)} fill={`url(#${id}-g${i})`} />
          <path d={makePath(ds.points)} fill="none" stroke={ds.color} strokeWidth="1.5" strokeLinejoin="round" />
        </React.Fragment>
      ))}
      {hoverIdx !== null && (
        <>
          <line x1={scaledSets[0].points[hoverIdx].x} y1={pad.top}
            x2={scaledSets[0].points[hoverIdx].x} y2={pad.top + ch}
            stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="3,3" />
          {scaledSets.map((ds, i) => (
            <circle key={i} cx={ds.points[hoverIdx].x} cy={ds.points[hoverIdx].y}
              r="3.5" fill="var(--bg-card)" stroke={ds.color} strokeWidth="2" />
          ))}
          <g transform={`translate(${Math.min(scaledSets[0].points[hoverIdx].x + 10, W - 120)}, ${pad.top + 4})`}>
            <rect x="0" y="0" width="108" height={scaledSets.length * 20 + 24} rx="6"
              fill="var(--bg-elevated)" stroke="var(--border-default)" strokeWidth="1" />
            <text x="8" y="16" style={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'IBM Plex Sans' }}>
              {labels ? labels[hoverIdx] : ''}
            </text>
            {scaledSets.map((ds, i) => (
              <g key={i} transform={`translate(8, ${28 + i * 20})`}>
                <circle cx="4" cy="-4" r="3" fill={ds.color} />
                <text x="12" y="0" style={{ fontSize: 11, fill: 'var(--text-primary)', fontFamily: 'IBM Plex Mono', fontWeight: 500 }}>
                  {ds.prefix ?? ''}{ds.points[hoverIdx].val.toLocaleString()}{ds.suffix ?? ''}
                </text>
              </g>
            ))}
          </g>
        </>
      )}
    </svg>
  )
}
