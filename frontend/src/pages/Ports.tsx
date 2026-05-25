import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  apiClient,
  type DataCoverageResponse,
  type EntityRiskForecastResponse,
  type PortCongestionResponse,
  type RiskEntityHistoryResponse,
  type RiskStoryEventResponse,
  type AnomalyResponse,
} from '../api/client'
import { ENABLE_DEMO_FALLBACK } from '../api/config'
import { queryKeys } from '../api/queries'
import {
  buildPortViewModels,
  formatDateTime,
  rowDataMode,
  shouldUseDemoRows,
  relativeTime,
  congestionSeverity,
  type PortViewModel,
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
import { MiniMap, PORT_DATA } from '../components/MiniMap'
import { Sparkline } from '../components/Sparkline'
import { fmtNum } from '../data/mock'
import type { PageId } from '../components/layout/Sidebar'

type Region = 'All' | string

const severityColor: Record<Severity, string> = {
  low: 'var(--success)',
  medium: 'var(--warning)',
  high: 'var(--danger)',
}

function demoPorts(): PortViewModel[] {
  return PORT_DATA.map((port, index) => ({
    id: index + 1,
    locode: null,
    name: port.name,
    country: ['Shanghai', 'Ningbo', 'Shenzhen', 'Hong Kong'].includes(port.name) ? 'China'
      : port.name === 'Singapore' ? 'Singapore'
        : port.name === 'Rotterdam' ? 'Netherlands'
          : port.name === 'Los Angeles' ? 'USA'
            : port.name === 'Antwerp' ? 'Belgium'
              : port.name === 'Busan' ? 'South Korea'
                : 'Germany',
    region: ['Shanghai', 'Singapore', 'Ningbo', 'Busan', 'Shenzhen', 'Hong Kong'].includes(port.name) ? 'Asia'
      : ['Rotterdam', 'Antwerp', 'Hamburg'].includes(port.name) ? 'Europe'
        : 'Americas',
    lat: port.lat,
    lon: port.lon,
    radius_km: 25,
    twenty_ft_eq_units_year: 40_000 - index * 2_150,
    severity: port.congestion,
    stale: false,
    congestion: {
      time: new Date(Date.now() - index * 20 * 60_000).toISOString(),
      port_id: index + 1,
      port_name: port.name,
      anchored_count: port.congestion === 'high' ? 56 + index : port.congestion === 'medium' ? 22 + index : 7 + index,
      moored_count: port.congestion === 'high' ? 46 : port.congestion === 'medium' ? 20 : 8,
      underway_count: 10 + index,
      total_in_area: port.congestion === 'high' ? 120 + index * 2 : port.congestion === 'medium' ? 64 + index : 25 + index,
      avg_dwell_hours: port.congestion === 'high' ? 28 : port.congestion === 'medium' ? 11 : 4,
      median_speed: port.congestion === 'high' ? 1.2 : port.congestion === 'medium' ? 2.4 : 5.1,
    },
  }))
}

function timelineValues(rows: PortCongestionResponse[], fallbackSeed: number, demo: boolean): number[] {
  if (rows.length > 1) return rows.map(row => row.total_in_area)
  if (!demo) return []
  return Array.from({ length: 14 }, (_, i) => Math.max(8, Math.round(35 + Math.sin((i + fallbackSeed) / 2) * 12 + fallbackSeed)))
}

function riskEntityId(port: PortViewModel): string | null {
  return port.locode ? `port-${port.locode.toLowerCase()}` : null
}

const PortCard: React.FC<{ port: PortViewModel; demo: boolean; onClick: () => void; anomaly?: any }> = ({ port, demo, onClick, anomaly }) => {
  const row = port.congestion
  const sparkData = demo ? timelineValues([], port.id, true) : []
  const aisCount = row?.total_in_area ?? 0
  const pwCount = (row as PortCongestionResponse | undefined)?.portwatch_n_total ?? null
  const pwPortcalls = (row as PortCongestionResponse | undefined)?.portwatch_portcalls ?? null
  // Priority: AIS total_in_area → PortWatch n_total → PortWatch portcalls (weekly)
  const displayCount = aisCount > 0 ? aisCount : pwCount != null ? pwCount : (pwPortcalls ?? 0)
  const displaySource = aisCount > 0 ? 'AIS vessels in area' : pwCount != null ? 'PortWatch vessels' : pwPortcalls != null ? 'PortWatch portcalls/wk' : 'vessels in area'
  const displaySeverity = (anomaly ? anomaly.severity : 'low') as Severity
  const congSeverity = congestionSeverity(row)
  return (
    <Card hover onClick={onClick} style={{ padding: '14px 16px', cursor: 'pointer', border: anomaly ? `1px solid ${anomaly.severity === 'high' ? 'var(--danger)' : 'var(--warning)'}` : undefined }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{port.name}</span>
            {port.stale && <Badge variant="warning">Stale</Badge>}
            {anomaly && (
              <span style={{ color: anomaly.severity === 'high' ? 'var(--danger)' : 'var(--warning)', display: 'flex', alignItems: 'center' }} title={`${anomaly.severity.toUpperCase()} anomaly active`}>
                <Icons.AlertTriangle size={13} />
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{port.country} · {port.region ?? 'Unclassified'}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <Badge variant={displaySeverity === 'high' ? 'danger' : displaySeverity === 'medium' ? 'warning' : 'success'} style={{ fontSize: 9 }}>
            ANOMALY: {displaySeverity.toUpperCase()}
          </Badge>
        </div>
      </div>
      {anomaly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, color: anomaly.severity === 'high' ? 'var(--danger)' : 'var(--warning)', fontSize: 11, fontWeight: 500 }}>
          <Icons.AlertTriangle size={12} />
          <span>{anomaly.severity.toUpperCase()} anomaly: {anomaly.main_driver?.replace(/_/g, ' ')}</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="mono-num" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>{displayCount}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{displaySource}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 12 }}>
            <div>
              <div className="mono-num" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{row?.anchored_count ?? 0}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>anchored</div>
            </div>
            {pwPortcalls != null && (
              <div>
                <div className="mono-num" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pwPortcalls}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>portcalls/wk</div>
              </div>
            )}
            {pwPortcalls == null && (
              <div>
                <div className="mono-num" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{row?.avg_dwell_hours?.toFixed(1) ?? 'n/a'}h</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>dwell</div>
              </div>
            )}
          </div>
        </div>
        <Sparkline data={sparkData} color={severityColor[displaySeverity]} width={72} height={36} />
      </div>
    </Card>
  )
}

