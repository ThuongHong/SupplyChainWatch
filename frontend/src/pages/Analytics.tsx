import React, { useMemo, useEffect, useState, useRef } from 'react'
import Map, { NavigationControl } from 'react-map-gl/maplibre'
import DeckGL from '@deck.gl/react'
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { useQuery } from '@tanstack/react-query'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  apiClient,
  type AnomalyResponse,
  type PortResponse,
} from '../api/client'
import { queryKeys } from '../api/queries'
import { ENABLE_DEMO_FALLBACK } from '../api/config'
import { PageShell, SectionHeader, SkeletonBlock, ErrorPanel, EmptyState, DataProvenance } from '../components/DataState'
import { Card } from '../components/Card'
import { Badge } from '../components/Badge'
import { Icons } from '../components/icons'
import {
  metricValue,
} from '../api/viewModels'

const REAL_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const PORT_SEVERITY = ['high', 'medium', 'low'] as const
type PortSeverity = typeof PORT_SEVERITY[number]

const severityRank = (severity?: string | null) => severity === 'high' ? 3 : severity === 'medium' ? 2 : 1
const portSeverityColor = (severity?: string | null): [number, number, number] => {
  if (severity === 'high') return [224, 82, 82]
  if (severity === 'medium') return [214, 162, 31]
  return [14, 165, 165]
}
const portSeverityCss = (severity?: string | null) => severity === 'high' ? 'var(--danger)' : severity === 'medium' ? 'var(--warning)' : 'var(--accent)'
const meaningfulPortAnomaly = (anomaly: AnomalyResponse) => anomaly.severity === 'high' || anomaly.severity === 'medium'


type MapPort = PortResponse & {
  severity: PortSeverity
  activeAnomalyCount: number
  latestDriver?: string | null
  selected: boolean
}

const PortMap: React.FC<{
  ports: MapPort[]
  selectedPort?: PortResponse | null
  onSelectPort: (id: number) => void
}> = ({ ports, selectedPort, onSelectPort }) => {
  const mapRef = useRef<any>(null)
  const [hoverPort, setHoverPort] = useState<MapPort | null>(null)
  const [viewState, setViewState] = useState({
    longitude: selectedPort?.lon ?? 35,
    latitude: selectedPort?.lat ?? 22,
    zoom: selectedPort?.lon != null && selectedPort?.lat != null ? 3 : 1.55,
    pitch: 0,
    bearing: 0,
  })

  useEffect(() => {
    if (selectedPort?.lon == null || selectedPort?.lat == null) return
    setViewState(prev => ({
      ...prev,
      longitude: selectedPort.lon ?? prev.longitude,
      latitude: selectedPort.lat ?? prev.latitude,
      zoom: Math.max(prev.zoom, 2.7),
    }))
  }, [selectedPort?.id, selectedPort?.lat, selectedPort?.lon])

  const deckLayers = useMemo(() => [
    new ScatterplotLayer({
      id: 'analytics-port-halo',
      data: ports,
      getPosition: (d: MapPort) => [d.lon ?? 0, d.lat ?? 0],
      getFillColor: (d: MapPort) => [...portSeverityColor(d.severity), d.selected ? 90 : 42],
      getRadius: (d: MapPort) => d.selected ? 44000 : 26000,
      radiusMinPixels: 9,
      radiusMaxPixels: 36,
      pickable: false,
    }),
    new ScatterplotLayer({
      id: 'analytics-port-points',
      data: ports,
      getPosition: (d: MapPort) => [d.lon ?? 0, d.lat ?? 0],
      getFillColor: (d: MapPort) => [...portSeverityColor(d.severity), 235],
      getLineColor: (d: MapPort) => d.selected ? [253, 230, 138, 255] : [248, 250, 252, 220],
      getLineWidth: (d: MapPort) => d.selected ? 3 : 1,
      getRadius: (d: MapPort) => d.selected ? 15000 : 9000,
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 45],
      onHover: ({ object }: any) => setHoverPort(object ?? null),
      onClick: ({ object }: any) => object?.id && onSelectPort(object.id),
    }),
    new TextLayer({
      id: 'analytics-port-labels',
      data: ports,
      getPosition: (d: MapPort) => [d.lon ?? 0, d.lat ?? 0],
      getText: (d: MapPort) => d.selected ? `* ${d.name}` : d.name,
      getSize: (d: MapPort) => d.selected ? 12 : 10,
      getColor: (d: MapPort) => d.selected ? [253, 230, 138, 255] : [203, 213, 225, 230],
      getPixelOffset: [0, 15],
      getAlignmentBaseline: 'top',
      getTextAnchor: 'middle',
      fontFamily: 'IBM Plex Sans, system-ui, sans-serif',
      pickable: false,
    }),
  ], [ports, onSelectPort])

  return (
    <div className="analytics-deck-map">
      <DeckGL
        layers={deckLayers}
        viewState={viewState}
        onViewStateChange={({ viewState: nextViewState }: any) => setViewState(nextViewState)}
        controller
        getCursor={({ isDragging, isHovering }: any) => isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'}
      >
        <Map
          ref={mapRef}
          mapStyle={REAL_MAP_STYLE}
          reuseMaps
          attributionControl={false}
        >
          <NavigationControl position="top-right" showCompass={false} />
        </Map>
      </DeckGL>
      {hoverPort && (
        <div className="analytics-map-tooltip">
          <strong>{hoverPort.name}</strong>
          <span>{hoverPort.country}</span>
          <span>Port Anomaly Severity: {hoverPort.severity}</span>
          <span>{hoverPort.activeAnomalyCount} medium/high rows · {hoverPort.latestDriver ?? 'no driver'}</span>
        </div>
      )}
    </div>
  )
}

