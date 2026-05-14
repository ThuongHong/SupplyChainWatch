const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

type QueryValue = string | number | boolean | null | undefined;

function queryString(params: object): string {
  const search = new URLSearchParams();
  (Object.entries(params) as [string, QueryValue][]).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  });
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (!response.ok) {
    let detail = `API request failed: ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) detail = payload.detail;
    } catch {
      // Keep the status-based error when the backend does not return JSON.
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

export interface HealthResponse {
  status: string;
  checked_at: string;
}

export interface IndexSummary {
  index_name: string;
  points: number;
  first_time: string | null;
  last_time: string | null;
}

export interface IndexPoint {
  time: string;
  index_name: string;
  value: number;
  source: string;
  metadata?: Record<string, unknown> | null;
}

export interface ForecastResponse {
  id: number;
  created_at: string;
  index_name: string;
  horizon_days: number;
  predictions: Array<Record<string, unknown>>;
  metrics: Record<string, unknown>;
  model_name?: string | null;
  model_params?: Record<string, unknown> | null;
  commentary?: string | null;
}

export interface VesselSnapshotItem {
  time: string;
  mmsi: number;
  lat: number;
  lon: number;
  sog?: number | null;
  cog?: number | null;
  nav_status?: number | null;
  name?: string | null;
  type?: number | null;
  type_label?: string | null;
  flag?: string | null;
}

export interface VesselDetail {
  vessel: Record<string, unknown> | null;
  track: VesselSnapshotItem[];
}

export interface PortResponse {
  id: number;
  locode?: string | null;
  name: string;
  country: string;
  region?: string | null;
  lat?: number | null;
  lon?: number | null;
  radius_km: number;
  twenty_ft_eq_units_year?: number | null;
}

export interface PortCongestionResponse {
  time: string;
  port_id: number;
  port_name?: string | null;
  anchored_count: number;
  moored_count: number;
  underway_count: number;
  total_in_area: number;
  avg_dwell_hours?: number | null;
  median_speed?: number | null;
}

export interface ChokepointResponse {
  id: number;
  name: string;
  vessel_count?: number | null;
  median_speed?: number | null;
  risk_score?: number | null;
  time?: string | null;
}

export interface ChokepointTimelinePoint {
  time: string;
  chokepoint_id: number;
  vessel_count: number;
  median_speed?: number | null;
  risk_score?: number | null;
}

export interface AnomalyResponse {
  id: number;
  detected_at: string;
  entity_type: string;
  entity_id: string;
  severity: string;
  metric?: string | null;
  observed?: number | null;
  expected?: number | null;
  z_score?: number | null;
  description?: string | null;
  explanation?: string | null;
  acknowledged: boolean;
}

export interface InsightResponse {
  id: number;
  generated_at: string;
  category?: string | null;
  title: string;
  narrative: string;
  narrative_llm?: string | null;
  narrative_model?: string | null;
  narrative_generated_at?: string | null;
  metrics?: Record<string, unknown> | null;
  priority: number;
}

export interface CorrelationCell {
  index_a: string;
  index_b: string;
  correlation: number | null;
  lag_days: number;
  overlap: number;
}

export interface OverviewStats {
  latest_bdi?: number | null;
  latest_fbx?: number | null;
  active_vessels: number;
  high_severity_anomalies: number;
  generated_at: string;
}

export interface IndexHistoryParams {
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface VesselSnapshotParams {
  bbox?: string;
  type?: number;
  limit?: number;
  offset?: number;
}

export interface AnomalyParams {
  days?: number;
  severity?: string;
}

export const apiClient = {
  health: () => request<HealthResponse>("/api/health"),
  indices: () => request<IndexSummary[]>("/api/indices"),
  indexHistory: (name: string, params: IndexHistoryParams = {}) =>
    request<IndexPoint[]>(
      `/api/indices/${encodeURIComponent(name)}${queryString(params)}`,
    ),
  indexForecast: (name: string) =>
    request<ForecastResponse>(`/api/indices/${encodeURIComponent(name)}/forecast`),
  vesselSnapshot: (params: VesselSnapshotParams = {}) =>
    request<VesselSnapshotItem[]>(`/api/vessels/snapshot${queryString(params)}`),
  vesselDetail: (mmsi: number) => request<VesselDetail>(`/api/vessels/${mmsi}`),
  ports: (region?: string) => request<PortResponse[]>(`/api/ports${queryString({ region })}`),
  portCongestion: () => request<PortCongestionResponse[]>("/api/ports/congestion"),
  portTimeline: (portId: number, days = 30) =>
    request<PortCongestionResponse[]>(`/api/ports/${portId}/timeline${queryString({ days })}`),
  chokepoints: () => request<ChokepointResponse[]>("/api/chokepoints"),
  chokepointTimeline: (chokepointId: number, days = 30) =>
    request<ChokepointTimelinePoint[]>(
      `/api/chokepoints/${chokepointId}/timeline${queryString({ days })}`,
    ),
  anomalies: (params: AnomalyParams = { days: 30 }) =>
    request<AnomalyResponse[]>(`/api/anomalies${queryString(params)}`),
  latestInsights: (limit = 10) =>
    request<InsightResponse[]>(`/api/insights/latest${queryString({ limit })}`),
  correlations: (indices: string, days = 180) =>
    request<CorrelationCell[]>(`/api/correlations${queryString({ indices, days })}`),
  overviewStats: () => request<OverviewStats>("/api/stats/overview"),
};
