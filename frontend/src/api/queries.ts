import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: (failureCount, error) => {
        const status = typeof error === 'object' && error !== null && 'status' in error
          ? Number((error as { status?: unknown }).status)
          : undefined
        if (status === 404 || status === 400) return false
        return failureCount < 1
      },
      refetchOnWindowFocus: false,
    },
  },
})

export const queryKeys = {
  health: ['health'] as const,
  overview: ['stats', 'overview'] as const,
  indices: ['indices'] as const,
  indexHistory: (name: string, limit = 5000) => ['indices', name, 'history', limit] as const,
  indexForecast: (name: string) => ['indices', name, 'forecast'] as const,
  vessels: (bbox: string, limit: number) => ['vessels', 'snapshot', bbox, limit] as const,
  vesselDetail: (mmsi: number) => ['vessels', mmsi, 'detail'] as const,
  ports: (region?: string) => ['ports', region ?? 'all'] as const,
  portCongestion: ['ports', 'congestion'] as const,
  globalPortRisk: (limit: number) => ['risk', 'ports', limit] as const,
  congestionHeatmap: ['risk', 'heatmap'] as const,
  chokepointStress: (limit: number) => ['risk', 'chokepoints', limit] as const,
  disruptionPropagation: ['risk', 'propagation'] as const,
  dataFreshness: ['risk', 'freshness'] as const,
  vesselWatchlist: ['risk', 'watchlist'] as const,
  watchedVesselPositions: (mmsi: number) => ['risk', 'watchlist', mmsi, 'positions'] as const,
  watchedVesselAnomalies: (mmsi: number) => ['risk', 'watchlist', mmsi, 'anomalies'] as const,
  watchedVesselEtaDrift: (mmsi: number) => ['risk', 'watchlist', mmsi, 'eta-drift'] as const,
  portTimeline: (portId: number, days: number) => ['ports', portId, 'timeline', days] as const,
  anomalies: (days: number, severity?: string) => ['anomalies', days, severity ?? 'all'] as const,
  insights: (limit: number) => ['insights', 'latest', limit] as const,
  correlations: (indices: string, days: number) => ['correlations', indices, days] as const,
  story: (pair: string) => ['story', pair] as const,
}