export const Analytics: React.FC = () => {
  const [selectedPortId, setSelectedPortId] = useState<number | null>(null)
  const [days, setDays] = useState<number>(30)
  const [metric, setMetric] = useState<string>('vessel_count')

  const portsQuery = useQuery({
    queryKey: queryKeys.ports(),
    queryFn: ({ signal }) => apiClient.ports(undefined, { signal }),
  })

  useEffect(() => {
    if (portsQuery.data && portsQuery.data.length > 0 && selectedPortId === null) {
      setSelectedPortId(portsQuery.data[0].id)
    }
  }, [portsQuery.data, selectedPortId])

  const activityQuery = useQuery({
    queryKey: queryKeys.portActivity(selectedPortId ?? undefined, days),
    queryFn: ({ signal }) =>
      apiClient.portActivity(
        { port_id: selectedPortId ?? undefined, days },
        { signal }
      ),
    enabled: selectedPortId !== null,
  })

  const comparisonQuery = useQuery({
    queryKey: queryKeys.portComparison(days, metric),
    queryFn: ({ signal }) => apiClient.portComparison({ days, metric }, { signal }),
  })

  const anomaliesQuery = useQuery({
    queryKey: queryKeys.anomalies(days, undefined, selectedPortId ?? undefined, 50),
    queryFn: ({ signal }) => apiClient.anomalies({ days, port_id: selectedPortId ?? undefined, limit: 50 }, { signal }),
    enabled: selectedPortId !== null,
  })
  const allPortAnomaliesQuery = useQuery({
    queryKey: queryKeys.anomalies(days, undefined, undefined, 500),
    queryFn: ({ signal }) => apiClient.anomalies({ days, limit: 500 }, { signal }),
  })
  // selectedPortId starts null → activityQuery is disabled (isLoading=false but no data yet)
  // So we also treat "portId not set yet" or "activity currently fetching" as loading
  const activityLoading = selectedPortId === null || activityQuery.isLoading || activityQuery.isFetching
  const loading = portsQuery.isLoading || activityLoading || comparisonQuery.isLoading || anomaliesQuery.isLoading
  const error = portsQuery.error ?? activityQuery.error ?? comparisonQuery.error ?? anomaliesQuery.error ?? allPortAnomaliesQuery.error

  const mapPorts = useMemo(() => {
    return (portsQuery.data ?? []).filter(p => p.lat !== null && p.lon !== null)
  }, [portsQuery.data])
  const selectedPort = useMemo(() => {
    return (portsQuery.data ?? []).find(port => port.id === selectedPortId) ?? null
  }, [portsQuery.data, selectedPortId])
  const portAnomalies = useMemo(() => {
    return (anomaliesQuery.data ?? []).filter((anomaly: AnomalyResponse) =>
      anomaly.port_id != null || anomaly.entity_type === 'port'
    )
  }, [anomaliesQuery.data])
  const allPortAnomalies = useMemo(() => {
    return (allPortAnomaliesQuery.data ?? []).filter((anomaly: AnomalyResponse) =>
      anomaly.port_id != null || anomaly.entity_type === 'port'
    )
  }, [allPortAnomaliesQuery.data])
  const activePortAnomalies = useMemo(() => portAnomalies.filter(meaningfulPortAnomaly), [portAnomalies])
  const highestZScore = useMemo(() => {
    const scores = portAnomalies.map(anomaly => Math.abs(anomaly.anomaly_score ?? anomaly.z_score ?? 0))
    return scores.length ? Math.max(...scores) : null
  }, [portAnomalies])
  const latestActivity = useMemo(() => {
    const sorted = [...(activityQuery.data ?? [])].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    return sorted[sorted.length - 1]
  }, [activityQuery.data])
  const latestBaseline = useMemo(() => {
    const latestAnomaly = portAnomalies[0]
    if (latestAnomaly?.baseline_mean != null && latestAnomaly.baseline_mean > 0) return latestAnomaly.baseline_mean
    const sorted = [...(activityQuery.data ?? [])].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    const sample = sorted.slice(-8, -1).map(point => point.value)
    return sample.length ? sample.reduce((sum, value) => sum + value, 0) / sample.length : null
  }, [activityQuery.data, portAnomalies])
  const latestDriver = portAnomalies[0]?.main_driver ?? portAnomalies[0]?.metric ?? null
  const severityMix = useMemo(() => {
    return PORT_SEVERITY.reduce<Record<PortSeverity, number>>((acc, severity) => {
      acc[severity] = portAnomalies.filter(anomaly => anomaly.severity === severity).length
      return acc
    }, { high: 0, medium: 0, low: 0 })
  }, [portAnomalies])
  const mapPortRows = useMemo<MapPort[]>(() => {
    return mapPorts.map(port => {
      const anomalies = allPortAnomalies.filter(anomaly => anomaly.port_id === port.id || anomaly.entity_id === String(port.id))
      const active = anomalies.filter(meaningfulPortAnomaly)
      const top = active.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0]
      return {
        ...port,
        severity: (top?.severity === 'high' || top?.severity === 'medium' ? top.severity : 'low') as PortSeverity,
        activeAnomalyCount: active.length,
        latestDriver: top?.main_driver ?? top?.metric,
        selected: port.id === selectedPortId,
      }
    })
  }, [allPortAnomalies, mapPorts, selectedPortId])

  const isActivityDataValid = (data: any[] | undefined) => {
    return data && Array.isArray(data) && data.length >= 2
  }

  const isComparisonDataValid = (data: any[] | undefined) => {
    return data && Array.isArray(data) && data.length >= 2
  }

  const isDistributionDataValid = (data: any[] | undefined) => {
    return data && Array.isArray(data) && data.length >= 5
  }

  const isAnomalyTimelineDataValid = (data: any[] | undefined) => {
    return data && Array.isArray(data) && data.length >= 8
  }

  const renderSeverityMix = () => {
    const total = PORT_SEVERITY.reduce((sum, severity) => sum + severityMix[severity], 0)
    if (total === 0) {
      return <EmptyState title="No severity mix yet" detail="Selected port has no rolling baseline anomaly rows in this window." compact />
    }
    return (
      <div className="severity-mix">
        <div className="severity-mix__bar" aria-label="Port Severity Mix">
          {PORT_SEVERITY.map(severity => (
            <span
              key={severity}
              title={`${severity}: ${severityMix[severity]} rows`}
              style={{
                width: severityMix[severity] ? `${Math.max(4, severityMix[severity] / total * 100)}%` : 0,
                background: portSeverityCss(severity),
                opacity: severityMix[severity] ? 1 : 0.28,
              }}
            />
          ))}
        </div>
        <div className="severity-mix__legend">
          {PORT_SEVERITY.map(severity => (
            <span key={severity}>
              <i style={{ background: portSeverityCss(severity) }} />
              {severity} <b className="mono-num">{severityMix[severity]}</b>
            </span>
          ))}
        </div>
      </div>
    )
  }

  const renderActivityChart = () => {
    if (!isActivityDataValid(activityQuery.data)) {
      return (
        <EmptyState
          title="No real PortWatch time series data available"
          detail="At least 2 historical data points are required to plot this trend line."
          compact
        />
      )
    }

    const pts = [...(activityQuery.data || [])].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    const width = 600
    const height = 240
    const pad = { top: 20, right: 20, bottom: 30, left: 50 }

    const values = pts.map(p => p.value)
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)
    const range = maxVal - minVal || 1

    const coords = pts.map((p, idx) => {
      const x = pad.left + (idx / (pts.length - 1)) * (width - pad.left - pad.right)
      const y = pad.top + (1 - (p.value - minVal) / range) * (height - pad.top - pad.bottom)
      return { x, y, ...p }
    })

    const linePath = coords.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const areaPath = linePath + ` L${coords[coords.length - 1].x.toFixed(1)},${height - pad.bottom} L${coords[0].x.toFixed(1)},${height - pad.bottom} Z`

    return (
      <div style={{ position: 'relative', width: '100%' }}>
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id="activityGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          {Array.from({ length: 4 }).map((_, i) => {
            const y = pad.top + (i / 3) * (height - pad.top - pad.bottom)
            const val = maxVal - (i / 3) * range
            return (
              <g key={i}>
                <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="var(--border-subtle)" strokeWidth="0.5" strokeDasharray="2,2" />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" style={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>
                  {Math.round(val)}
                </text>
              </g>
            )
          })}
          {pts.map((p, idx) => {
            if (idx % Math.ceil(pts.length / 5) !== 0 && idx !== pts.length - 1) return null
            const x = pad.left + (idx / (pts.length - 1)) * (width - pad.left - pad.right)
            const dateStr = new Date(p.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            return (
              <text key={idx} x={x} y={height - 12} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--text-muted)' }}>
                {dateStr}
              </text>
            )
          })}
          <path d={areaPath} fill="url(#activityGrad)" />
          <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }

  const renderAnomalyTimeline = () => {
    if (!isAnomalyTimelineDataValid(activityQuery.data)) {
      return (
        <EmptyState
          title="Not enough historical data to calculate anomalies"
          detail="A minimum of 8 consecutive data points is required to calculate a 7-day rolling baseline."
          compact
        />
      )
    }

    const pts = [...(activityQuery.data || [])].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    const rollingPoints = pts.map((p, idx) => {
      if (idx < 7) {
        return { ...p, rollingMean: null, rollingStd: null, z: 0, isAnomaly: false, severity: 'low' }
      }
      const prev = pts.slice(idx - 7, idx)
      const vals = prev.map(pt => pt.value)
      const mean = vals.reduce((s, v) => s + v, 0) / 7
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / 7
      const std = Math.sqrt(variance)
      const z = std > 0 ? (p.value - mean) / std : 0
      const isAnomaly = z >= 2.0
      const severity = z >= 3.0 ? 'high' : z >= 2.0 ? 'medium' : 'low'
      return { ...p, rollingMean: mean, rollingStd: std, z, isAnomaly, severity }
    })

    const width = 600
    const height = 240
    const pad = { top: 20, right: 20, bottom: 30, left: 50 }

    const values = pts.map(p => p.value)
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)
    const range = maxVal - minVal || 1

    const coords = rollingPoints.map((p, idx) => {
      const x = pad.left + (idx / (pts.length - 1)) * (width - pad.left - pad.right)
      const y = pad.top + (1 - (p.value - minVal) / range) * (height - pad.top - pad.bottom)
      const yMean = p.rollingMean !== null ? pad.top + (1 - (p.rollingMean - minVal) / range) * (height - pad.top - pad.bottom) : null
      return { x, y, yMean, ...p }
    })

    const linePath = coords.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const meanCoords = coords.filter(c => c.yMean !== null)
    const meanPath = meanCoords.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.yMean!.toFixed(1)}`).join(' ')

    return (
      <div style={{ position: 'relative', width: '100%' }}>
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
          {Array.from({ length: 4 }).map((_, i) => {
            const y = pad.top + (i / 3) * (height - pad.top - pad.bottom)
            const val = maxVal - (i / 3) * range
            return (
              <g key={i}>
                <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="var(--border-subtle)" strokeWidth="0.5" strokeDasharray="2,2" />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" style={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>
                  {Math.round(val)}
                </text>
              </g>
            )
          })}
          {pts.map((p, idx) => {
            if (idx % Math.ceil(pts.length / 5) !== 0 && idx !== pts.length - 1) return null
            const x = pad.left + (idx / (pts.length - 1)) * (width - pad.left - pad.right)
            const dateStr = new Date(p.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            return (
              <text key={idx} x={x} y={height - 12} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--text-muted)' }}>
                {dateStr}
              </text>
            )
          })}
          <path d={linePath} fill="none" stroke="var(--text-secondary)" strokeWidth="1" strokeLinejoin="round" opacity="0.6" />
          {meanPath && (
            <path d={meanPath} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="3,3" strokeLinejoin="round" />
          )}
          {coords.map((c, idx) => {
            if (!c.isAnomaly) return null
            const color = c.severity === 'high' ? 'var(--cong-high)' : 'var(--cong-med)'
            return (
              <g key={idx}>
                <title>{`${new Date(c.time).toLocaleDateString()}: observed ${Math.round(c.value)}, baseline ${c.rollingMean?.toFixed(1) ?? 'n/a'}, z-score ${c.z.toFixed(2)}, Port Anomaly Severity ${c.severity}`}</title>
                <circle cx={c.x} cy={c.y} r="5" fill={color} stroke="var(--bg-card)" strokeWidth="1" />
                <circle cx={c.x} cy={c.y} r="9" fill="none" stroke={color} strokeWidth="1" opacity="0.4" />
              </g>
            )
          })}
        </svg>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 12, fontSize: 10, color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 12, height: 1.5, background: 'var(--text-secondary)', opacity: 0.6 }} />
            Actual Value
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 12, height: 1.5, background: 'var(--accent)', borderTop: '1.5px dashed var(--accent)' }} />
            Rolling Mean (7d)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--cong-high)' }} />
            High Anomaly (Z ≥ 3)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--cong-med)' }} />
            Medium Anomaly (Z ≥ 2)
          </span>
        </div>
      </div>
    )
  }

  const renderComparisonChart = () => {
    if (!isComparisonDataValid(comparisonQuery.data)) {
      return (
        <EmptyState
          title="At least two ports are required for comparison"
          detail="Ensure the database has PortWatch metrics for multiple ports in this time range."
          compact
        />
      )
    }

    const data = comparisonQuery.data || []
    const maxVal = Math.max(...data.map(d => d.value)) || 1

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {data.map((item) => {
          const pct = Math.max(2, (item.value / maxVal) * 100)
          return (
            <div key={item.port_id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.port_name}
              </div>
              <div style={{ height: 10, background: 'var(--bg-hover)', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 5 }} />
              </div>
              <div className="mono-num" style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
                {Math.round(item.value)}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderDistributionChart = () => {
    if (!isDistributionDataValid(activityQuery.data)) {
      return (
        <EmptyState
          title="At least five data points are required to render distribution"
          detail="Not enough historical activity records for the selected port."
          compact
        />
      )
    }

    const values = activityQuery.data!.map(d => d.value)
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)
    const range = maxVal - minVal || 1

    const numBins = 5
    const binWidth = range / numBins
    const bins = Array.from({ length: numBins }, (_, idx) => {
      const start = minVal + idx * binWidth
      const end = start + binWidth
      return { start, end, count: 0 }
    })

    values.forEach(v => {
      const binIdx = Math.min(numBins - 1, Math.floor((v - minVal) / binWidth))
      if (bins[binIdx]) {
        bins[binIdx].count++
      }
    })

    const maxCount = Math.max(...bins.map(b => b.count)) || 1
    const width = 500
    const height = 200
    const pad = { top: 15, right: 15, bottom: 25, left: 35 }
    const cw = width - pad.left - pad.right
    const ch = height - pad.top - pad.bottom

    return (
      <div style={{ width: '100%' }}>
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
          {Array.from({ length: 4 }).map((_, i) => {
            const y = pad.top + (i / 3) * ch
            const val = maxCount - (i / 3) * maxCount
            return (
              <g key={i}>
                <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="var(--border-subtle)" strokeWidth="0.5" strokeDasharray="2,2" />
                <text x={pad.left - 6} y={y + 3} textAnchor="end" style={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>
                  {Math.round(val)}
                </text>
              </g>
            )
          })}
          {bins.map((bin, idx) => {
            const barW = (cw / numBins) - 6
            const barH = (bin.count / maxCount) * ch
            const x = pad.left + idx * (cw / numBins) + 3
            const y = pad.top + ch - barH

            return (
              <g key={idx}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  fill="var(--accent)"
                  opacity="0.8"
                  rx="3"
                >
                  <title>{`${Math.round(bin.start)}-${Math.round(bin.end)}: ${bin.count} observations`}</title>
                </rect>
                <text
                  x={x + barW / 2}
                  y={height - 6}
                  textAnchor="middle"
                  style={{ fontSize: 8, fill: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}
                >
                  {Math.round(bin.start)}-{Math.round(bin.end)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    )
  }

  return (
    <PageShell
      title="Exploratory Analysis"
      subtitle="Trend, distribution, anomaly detection, comparison, and interpretation from live source data."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <ErrorPanel error={error} title="Data unavailable" compact />}


        {/* Global Controls */}
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>SELECT PORT</label>
              <select
                value={selectedPortId || ''}
                onChange={e => setSelectedPortId(Number(e.target.value))}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  padding: '6px 12px',
                  fontSize: 13,
                  outline: 'none',
                  minWidth: 160,
                }}
              >
                {portsQuery.data?.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>TIME RANGE</label>
              <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: 6, border: '1px solid var(--border-default)', padding: 2 }}>
                {[7, 30, 90].map(val => (
                  <button
                    key={val}
                    onClick={() => setDays(val)}
                    style={{
                      border: 'none',
                      background: days === val ? 'var(--accent)' : 'transparent',
                      color: days === val ? 'var(--text-accent)' : 'var(--text-muted)',
                      borderRadius: 4,
                      padding: '4px 12px',
                      fontSize: 12,
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    {val}d
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>COMPARISON METRIC</label>
              <select
                value={metric}
                onChange={e => setMetric(e.target.value)}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  padding: '6px 12px',
                  fontSize: 13,
                  outline: 'none',
                  minWidth: 160,
                }}
              >
                <option value="vessel_count">Vessel Count</option>
                <option value="portcalls">Port Calls</option>
                <option value="import">Import Volume</option>
                <option value="export">Export Volume</option>
              </select>
            </div>
          </div>
        </Card>

        <div className="analytics-kpi-grid">
          <div className="analytics-kpi-card">
            <span>Latest Activity</span>
            <b className="mono-num">{latestActivity ? Math.round(latestActivity.value) : 'n/a'}</b>
            <small>{latestActivity ? new Date(latestActivity.time).toLocaleDateString() : 'Waiting for PortWatch activity'}</small>
          </div>
          <div className="analytics-kpi-card">
            <span>Rolling Baseline</span>
            <b className="mono-num">{latestBaseline != null ? latestBaseline.toFixed(1) : 'n/a'}</b>
            <small>7-point mean where available</small>
          </div>
          <div className="analytics-kpi-card">
            <span>Highest Z-Score</span>
            <b className="mono-num">{highestZScore != null ? highestZScore.toFixed(2) : 'n/a'}</b>
            <small>Largest selected-window deviation</small>
          </div>
          <div className="analytics-kpi-card">
            <span>Anomaly Count</span>
            <b className="mono-num">{activePortAnomalies.length}</b>
            <small>Medium/high Port Anomaly Severity rows</small>
          </div>
          <div className="analytics-kpi-card">
            <span>Main Driver</span>
            <b>{latestDriver?.replace(/_/g, ' ') ?? 'n/a'}</b>
            <small>Latest anomaly driver</small>
          </div>
        </div>


        {/* Charts: Activity & Anomalies */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 16 }}>
          <Card style={{ padding: 16 }}>
            <SectionHeader title="Port Activity Time Series" sub="Observed vessel counts over time" />
            <div style={{ marginTop: 12 }}>
              {loading ? <SkeletonBlock height={240} /> : renderActivityChart()}
            </div>
          </Card>

          <Card style={{ padding: 16 }}>
            <SectionHeader title="Port Anomaly Timeline (Z-Scores)" sub="Port Anomaly Severity: medium z-score >= 2, high z-score >= 3, based on 7-point rolling baseline." />
            <div style={{ marginTop: 12 }}>
              {loading ? <SkeletonBlock height={240} /> : renderAnomalyTimeline()}
            </div>
          </Card>
        </div>

        {/* Charts: Comparison & Distribution */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 16 }}>
          <Card style={{ padding: 16 }}>
            <SectionHeader title="Top Ports Comparison" sub="Sorted average values across ports" />
            <div style={{ marginTop: 12 }}>
              {loading ? <SkeletonBlock height={200} /> : renderComparisonChart()}
            </div>
          </Card>

          <Card style={{ padding: 16 }}>
            <SectionHeader title="Port Activity Distribution" sub="Frequency distribution of activity values" />
            <div style={{ marginTop: 12 }}>
              {loading ? <SkeletonBlock height={200} /> : renderDistributionChart()}
            </div>
          </Card>
        </div>

        <Card style={{ padding: 16 }}>
          <SectionHeader title="Port Severity Mix" sub="Selected-window split of Port Anomaly Severity rows for the selected port." />
          {loading ? <SkeletonBlock height={96} /> : renderSeverityMix()}
        </Card>

        {/* Port Map */}
        <Card style={{ padding: 16 }}>
          <SectionHeader title="Geographical Port Map" sub="Same map engine as Live Vessel Map; ports only, colored by Port Anomaly Severity." />
          <div className="analytics-map-layout" style={{ marginTop: 12 }}>
            {loading ? (
              <SkeletonBlock height={350} />
            ) : mapPorts.length === 0 ? (
              <EmptyState title="No coordinates available for port map" detail="Make sure port reference data includes valid latitude and longitude." compact />
            ) : (
              <>
                <PortMap ports={mapPortRows} selectedPort={selectedPort} onSelectPort={setSelectedPortId} />
                <div className="panel-note analytics-map-side">
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Selected Port</div>
                  <div style={{ marginTop: 8, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{selectedPort?.name ?? 'No port selected'}</div>
                  <div style={{ marginTop: 3, fontSize: 12, color: 'var(--text-secondary)' }}>{selectedPort?.country ?? 'Waiting for port reference row'}</div>
                  <div style={{ display: 'grid', gap: 8, marginTop: 14, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ color: 'var(--text-muted)' }}>LOCODE</span>
                      <b className="mono-num">{selectedPort?.locode ?? 'n/a'}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Latitude</span>
                      <b className="mono-num">{selectedPort?.lat?.toFixed(3) ?? 'n/a'}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Longitude</span>
                      <b className="mono-num">{selectedPort?.lon?.toFixed(3) ?? 'n/a'}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Port anomalies</span>
                      <b className="mono-num" style={{ color: activePortAnomalies.length ? 'var(--warning)' : 'var(--success)' }}>{activePortAnomalies.length}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Latest driver</span>
                      <b>{latestDriver?.replace(/_/g, ' ') ?? 'n/a'}</b>
                    </div>
                  </div>
                  <div style={{ marginTop: 14, color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.5 }}>
                    Map marks come from /api/ports. They are port reference coordinates, not AIS vessel positions.
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Anomalies Log */}
        <Card style={{ padding: 16 }}>
          <SectionHeader
            title="Port Anomaly Detection Log"
            sub="PortWatch port metric z-score / threshold violations only; AIS vessel anomalies are excluded."
            action={<DataProvenance mode={anomaliesQuery.isLoading ? 'loading' : portAnomalies.length ? 'live' : 'empty'} source="/api/anomalies?port_id=selected" />}
          />
          {loading ? <SkeletonBlock height={150} /> : portAnomalies.length === 0 ? (
            <EmptyState title="No PortWatch port anomalies detected" detail="Selected port metrics are within normal baseline variation for this time range." compact />
          ) : (
            <div style={{ width: '100%', overflowX: 'auto', marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 4px', fontWeight: 500 }}>Time</th>
                    <th style={{ padding: '8px 4px', fontWeight: 500 }}>Port</th>
                    <th style={{ padding: '8px 4px', fontWeight: 500 }}>Port Anomaly Severity</th>
                    <th style={{ padding: '8px 4px', fontWeight: 500 }}>Driver</th>
                    <th style={{ padding: '8px 4px', fontWeight: 500, textAlign: 'right' }}>Current Value</th>
                    <th style={{ padding: '8px 4px', fontWeight: 500, textAlign: 'right' }}>Baseline Mean</th>
                    <th style={{ padding: '8px 4px', fontWeight: 500, textAlign: 'right' }}>Z-Score</th>
                  </tr>
                </thead>
                <tbody>
                  {portAnomalies.slice(0, 15).map(anomaly => (
                    <tr key={anomaly.id} style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                      <td style={{ padding: '8px 4px', whiteSpace: 'nowrap' }}>{new Date(anomaly.detected_at).toLocaleDateString()}</td>
                      <td style={{ padding: '8px 4px', fontWeight: 500, color: 'var(--text-primary)' }}>{anomaly.port_name || anomaly.entity_id}</td>
                      <td style={{ padding: '8px 4px' }}><Badge variant={anomaly.severity === 'high' ? 'danger' : 'warning'}>{anomaly.severity}</Badge></td>
                      <td style={{ padding: '8px 4px' }}>{anomaly.metric || anomaly.main_driver || 'vessel_count'}</td>
                      <td className="mono-num" style={{ padding: '8px 4px', textAlign: 'right' }}>
                        {anomaly.observed !== undefined && anomaly.observed !== null ? Math.round(anomaly.observed) : anomaly.current_value !== undefined && anomaly.current_value !== null ? Math.round(anomaly.current_value) : 'N/A'}
                      </td>
                      <td className="mono-num" style={{ padding: '8px 4px', textAlign: 'right' }}>
                        {anomaly.expected !== undefined && anomaly.expected !== null ? Math.round(anomaly.expected) : anomaly.baseline_mean !== undefined && anomaly.baseline_mean !== null ? Math.round(anomaly.baseline_mean) : 'N/A'}
                      </td>
                      <td className="mono-num" style={{ padding: '8px 4px', textAlign: 'right', color: anomaly.z_score && anomaly.z_score >= 2 ? 'var(--danger)' : 'inherit' }}>
                        {anomaly.z_score ? anomaly.z_score.toFixed(2) : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  )
}
