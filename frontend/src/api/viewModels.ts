import type {
  AnomalyResponse,
  ForecastPoint,
  ForecastResponse,
  IndexPoint,
  PortCongestionResponse,
  PortResponse,
} from './client'

export type DataMode = 'live' | 'demo' | 'empty' | 'stale' | 'disabled' | 'error' | 'loading'
export type Severity = 'low' | 'medium' | 'high'

export interface RowStateInput {
  loading?: boolean
  error?: unknown
  disabled?: boolean
  stale?: boolean
  rowCount: number
  demoEnabled?: boolean
}

export function rowDataMode({
  loading = false,
  error,
  disabled = false,
  stale = false,
  rowCount,
  demoEnabled = false,
}: RowStateInput): DataMode {
  if (disabled) return 'disabled'
  if (loading) return 'loading'
  if (error) return demoEnabled ? 'demo' : 'error'
  if (rowCount > 0) return stale ? 'stale' : 'live'
  return demoEnabled ? 'demo' : 'empty'
}

export function shouldUseDemoRows({ loading = false, error, disabled = false, rowCount, demoEnabled = false }: RowStateInput): boolean {
  return Boolean(demoEnabled && !loading && !disabled && (Boolean(error) || rowCount === 0))
}

export function relativeTime(iso?: string | null): string {
  if (!iso) return 'unknown'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.max(0, Math.round(diffMs / 60000))
  if (mins < 60) return `${mins || 1}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return 'No timestamp'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function isStale(iso?: string | null, maxAgeHours = 6): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() > maxAgeHours * 60 * 60 * 1000
}

export function latestPoint(points: IndexPoint[]): IndexPoint | undefined {
  return points.length ? points[points.length - 1] : undefined
}

export function percentChange(points: IndexPoint[], lookback = 7): number | null {
  if (points.length < 2) return null
  const last = points[points.length - 1]?.value
  const first = points[Math.max(0, points.length - 1 - lookback)]?.value
  if (!first || last == null) return null
  return ((last - first) / first) * 100
}

export function normalizeSeries(points: IndexPoint[]): number[] {
  if (points.length === 0) return []
  const first = points[0].value || 1
  return points.map(point => (point.value / first) * 100)
}

export function congestionSeverity(row?: PortCongestionResponse | null): Severity {
  if (!row) return 'low'
  const dwell = row.avg_dwell_hours ?? 0
  const speed = row.median_speed ?? 99
  if (row.total_in_area >= 100 || row.anchored_count >= 45 || dwell >= 24 || speed < 1.5) return 'high'
  if (row.total_in_area >= 45 || row.anchored_count >= 15 || dwell >= 8 || speed < 3) return 'medium'
  return 'low'
}

export function severityScore(severity: Severity): number {
  return severity === 'high' ? 3 : severity === 'medium' ? 2 : 1
}

export interface PortViewModel extends PortResponse {
  congestion?: PortCongestionResponse
  severity: Severity
  stale: boolean
}

export function buildPortViewModels(
  ports: PortResponse[],
  congestion: PortCongestionResponse[],
): PortViewModel[] {
  const byPort = new Map(congestion.map(row => [row.port_id, row]))
  return ports.map(port => {
    const row = byPort.get(port.id)
    const severity = congestionSeverity(row)
    return {
      ...port,
      congestion: row,
      severity,
      stale: row ? isStale(row.time, 12) : false,
    }
  }).sort((a, b) =>
    severityScore(b.severity) - severityScore(a.severity) ||
    (b.congestion?.total_in_area ?? 0) - (a.congestion?.total_in_area ?? 0) ||
    (b.twenty_ft_eq_units_year ?? 0) - (a.twenty_ft_eq_units_year ?? 0)
  )
}

export function activeHighAnomalies(anomalies: AnomalyResponse[]): number {
  return anomalies.filter(item => item.severity === 'high').length
}

export function forecastPoints(forecast?: ForecastResponse | null): ForecastPoint[] {
  return (forecast?.predictions ?? []) as ForecastPoint[]
}

export function forecastValue(point?: ForecastPoint | null): number | null {
  if (!point) return null
  const value = point.yhat ?? point.prediction ?? point.value
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function forecastLower(point?: ForecastPoint | null): number | null {
  if (!point) return null
  const value = point.yhat_lower ?? point.lower
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function forecastUpper(point?: ForecastPoint | null): number | null {
  if (!point) return null
  const value = point.yhat_upper ?? point.upper
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function forecastTimestamp(point?: ForecastPoint | null): string | null {
  if (!point) return null
  return point.time ?? point.date ?? point.ds ?? null
}

export function metricValue(metrics: Record<string, unknown> | undefined, key: string): number | null {
  const value = metrics?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
