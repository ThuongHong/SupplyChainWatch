export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

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

export class ApiError extends Error {
  status: number;
  path: string;
  detail: string;

  constructor(message: string, options: { status: number; path: string; detail: string }) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.path = options.path;
    this.detail = options.detail;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(`Unable to reach API at ${API_BASE_URL}`, {
      status: 0,
      path,
      detail: error instanceof Error ? error.message : "Network request failed",
    });
  }
  if (!response.ok) {
    let detail = `API request failed: ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) detail = payload.detail;
    } catch {
      // Keep the status-based error when the backend does not return JSON.
    }
    throw new ApiError(detail, { status: response.status, path, detail });
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

export interface ForecastPoint {
  time?: string;
  date?: string;
  ds?: string;
  yhat?: number;
  value?: number;
  prediction?: number;
  lower?: number;
  upper?: number;
  yhat_lower?: number;
  yhat_upper?: number;
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
  event_type?: string | null;
  confidence?: number | null;
  affected_entities?: Array<Record<string, unknown>> | null;
  source_metrics?: Record<string, unknown> | null;
  attention_level?: string | null;
}

export interface RiskScoreResponse {
  entity_id: string;
  entity_name: string;
  entity_type: "port" | "chokepoint" | "region";
  score: number;
  severity: string;
  component_scores: Record<string, unknown>;
  missing_components?: string[] | null;
  reasons?: string[] | null;
  source_metrics?: Record<string, unknown> | null;
  freshness_status: string;
  as_of: string;
  lat?: number | null;
  lon?: number | null;
}

export interface DataFreshnessResponse {
  source: string;
  latest_observed_at?: string | null;
  latest_collected_at?: string | null;
  freshness_status: string;
  rows: number;
}

export interface DataCoverageResponse {
  source: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  first_observed_at?: string | null;
  latest_observed_at?: string | null;
  observed_rows: number;
  expected_days: number;
  missing_days: number;
  freshness_status: string;
  last_collection_status?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RiskFeatureSnapshotResponse {
  snapshot_date: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  risk_score?: number | null;
  severity?: string | null;
  feature_values: Record<string, unknown>;
  baseline_values: Record<string, unknown>;
  z_scores: Record<string, unknown>;
  deltas: Record<string, unknown>;
  missing_features?: string[] | null;
  source_freshness?: Record<string, unknown> | null;
  driver_metadata?: Record<string, unknown> | null;
  feature_schema_version: string;
}

export interface RiskEntityHistoryResponse {
  entity_id: string;
  coverage: DataCoverageResponse[];
  snapshots: RiskFeatureSnapshotResponse[];
  data_sufficiency: Record<string, unknown>;
}

export interface RiskStoryEventResponse {
  event_key: string;
  event_time: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  event_type: string;
  severity: string;
  metric: string;
  observed?: number | null;
  expected?: number | null;
  z_score?: number | null;
  percent_change?: number | null;
  drivers?: Record<string, unknown> | null;
  source_metrics?: Record<string, unknown> | null;
  narrative: string;
  confidence: number;
  attention_level: string;
  data_sufficiency?: Record<string, unknown> | null;
}

export interface EntityRiskForecastResponse {
  forecast_key?: string | null;
  created_at?: string | null;
  entity_type?: string | null;
  entity_id: string;
  entity_name?: string | null;
  horizon_days: number;
  predictions: Array<Record<string, unknown>>;
  confidence: number;
  train_window_start?: string | null;
  train_window_end?: string | null;
  data_sufficiency_status: string;
  unavailable_reason?: string | null;
  key_drivers?: string[] | null;
  metrics: Record<string, unknown>;
  model_name?: string | null;
  model_params?: Record<string, unknown> | null;
  feature_schema_version?: string | null;
}

export interface DisruptionPropagationResponse {
  id: number;
  source_entity_type: string;
  source_entity_id: string;
  source_entity_name: string;
  target_entity_type: string;
  target_entity_id: string;
  target_entity_name: string;
  route_lane?: string | null;
  severity: string;
  confidence: number;
  explanation: string;
  source_metrics?: Record<string, unknown> | null;
  started_at: string;
  updated_at: string;
  status: string;
}

export interface VesselWatchlistResponse {
  mmsi: number;
  reason: string;
  source_rule: string;
  priority: number;
  active: boolean;
  entity_type?: string | null;
  entity_id?: string | null;
  expires_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface VesselEtaDriftResponse {
  mmsi: number;
  eta_drift_minutes?: number | null;
  confidence: number;
  entity_id?: string | null;
  reasons: string[];
}

export type StoryEntityType = "index" | "port" | "chokepoint";

export interface StoryEntity {
  type: StoryEntityType;
  id: string;
}

export interface StoryAnalyzeRequest {
  entity_a: StoryEntity;
  entity_b: StoryEntity;
  period_days: number;
}

export interface StoryAnalyzeResponse {
  headline: string;
  narrative: string;
  key_findings: string[];
  caveats: string[];
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
  health: (init?: RequestInit) => request<HealthResponse>("/api/health", init),
  indices: (init?: RequestInit) => request<IndexSummary[]>("/api/indices", init),
  indexHistory: (name: string, params: IndexHistoryParams = {}, init?: RequestInit) =>
    request<IndexPoint[]>(
      `/api/indices/${encodeURIComponent(name)}${queryString(params)}`,
      init,
    ),
  indexForecast: (name: string, init?: RequestInit) =>
    request<ForecastResponse>(`/api/indices/${encodeURIComponent(name)}/forecast`, init),
  vesselSnapshot: (params: VesselSnapshotParams = {}, init?: RequestInit) =>
    request<VesselSnapshotItem[]>(`/api/vessels/snapshot${queryString(params)}`, init),
  vesselDetail: (mmsi: number, init?: RequestInit) => request<VesselDetail>(`/api/vessels/${mmsi}`, init),
  ports: (region?: string, init?: RequestInit) => request<PortResponse[]>(`/api/ports${queryString({ region })}`, init),
  portCongestion: (init?: RequestInit) => request<PortCongestionResponse[]>("/api/ports/congestion", init),
  portTimeline: (portId: number, days = 30, init?: RequestInit) =>
    request<PortCongestionResponse[]>(`/api/ports/${portId}/timeline${queryString({ days })}`, init),
  chokepoints: (init?: RequestInit) => request<ChokepointResponse[]>("/api/chokepoints", init),
  chokepointTimeline: (chokepointId: number, days = 30, init?: RequestInit) =>
    request<ChokepointTimelinePoint[]>(
      `/api/chokepoints/${chokepointId}/timeline${queryString({ days })}`,
      init,
    ),
  anomalies: (params: AnomalyParams = { days: 30 }, init?: RequestInit) =>
    request<AnomalyResponse[]>(`/api/anomalies${queryString(params)}`, init),
  latestInsights: (limit = 10, init?: RequestInit) =>
    request<InsightResponse[]>(`/api/insights/latest${queryString({ limit })}`, init),
  storyAnalyze: (body: StoryAnalyzeRequest, init?: RequestInit) =>
    request<StoryAnalyzeResponse>("/api/story/analyze", {
      ...init,
      method: "POST",
      headers: { "Content-Type": "application/json", ...init?.headers },
      body: JSON.stringify(body),
    }),
  correlations: (indices: string, days = 180, init?: RequestInit) =>
    request<CorrelationCell[]>(`/api/correlations${queryString({ indices, days })}`, init),
  overviewStats: (init?: RequestInit) => request<OverviewStats>("/api/stats/overview", init),
  globalPortRisk: (limit = 25, init?: RequestInit) =>
    request<RiskScoreResponse[]>(`/api/risk/ports${queryString({ limit })}`, init),
  congestionHeatmap: (init?: RequestInit) =>
    request<RiskScoreResponse[]>("/api/risk/heatmap", init),
  chokepointStress: (limit = 25, init?: RequestInit) =>
    request<RiskScoreResponse[]>(`/api/risk/chokepoints${queryString({ limit })}`, init),
  disruptionPropagation: (init?: RequestInit) =>
    request<DisruptionPropagationResponse[]>("/api/risk/propagation", init),
  dataFreshness: (init?: RequestInit) =>
    request<DataFreshnessResponse[]>("/api/risk/freshness", init),
  riskCoverage: (entityId?: string, init?: RequestInit) =>
    request<DataCoverageResponse[]>(`/api/risk/coverage${queryString({ entity_id: entityId })}`, init),
  riskEntityHistory: (entityId: string, days = 180, init?: RequestInit) =>
    request<RiskEntityHistoryResponse>(
      `/api/risk/entities/${encodeURIComponent(entityId)}/history${queryString({ days })}`,
      init,
    ),
  riskStories: (params: { entity_id?: string; days?: number; limit?: number } = {}, init?: RequestInit) =>
    request<RiskStoryEventResponse[]>(`/api/risk/stories${queryString(params)}`, init),
  riskEntityForecast: (entityId: string, init?: RequestInit) =>
    request<EntityRiskForecastResponse>(
      `/api/risk/entities/${encodeURIComponent(entityId)}/forecast`,
      init,
    ),
  vesselWatchlist: (init?: RequestInit) =>
    request<VesselWatchlistResponse[]>("/api/risk/watchlist", init),
  watchedVesselPositions: (mmsi: number, limit = 200, init?: RequestInit) =>
    request<VesselSnapshotItem[]>(
      `/api/risk/watchlist/${mmsi}/positions${queryString({ limit })}`,
      init,
    ),
  watchedVesselAnomalies: (mmsi: number, init?: RequestInit) =>
    request<AnomalyResponse[]>(`/api/risk/watchlist/${mmsi}/anomalies`, init),
  watchedVesselEtaDrift: (mmsi: number, init?: RequestInit) =>
    request<VesselEtaDriftResponse>(`/api/risk/watchlist/${mmsi}/eta-drift`, init),
};