const PortDetail: React.FC<{
  port: PortViewModel
  timeline: PortCongestionResponse[]
  history?: RiskEntityHistoryResponse
  coverage: DataCoverageResponse[]
  stories: RiskStoryEventResponse[]
  forecast?: EntityRiskForecastResponse
  loading: boolean
  demo: boolean
  anomaly?: any
  onClose: () => void
  onNavigate?: (page: PageId) => void
}> = ({ port, timeline, history, coverage, stories, forecast, loading, demo, anomaly, onClose, onNavigate }) => {
  const values = timelineValues(timeline, port.id, demo)
  const riskHistoryValues = history?.snapshots.map(row => Number(row.risk_score ?? 0)).filter(Number.isFinite) ?? []
  const insufficientHistory = history?.data_sufficiency?.status === 'insufficient_history'
  const forecastScores = (forecast?.predictions ?? [])
    .map(point => point.risk_score)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 1
  const range = max - min || 1
  const W = 360, H = 116
  const points = values.map((value, i) => ({
    x: 12 + (i / Math.max(values.length - 1, 1)) * (W - 24),
    y: 10 + (1 - (value - min) / range) * (H - 28),
  }))
  const path = points.map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')

  const timelineAnomalies = useMemo(() => {
    if (!timeline || timeline.length <= 1) return []
    const sorted = [...timeline].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    return sorted.map((p, i) => {
      const windowPoints = sorted.slice(Math.max(0, i - 7), i)
      if (windowPoints.length < 7) {
        return {
          isAnomaly: false,
          severity: 'low' as const,
          score: 0,
          rollingMean: p.total_in_area,
        }
      }
      const getStats = (vals: number[]) => {
        const mean = vals.reduce((sum, v) => sum + v, 0) / vals.length
        const variance = vals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / vals.length
        const std = Math.sqrt(variance)
        return { mean, std }
      }
      const totalVals = windowPoints.map(w => w.total_in_area)
      const anchoredVals = windowPoints.map(w => w.anchored_count)
      const dwellVals = windowPoints.map(w => w.avg_dwell_hours ?? 0).filter(Boolean)
      const speedVals = windowPoints.map(w => w.median_speed ?? 0).filter(Boolean)
      const totalStats = getStats(totalVals)
      const anchoredStats = getStats(anchoredVals)
      const dwellStats = dwellVals.length >= 7 ? getStats(dwellVals) : { mean: 0, std: 0 }
      const speedStats = speedVals.length >= 7 ? getStats(speedVals) : { mean: 0, std: 0 }
      const totalZ = totalStats.std > 0 ? (p.total_in_area - totalStats.mean) / totalStats.std : 0
      const anchoredZ = anchoredStats.std > 0 ? (p.anchored_count - anchoredStats.mean) / anchoredStats.std : 0
      const dwellZ = (p.avg_dwell_hours && dwellStats.std > 0) ? (p.avg_dwell_hours - dwellStats.mean) / dwellStats.std : 0
      const speedZ = (p.median_speed && speedStats.std > 0) ? (speedStats.mean - p.median_speed) / speedStats.std : 0
      const score = Math.max(totalZ, anchoredZ, dwellZ, speedZ)
      const severity: 'high' | 'medium' | 'low' = score >= 3.0 ? 'high' : score >= 2.0 ? 'medium' : 'low'
      return {
        isAnomaly: severity === 'high' || severity === 'medium',
        severity,
        score,
        rollingMean: totalStats.mean,
      }
    })
  }, [timeline])

  const rollingMeanPoints = values.map((value, i) => {
    const anomalyVal = demo ? null : timelineAnomalies[i]
    const meanVal = anomalyVal ? anomalyVal.rollingMean : value * 0.95
    return {
      x: 12 + (i / Math.max(values.length - 1, 1)) * (W - 24),
      y: 10 + (1 - (meanVal - min) / range) * (H - 28),
    }
  })
  const rollingMeanPath = rollingMeanPoints.map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')

  const displaySeverity = (anomaly ? anomaly.severity : 'low') as Severity
  const congSeverity = congestionSeverity(port.congestion)

  const latestSnapshot = useMemo(() => {
    let rawSnap: any = null
    if (demo) {
      rawSnap = {
        risk_score: 82,
        driver_metadata: {
          component_scores: {
            congestion: 20.0,
            traffic_anomaly: 45.0,
            weather: 10.0,
            data_quality: 7.0,
          }
        }
      }
    } else if (history?.snapshots && history.snapshots.length > 0) {
      rawSnap = history.snapshots[history.snapshots.length - 1]
    }

    if (!rawSnap) {
      const congScore = congSeverity === 'high' ? 25 : congSeverity === 'medium' ? 15 : 5
      const anomScore = displaySeverity === 'high' ? 40 : displaySeverity === 'medium' ? 25 : 5
      rawSnap = {
        risk_score: congScore + anomScore + 7,
        driver_metadata: {
          component_scores: {
            congestion: congScore,
            traffic_anomaly: anomScore,
            weather: 5.0,
            data_quality: 2.0,
          }
        }
      }
    }

    const rawScores = rawSnap.driver_metadata?.component_scores || {}
    const congestion = typeof rawScores.congestion === 'number'
      ? rawScores.congestion
      : (typeof rawScores.derived_congestion_risk === 'number' ? (rawScores.derived_congestion_risk / 100) * 30 : 5.0)
    const traffic_anomaly = typeof rawScores.traffic_anomaly === 'number'
      ? rawScores.traffic_anomaly
      : 15.0
    const weather = typeof rawScores.weather === 'number' ? rawScores.weather : 5.0
    const data_quality = typeof rawScores.data_quality === 'number' ? rawScores.data_quality : 2.0

    return {
      risk_score: rawSnap.risk_score || (congestion + traffic_anomaly + weather + data_quality),
      driver_metadata: {
        component_scores: {
          congestion,
          traffic_anomaly,
          weather,
          data_quality,
        }
      }
    }
  }, [demo, history, congSeverity, displaySeverity])

  return (
    <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)', boxShadow: '-8px 0 28px rgba(0,0,0,0.32)', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 18, borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>{port.name}</h2>
            <div style={{ display: 'flex', gap: 4 }}>
              <Badge variant={displaySeverity === 'high' ? 'danger' : displaySeverity === 'medium' ? 'warning' : 'success'} style={{ fontSize: 9 }}>
                ANOMALY: {displaySeverity.toUpperCase()}
              </Badge>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{port.country} · {port.locode ?? 'No LOCODE'} · radius {port.radius_km}km</div>
        </div>
        <button aria-label="Close port details" onClick={onClose} style={{ border: 0, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><Icons.X size={18} /></button>
      </div>
      <div style={{ padding: 18, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DataProvenance mode={demo ? 'demo' : port.congestion ? 'live' : 'empty'} source="Port congestion + reference table" timestamp={port.congestion ? formatDateTime(port.congestion.time) : undefined} stale={port.stale} />
        {anomaly && (
          <div style={{
            background: anomaly.severity === 'high' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(234, 179, 8, 0.08)',
            border: `1px solid ${anomaly.severity === 'high' ? 'var(--danger)' : 'var(--warning)'}`,
            borderRadius: 6,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8
          }}>
            <Icons.AlertTriangle style={{ color: anomaly.severity === 'high' ? 'var(--danger)' : 'var(--warning)', marginTop: 2 } as React.CSSProperties} size={15} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                Active {anomaly.severity.toUpperCase()} Anomaly Detected
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.4 }}>
                {anomaly.message || anomaly.explanation || anomaly.description}
              </div>
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <MetricCard label="AIS In Area" value={port.congestion?.total_in_area ?? 0} tone="info" />
          <MetricCard label="Anchored" value={port.congestion?.anchored_count ?? 0} tone={displaySeverity === 'high' ? 'danger' : displaySeverity === 'medium' ? 'warning' : 'default'} />
          <MetricCard label="Portcalls/wk" value={(port.congestion as PortCongestionResponse | undefined)?.portwatch_portcalls ?? 'n/a'} tone="default" />
          <MetricCard label="Med. Speed" value={port.congestion?.median_speed != null ? `${port.congestion.median_speed.toFixed(2)} kn` : 'n/a'} tone="default" />
        </div>

        {latestSnapshot && latestSnapshot.driver_metadata?.component_scores && (
          <Card style={{ padding: 14 }}>
            <SectionHeader title="Port Risk Score Breakdown" sub={`Composite Score: ${(latestSnapshot.risk_score ?? 0).toFixed(0)}/100`} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {Object.entries(latestSnapshot.driver_metadata.component_scores || {}).map(([key, val]: [string, any]) => {
                const label = key.replace(/_/g, ' ').toUpperCase()
                const maxVal = key === 'congestion' ? 30 : key === 'traffic_anomaly' ? 45 : key === 'weather' ? 15 : 10
                const numVal = typeof val === 'number' ? val : 0
                return (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
                      <span className="mono-num" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{numVal.toFixed(1)} / {maxVal}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${(numVal / maxVal) * 100}%`,
                        background: numVal >= maxVal * 0.7 ? 'var(--danger)' : numVal >= maxVal * 0.4 ? 'var(--warning)' : 'var(--success)',
                        borderRadius: 3
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}
        <Card style={{ padding: 14 }}>
          <SectionHeader title="Congestion Timeline" sub={loading ? 'Loading latest 30-day API timeline' : `${timeline.length || values.length} points`} />
          {loading ? <SkeletonBlock height={116} /> : values.length > 1 ? (
            <div>
              <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img" aria-label={`${port.name} congestion timeline`}>
                <line x1="12" y1={H - 18} stroke="var(--border-subtle)" />
                {/* Rolling Mean expected path */}
                <path d={rollingMeanPath} fill="none" stroke="var(--text-muted)" strokeWidth="1.2" strokeDasharray="3,3" opacity="0.6" />
                {/* Actual timeline path */}
                <path d={path} fill="none" stroke={severityColor[displaySeverity]} strokeWidth="1.8" strokeLinejoin="round" />
                {points.map((point, i) => i === points.length - 1 ? <circle key={i} cx={point.x} cy={point.y} r="3.5" fill={severityColor[displaySeverity]} /> : null)}
                {points.map((point, i) => {
                  const anomalyVal = demo ? (i === 5 ? { isAnomaly: true, severity: 'high' as const, score: 3.4 } : i === 10 ? { isAnomaly: true, severity: 'medium' as const, score: 2.2 } : null) : timelineAnomalies[i]
                  if (anomalyVal && anomalyVal.isAnomaly) {
                    const dateStr = demo
                      ? new Date(Date.now() - (points.length - 1 - i) * 2 * 86400000).toLocaleDateString()
                      : new Date(timeline[i].time).toLocaleDateString()
                    const label = `${dateStr}: ${anomalyVal.severity.toUpperCase()} anomaly (Z-Score: ${anomalyVal.score.toFixed(2)})`
                    return (
                      <circle
                        key={`anomaly-${i}`}
                        cx={point.x}
                        cy={point.y}
                        r="4.5"
                        fill={anomalyVal.severity === 'high' ? 'var(--danger)' : 'var(--warning)'}
                        stroke="var(--bg-surface)"
                        strokeWidth="1.5"
                        style={{ cursor: 'help' }}
                      >
                        <title>{label}</title>
                      </circle>
                    )
                  }
                  return null
                })}
              </svg>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 1.8, background: severityColor[displaySeverity] }} />
                  Actual
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 1.2, borderTop: '1.2px dashed var(--text-muted)', opacity: 0.6 }} />
                  Rolling Mean
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)' }} />
                  Anomaly Mark
                </span>
              </div>
            </div>
          ) : (
            <EmptyState title="No congestion timeline rows" detail="Collector history has not populated this port yet." compact />
          )}
        </Card>

        <Card style={{ padding: 14 }}>
          <SectionHeader
            title="Risk History"
            sub={insufficientHistory ? 'Insufficient history' : `${riskHistoryValues.length} feature snapshots`}
            action={<DataProvenance mode={history ? (riskHistoryValues.length ? 'live' : 'empty') : 'empty'} source="Real risk feature snapshots" />}
          />
          {riskHistoryValues.length > 1 ? (
            <Sparkline data={riskHistoryValues} color="var(--accent)" width={220} height={48} />
          ) : (
            <EmptyState title="No risk history rows" detail="Run historical PortWatch backfill and feature refresh for this port." compact />
          )}
          {insufficientHistory && <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 8 }}>Insufficient history for storytelling or forecast. Coverage gaps: {coverage.reduce((sum, row) => sum + row.missing_days, 0)} days.</div>}
        </Card>
        <Card style={{ padding: 14 }}>
          <SectionHeader
            title="Story Events"
            sub={stories.length ? `${stories.length} historical risk events` : 'No generated events'}
            action={<DataProvenance mode={stories.length ? 'live' : 'empty'} source="Real risk_story_events" />}
          />
          {stories.slice(0, 3).map(story => (
            <div key={story.event_key} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{story.event_type.replace(/_/g, ' ')}</span>
                <Badge variant={story.severity === 'high' ? 'danger' : story.severity === 'medium' ? 'warning' : 'success'}>{story.attention_level}</Badge>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, marginTop: 4 }}>{story.narrative}</div>
            </div>
          ))}
          {stories.length === 0 && <EmptyState title="No live story events" detail="Historical feature snapshots have not crossed configured story thresholds for this port." compact />}
        </Card>
        <Card style={{ padding: 14 }}>
          <SectionHeader
            title="Forecast Readiness"
            sub={forecast?.data_sufficiency_status === 'sufficient' ? `${forecast.horizon_days}-day risk path` : 'Prediction unavailable'}
            action={<DataProvenance mode={forecast?.data_sufficiency_status === 'sufficient' ? 'live' : 'empty'} source="Real entity risk forecast" />}
          />
          {forecast?.data_sufficiency_status === 'sufficient' && forecastScores.length > 1 ? (
            <>
              <Sparkline data={forecastScores} color="var(--accent)" width={220} height={48} />
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>Confidence {Math.round(forecast.confidence * 100)}% · train {forecast.train_window_start ?? 'n/a'} to {forecast.train_window_end ?? 'n/a'}</div>
            </>
          ) : (
            <EmptyState title="Forecast unavailable" detail={forecast?.unavailable_reason ?? 'Need sufficient real risk feature history before forecast generation.'} compact />
          )}
        </Card>
        <Card style={{ padding: 14 }}>
          <SectionHeader title="Why This Matters" sub="Operational interpretation" />
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            {port.severity === 'high'
              ? `${port.name} is in the high congestion band based on available congestion rows. Review dwell-time pressure and freight-rate ripple effects.`
              : port.severity === 'medium'
                ? `${port.name} is elevated but not critical. Review it as a regional port pressure watchlist candidate.`
                : `${port.name} is currently in the low congestion band based on the available frontend-derived thresholds.`}
          </p>
        </Card>
        <button onClick={() => onNavigate?.('vessels')} style={{ height: 34, borderRadius: 6, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer' }}>
          Open Vessel Map
        </button>
      </div>
    </aside>
  )
}

export const Ports: React.FC<{ onNavigate?: (page: PageId) => void }> = ({ onNavigate }) => {
  const [region, setRegion] = useState<Region>('All')
  const [selectedPort, setSelectedPort] = useState<PortViewModel | null>(null)
  const [search, setSearch] = useState('')

  const portsQuery = useQuery({
    queryKey: queryKeys.ports(region === 'All' ? undefined : region),
    queryFn: ({ signal }) => apiClient.ports(region === 'All' ? undefined : region, { signal }),
  })
  const congestionQuery = useQuery({
    queryKey: queryKeys.portCongestion,
    queryFn: ({ signal }) => apiClient.portCongestion({ signal }),
  })
  const anomaliesQuery = useQuery({
    queryKey: queryKeys.anomalies(30, undefined, undefined, 10),
    queryFn: ({ signal }) => apiClient.anomalies({ days: 30, limit: 10 }, { signal }),
  })
  const livePorts = useMemo(() => buildPortViewModels(portsQuery.data ?? [], congestionQuery.data ?? [], anomaliesQuery.data ?? []), [portsQuery.data, congestionQuery.data, anomaliesQuery.data])
  const loading = portsQuery.isLoading || congestionQuery.isLoading
  const error = portsQuery.error ?? congestionQuery.error
  const usingDemo = shouldUseDemoRows({
    loading,
    error,
    rowCount: livePorts.length,
    demoEnabled: ENABLE_DEMO_FALLBACK,
  })
  const ports = usingDemo ? demoPorts() : livePorts
  const selectedRiskEntityId = selectedPort ? riskEntityId(selectedPort) : null
  const timelineQuery = useQuery({
    queryKey: selectedPort ? queryKeys.portTimeline(selectedPort.id, 30) : ['ports', 'no-selection'],
    queryFn: ({ signal }) => apiClient.portTimeline(selectedPort!.id, 30, { signal }),
    enabled: Boolean(selectedPort && !usingDemo),
    retry: false,
  })
  const riskCoverageQuery = useQuery({
    queryKey: queryKeys.riskCoverage(selectedRiskEntityId ?? undefined),
    queryFn: ({ signal }) => apiClient.riskCoverage(selectedRiskEntityId ?? undefined, { signal }),
    enabled: Boolean(selectedRiskEntityId && !usingDemo),
  })
  const riskEntityHistoryQuery = useQuery({
    queryKey: selectedRiskEntityId ? queryKeys.riskEntityHistory(selectedRiskEntityId, 180) : ['risk', 'history', 'no-selection'],
    queryFn: ({ signal }) => apiClient.riskEntityHistory(selectedRiskEntityId!, 180, { signal }),
    enabled: Boolean(selectedRiskEntityId && !usingDemo),
  })
  const riskStoriesQuery = useQuery({
    queryKey: queryKeys.riskStories(selectedRiskEntityId ?? undefined, 180, 5),
    queryFn: ({ signal }) => apiClient.riskStories({ entity_id: selectedRiskEntityId!, days: 180, limit: 5 }, { signal }),
    enabled: Boolean(selectedRiskEntityId && !usingDemo),
  })
  const riskForecastQuery = useQuery({
    queryKey: selectedRiskEntityId ? queryKeys.riskEntityForecast(selectedRiskEntityId) : ['risk', 'forecast', 'no-selection'],
    queryFn: ({ signal }) => apiClient.riskEntityForecast(selectedRiskEntityId!, { signal }),
    enabled: Boolean(selectedRiskEntityId && !usingDemo),
    retry: false,
  })

  const demoAnomalies = useMemo(() => [
    { port_id: 1, port_name: 'Shanghai', time: new Date().toISOString(), severity: 'high', main_driver: 'total_in_area', current_value: 122, baseline_mean: 90, baseline_std: 10, anomaly_score: 3.2, message: 'Shanghai has a high anomaly: total_in_area is 3.2 standard deviations above its 7-day baseline.' },
    { port_id: 2, port_name: 'Singapore', time: new Date(Date.now() - 3600_000).toISOString(), severity: 'medium', main_driver: 'avg_dwell_hours', current_value: 12, baseline_mean: 8, baseline_std: 1.6, anomaly_score: 2.5, message: 'Singapore has a medium anomaly: avg_dwell_hours is 2.5 standard deviations above its 7-day baseline.' }
  ], [])

  const activeAnomalies = (usingDemo ? demoAnomalies : (anomaliesQuery.data ?? [])) as AnomalyResponse[]

  const regions = useMemo(() => ['All', ...Array.from(new Set(ports.map(port => port.region).filter(Boolean) as string[])).sort()], [ports])
  const filtered = ports.filter(port =>
    (region === 'All' || port.region === region) &&
    (search === '' || `${port.name} ${port.country} ${port.locode ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  )

  const highCount = ports.filter(port => port.severity === 'high').length
  const medCount = ports.filter(port => port.severity === 'medium').length
  const totalVessels = ports.reduce((sum, port) => sum + (port.congestion?.total_in_area ?? 0), 0)

  const selectedPortAnomaly = useMemo(() => {
    if (!selectedPort) return undefined
    return activeAnomalies.find((a: any) => a.port_id === selectedPort.id && (a.severity === 'high' || a.severity === 'medium'))
  }, [selectedPort, activeAnomalies])

  return (
    <PageShell
      title="Ports"
      subtitle="Congestion ranking, port search, and drill-down timeline from frontend-derived backend view models."
      action={<DataProvenance mode={rowDataMode({ loading, error, rowCount: livePorts.length, demoEnabled: ENABLE_DEMO_FALLBACK })} source={usingDemo ? 'Explicit demo fallback enabled' : '/api/ports + /api/ports/congestion'} />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <ErrorPanel error={error} title="Port API unavailable" compact />}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 12 }}>
          <MetricCard label="Tracked Ports" value={ports.length} />
          <MetricCard label="High Congestion" value={highCount} tone={highCount ? 'danger' : 'success'} />
          <MetricCard label="Watchlist Ports" value={medCount} tone={medCount ? 'warning' : 'success'} />
          <MetricCard label="Vessels In Areas" value={fmtNum(totalVessels)} tone="info" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 4, background: 'var(--bg-elevated)', padding: 3, borderRadius: 8, flexWrap: 'wrap' }}>
                  {regions.map(item => (
                    <button key={item} onClick={() => setRegion(item)} style={{
                      height: 26, padding: '0 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                      background: region === item ? 'var(--bg-card)' : 'transparent',
                      color: region === item ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}>{item}</button>
                  ))}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 10px', borderRadius: 6, background: 'var(--bg-input)', border: '1px solid var(--border-default)' }}>
                  <Icons.Search size={13} style={{ color: 'var(--text-muted)' } as React.CSSProperties} />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search ports"
                    aria-label="Search ports"
                    style={{ border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: 12, outline: 'none', width: 180 }}
                  />
                </label>
              </div>
            </Card>

            {loading && !usingDemo ? <SkeletonBlock height={240} lines={6} /> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {filtered.map(port => {
                  const cardAnomaly = activeAnomalies.find((a: any) => a.port_id === port.id && (a.severity === 'high' || a.severity === 'medium'))
                  return (
                    <PortCard
                      key={port.id}
                      port={port}
                      demo={usingDemo}
                      onClick={() => setSelectedPort(port)}
                      anomaly={cardAnomaly}
                    />
                  )
                })}
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <EmptyState
                title={ports.length === 0 ? 'No live port rows' : 'No ports match your filter'}
                detail={ports.length === 0 ? 'Ports stay empty in normal mode until the backend returns reference or congestion rows.' : 'Clear search or change region.'}
              />
            )}
          </div>

          <Card style={{ padding: 16, height: 'fit-content' }}>
            <SectionHeader title="Port-To-Map Context" sub="Hotspots use the same severity language as the port ranking." />
            <MiniMap height={250} congestion={congestionQuery.data ?? []} anomalies={activeAnomalies} />
          </Card>
        </div>

        <Card style={{ padding: 16 }}>
          <SectionHeader
            title="Recent Port Anomalies"
            sub="Historically detected statistical baseline deviations (Z-score >= 2.0)"
          />
          {activeAnomalies.filter((a: any) => a.port_id).length === 0 ? (
            <EmptyState title="No anomalies detected" detail="No statistical z-score violations found for Monitored Ports in the last 30 days." compact />
          ) : (
            <div style={{ width: '100%', overflowX: 'auto', marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 4px', fontWeight: 500 }}>Port</th>
                    <th style={{ padding: '8px 4px', fontWeight: 500 }}>Time</th>
                    <th style={{ padding: '8px 4px', fontWeight: 500 }}>Severity</th>
                    <th style={{ padding: '8px 4px', fontWeight: 500 }}>Metric (main_driver)</th>
                    <th style={{ padding: '8px 4px', fontWeight: 500, textAlign: 'right' }}>z-score / anomaly_score</th>
                    <th style={{ padding: '8px 4px', fontWeight: 500 }}>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {activeAnomalies.filter((a: any) => a.port_id).slice(0, 10).map((anomaly: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                      <td style={{ padding: '8px 4px', fontWeight: 600, color: 'var(--text-primary)' }}>{anomaly.port_name}</td>
                      <td style={{ padding: '8px 4px', whiteSpace: 'nowrap' }}>{relativeTime(anomaly.time || anomaly.detected_at)}</td>
                      <td style={{ padding: '8px 4px' }}>
                        <Badge variant={anomaly.severity === 'high' ? 'danger' : 'warning'}>
                          {anomaly.severity}
                        </Badge>
                      </td>
                      <td style={{ padding: '8px 4px' }}>{anomaly.main_driver || anomaly.metric || 'N/A'}</td>
                      <td className="mono-num" style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 600, color: anomaly.severity === 'high' ? 'var(--danger)' : 'var(--warning)' }}>
                        {anomaly.anomaly_score?.toFixed(2) ?? anomaly.z_score?.toFixed(2) ?? '0.00'}
                      </td>
                      <td style={{ padding: '8px 4px', color: 'var(--text-primary)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={anomaly.message || anomaly.explanation || anomaly.description}>
                        {anomaly.message || anomaly.explanation || anomaly.description || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {selectedPort && (
          <PortDetail
            port={selectedPort}
            timeline={timelineQuery.data ?? []}
            history={riskEntityHistoryQuery.data}
            coverage={riskCoverageQuery.data ?? []}
            stories={riskStoriesQuery.data ?? []}
            forecast={riskForecastQuery.data}
            loading={timelineQuery.isLoading || riskEntityHistoryQuery.isLoading || riskStoriesQuery.isLoading || riskForecastQuery.isLoading}
            demo={usingDemo}
            anomaly={selectedPortAnomaly}
            onClose={() => setSelectedPort(null)}
            onNavigate={onNavigate}
          />
        )}
      </div>
    </PageShell>
  )
}
