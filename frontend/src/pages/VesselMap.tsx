import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import Map, { NavigationControl } from 'react-map-gl/maplibre'
import DeckGL from '@deck.gl/react'
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Badge } from '../components/Badge'
import { Icons } from '../components/icons'
import {
  apiClient,
  isApiError,
  type AnomalyResponse,
  type VesselDetail,
  type VesselEtaDriftResponse,
  type VesselSnapshotItem,
  type VesselWatchlistResponse,
} from '../api/client'
import { queryKeys } from '../api/queries'
import { latestPortAnomalyById } from '../api/viewModels'
import { EmptyState, ErrorPanel } from '../components/DataState'

// ---- Vessel types ----

const VESSEL_TYPE_IDS = ['cargo', 'tanker', 'passenger', 'tug', 'fishing', 'service', 'pleasure', 'other', 'unknown'] as const
type VesselTypeId = typeof VESSEL_TYPE_IDS[number]

const VESSEL_TYPE_INFO: Record<VesselTypeId, { label: string; color: string; symbol: string; colorRgb: [number, number, number] }> = {
  cargo: { label: 'Cargo', color: '#3B82F6', symbol: '■', colorRgb: [59, 130, 246] },
  tanker: { label: 'Tanker', color: '#F59E0B', symbol: '◆', colorRgb: [245, 158, 11] },
  passenger: { label: 'Passenger', color: '#22C55E', symbol: '●', colorRgb: [34, 197, 94] },
  tug: { label: 'Tug / Towing', color: '#A855F7', symbol: '▰', colorRgb: [168, 85, 247] },
  fishing: { label: 'Fishing', color: '#06B6D4', symbol: '◇', colorRgb: [6, 182, 212] },
  service: { label: 'Service', color: '#EF4444', symbol: '+', colorRgb: [239, 68, 68] },
  pleasure: { label: 'Pleasure / Sail', color: '#EC4899', symbol: '▲', colorRgb: [236, 72, 153] },
  other: { label: 'Other', color: '#94A3B8', symbol: '▪', colorRgb: [148, 163, 184] },
  unknown: { label: 'Unknown', color: '#64748B', symbol: '•', colorRgb: [100, 116, 139] },
}

const CONTINENTS: [number, number][][] = [
  [[-130, 50], [-140, 58], [-160, 62], [-168, 65], [-165, 72], [-140, 70], [-120, 72], [-95, 72], [-80, 68], [-65, 60], [-55, 48], [-67, 44], [-75, 35], [-82, 25], [-98, 18], [-105, 20], [-115, 28], [-120, 34], [-125, 42], [-130, 50]],
  [[-98, 18], [-95, 16], [-88, 15], [-84, 11], [-80, 8], [-78, 9], [-82, 14], [-85, 16], [-90, 20], [-98, 18]],
  [[-80, 8], [-75, 10], [-60, 5], [-50, 0], [-35, -5], [-35, -15], [-38, -22], [-43, -23], [-48, -28], [-53, -33], [-58, -38], [-65, -46], [-68, -53], [-72, -50], [-75, -42], [-75, -30], [-70, -18], [-75, -10], [-80, 0], [-80, 8]],
  [[-10, 36], [0, 38], [5, 44], [0, 48], [-5, 48], [2, 51], [5, 54], [8, 54], [12, 56], [15, 58], [10, 62], [18, 65], [20, 70], [28, 71], [32, 68], [30, 60], [28, 55], [22, 52], [14, 50], [12, 46], [15, 42], [12, 38], [5, 36], [-10, 36]],
  [[-15, 35], [-17, 15], [-15, 5], [-8, 5], [5, 5], [10, 2], [10, -5], [12, -10], [15, -18], [20, -28], [25, -34], [32, -34], [35, -28], [40, -15], [45, -12], [50, 0], [50, 10], [44, 12], [42, 18], [35, 30], [32, 35], [10, 37], [0, 36], [-15, 35]],
  [[28, 71], [35, 68], [42, 65], [52, 62], [60, 56], [68, 55], [75, 55], [85, 50], [90, 46], [95, 42], [100, 38], [105, 30], [110, 22], [115, 22], [118, 25], [122, 31], [125, 34], [128, 36], [130, 38], [132, 35], [132, 32], [135, 34], [140, 38], [142, 42], [145, 45], [140, 52], [135, 55], [140, 58], [145, 60], [160, 62], [175, 65], [180, 68], [180, 72], [170, 72], [140, 72], [120, 72], [100, 72], [80, 72], [60, 72], [40, 70], [28, 71]],
  [[68, 28], [72, 22], [76, 15], [78, 8], [80, 12], [85, 18], [88, 22], [92, 18], [95, 16], [100, 14], [100, 18], [105, 15], [110, 5], [115, 2], [105, 0], [98, 2], [95, 8], [88, 25], [82, 28], [72, 30], [68, 28]],
  [[115, -15], [120, -14], [130, -12], [138, -14], [145, -16], [150, -22], [153, -27], [152, -32], [148, -36], [142, -38], [136, -35], [130, -32], [125, -30], [118, -22], [114, -25], [115, -20], [115, -15]],
]

// Labels: [lon, lat, text, minZoom, fontSize, opacity]
const MAP_LABELS: { lon: number; lat: number; text: string; minZoom: number; size: number; alpha: number; upper: boolean }[] = [
  // Oceans
  { lon: -160, lat: 5, text: 'PACIFIC OCEAN', minZoom: 0.8, size: 13, alpha: 0.2, upper: true },
  { lon: 170, lat: 5, text: 'PACIFIC', minZoom: 0.8, size: 11, alpha: 0.18, upper: true },
  { lon: -30, lat: 12, text: 'ATLANTIC OCEAN', minZoom: 0.8, size: 12, alpha: 0.2, upper: true },
  { lon: 75, lat: -25, text: 'INDIAN OCEAN', minZoom: 0.8, size: 12, alpha: 0.2, upper: true },
  { lon: 0, lat: 78, text: 'ARCTIC OCEAN', minZoom: 0.8, size: 10, alpha: 0.18, upper: true },
  { lon: 10, lat: -55, text: 'SOUTHERN OCEAN', minZoom: 0.8, size: 10, alpha: 0.18, upper: true },
  // Major regions / countries
  { lon: -100, lat: 62, text: 'CANADA', minZoom: 1, size: 11, alpha: 0.35, upper: true },
  { lon: -98, lat: 38, text: 'UNITED STATES', minZoom: 1, size: 12, alpha: 0.35, upper: true },
  { lon: -52, lat: -12, text: 'BRAZIL', minZoom: 1, size: 11, alpha: 0.35, upper: true },
  { lon: 15, lat: 52, text: 'EUROPE', minZoom: 1, size: 11, alpha: 0.3, upper: true },
  { lon: 100, lat: 65, text: 'RUSSIA', minZoom: 1, size: 13, alpha: 0.35, upper: true },
  { lon: 105, lat: 36, text: 'CHINA', minZoom: 1, size: 12, alpha: 0.35, upper: true },
  { lon: 80, lat: 22, text: 'INDIA', minZoom: 1, size: 11, alpha: 0.35, upper: true },
  { lon: 133, lat: -25, text: 'AUSTRALIA', minZoom: 1, size: 11, alpha: 0.35, upper: true },
  { lon: 22, lat: 5, text: 'AFRICA', minZoom: 1, size: 12, alpha: 0.3, upper: true },
  { lon: -60, lat: -20, text: 'S. AMERICA', minZoom: 1, size: 10, alpha: 0.28, upper: true },
  // Smaller countries (min zoom 1.8)
  { lon: 44, lat: 24, text: 'SAUDI ARABIA', minZoom: 1.8, size: 10, alpha: 0.4, upper: true },
  { lon: 138, lat: 36, text: 'JAPAN', minZoom: 1.8, size: 10, alpha: 0.4, upper: true },
  { lon: 128, lat: 36, text: 'KOREA', minZoom: 2.5, size: 9, alpha: 0.4, upper: true },
  { lon: -3, lat: 54, text: 'UK', minZoom: 2.5, size: 9, alpha: 0.4, upper: true },
  { lon: 2, lat: 46, text: 'FRANCE', minZoom: 2.5, size: 9, alpha: 0.4, upper: true },
  { lon: 10, lat: 51, text: 'GERMANY', minZoom: 2.5, size: 9, alpha: 0.4, upper: true },
  { lon: 35, lat: 39, text: 'TURKEY', minZoom: 2, size: 9, alpha: 0.4, upper: true },
  { lon: 104, lat: 14, text: 'SE ASIA', minZoom: 1.5, size: 9, alpha: 0.3, upper: true },
  // Seas / straits
  { lon: 18, lat: 36, text: 'Mediterranean', minZoom: 1.5, size: 9, alpha: 0.22, upper: false },
  { lon: -90, lat: 24, text: 'Gulf of Mexico', minZoom: 1.5, size: 9, alpha: 0.22, upper: false },
  { lon: 113, lat: 14, text: 'South China Sea', minZoom: 1.5, size: 9, alpha: 0.22, upper: false },
  { lon: 62, lat: 18, text: 'Arabian Sea', minZoom: 2, size: 8, alpha: 0.22, upper: false },
  { lon: 89, lat: 14, text: 'Bay of Bengal', minZoom: 2, size: 8, alpha: 0.22, upper: false },
  { lon: 32, lat: 27, text: 'Red Sea', minZoom: 2, size: 8, alpha: 0.22, upper: false },
  { lon: 52, lat: 26, text: 'Persian Gulf', minZoom: 2, size: 8, alpha: 0.22, upper: false },
  { lon: 32, lat: 41, text: 'Black Sea', minZoom: 2.5, size: 8, alpha: 0.22, upper: false },
  { lon: -60, lat: 12, text: 'Caribbean Sea', minZoom: 2, size: 8, alpha: 0.22, upper: false },
]

// ---- Types ----

interface Vessel {
  id: number; name: string; type: VesselTypeId; flag: string
  imo: string; mmsi: string; lat: number; lon: number; speed: number; course: number
}

function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180
}

function vesselTypeFromAis(vessel: VesselSnapshotItem): VesselTypeId {
  const label = vessel.type_label?.toLowerCase() ?? ''
  if (label.includes('cargo') || label.includes('container')) return 'cargo'
  if (label.includes('tanker')) return 'tanker'
  if (label.includes('passenger')) return 'passenger'
  if (label.includes('tug') || label.includes('towing')) return 'tug'
  if (label.includes('fishing')) return 'fishing'
  if (label.includes('pleasure') || label.includes('sailing')) return 'pleasure'
  if (label.includes('pilot') || label.includes('tender') || label.includes('law enforcement') || label.includes('search and rescue') || label.includes('dredging')) return 'service'
  if (label.includes('other')) return 'other'
  if (vessel.type !== null && vessel.type !== undefined) {
    if (vessel.type >= 80 && vessel.type <= 89) return 'tanker'
    if (vessel.type >= 70 && vessel.type <= 79) return 'cargo'
    if (vessel.type >= 60 && vessel.type <= 69) return 'passenger'
    if (vessel.type === 31 || vessel.type === 32 || vessel.type === 52) return 'tug'
    if (vessel.type === 30) return 'fishing'
    if (vessel.type === 36 || vessel.type === 37) return 'pleasure'
    if ((vessel.type >= 33 && vessel.type <= 35) || (vessel.type >= 50 && vessel.type <= 59)) return 'service'
    if (vessel.type >= 90 && vessel.type <= 99) return 'other'
  }
  return 'unknown'
}

function mapApiVessel(vessel: VesselSnapshotItem): Vessel {
  const type = vesselTypeFromAis(vessel)
  return {
    id: vessel.mmsi,
    name: vessel.name || `MMSI ${vessel.mmsi}`,
    type,
    flag: vessel.flag || 'Unknown',
    imo: 'Unknown',
    mmsi: String(vessel.mmsi),
    lat: vessel.lat,
    lon: vessel.lon,
    speed: Math.round((vessel.sog ?? 0) * 10) / 10,
    course: Math.round(vessel.cog ?? 0),
  }
}

function emptyTypeCounts(): Record<VesselTypeId, number> {
  return VESSEL_TYPE_IDS.reduce(
    (counts, id) => ({ ...counts, [id]: 0 }),
    {} as Record<VesselTypeId, number>,
  )
}

type VesselSourceStatus = 'loading' | 'live' | 'empty' | 'disabled' | 'error'

function isDisabledSourceError(error: unknown): boolean {
  if (!error) return false
  const detail = isApiError(error) ? error.detail : error instanceof Error ? error.message : String(error)
  return /disabled|not configured|missing|api key|aisstream/i.test(detail)
}

function vesselStatusLabel(status: VesselSourceStatus): string {
  if (status === 'loading') return 'Loading AIS'
  if (status === 'disabled') return 'AIS Disabled'
  if (status === 'error') return 'Source Error'
  if (status === 'empty') return 'Empty AIS'
  return 'Monitored AIS'
}

function vesselStatusVariant(status: VesselSourceStatus): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'live') return 'success'
  if (status === 'error') return 'danger'
  if (status === 'loading' || status === 'disabled') return 'warning'
  return 'default'
}

function vesselStoryText(
  vessel: Vessel,
  trackCount: number,
  watchlist?: VesselWatchlistResponse,
  etaDrift?: VesselEtaDriftResponse,
  anomalies: AnomalyResponse[] = [],
): string {
  const reason = watchlist?.reason ?? 'selected from current AIS viewport'
  const eta = etaDrift?.eta_drift_minutes == null
    ? 'No ETA drift estimate is available yet'
    : `ETA drift is ${etaDrift.eta_drift_minutes} minutes at ${Math.round(etaDrift.confidence * 100)}% confidence`
  const anomaly = anomalies.length
    ? `${anomalies.length} active anomaly marker${anomalies.length === 1 ? '' : 's'} require review`
    : 'no active vessel anomaly markers are attached'
  return `${vessel.name} is moving at ${vessel.speed} kn near ${vessel.lat.toFixed(2)}, ${vessel.lon.toFixed(2)}. It is tracked because ${reason}; ${eta}, and ${anomaly}. Track evidence: ${trackCount} AIS point${trackCount === 1 ? '' : 's'}.`
}

// ---- Symbol Icon ----

const VesselSymbolIcon: React.FC<{ type: VesselTypeId; color: string; size?: number }> = ({ type, color, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" style={{ flexShrink: 0, display: 'block' }}>
    {type === 'cargo' && <rect x="3" y="3" width="8" height="8" fill={color} />}
    {type === 'tanker' && <polygon points="7,1 12,7 7,13 2,7" fill={color} />}
    {type === 'passenger' && <circle cx="7" cy="7" r="5" fill={color} />}
    {type === 'tug' && <path d="M2.5 5.5h9v5h-9zM5 2.5h4v3H5z" fill={color} />}
    {type === 'fishing' && <polygon points="2,7 7,3 12,7 7,11" fill={color} />}
    {type === 'service' && <path d="M5.5,2 h3 v3.5 h3.5 v3 h-3.5 v3.5 h-3 v-3.5 h-3.5 v-3 h3.5 z" fill={color} />}
    {type === 'pleasure' && <polygon points="7,2 12.5,11.5 1.5,11.5" fill={color} />}
    {type === 'other' && <rect x="3" y="3" width="8" height="8" rx="2" fill={color} />}
    {type === 'unknown' && <circle cx="7" cy="7" r="4.5" fill={color} opacity="0.8" />}
  </svg>
)

// ---- Real Map ----

type MapMode = 'flat' | 'globe'

interface RealMapProps {
  vessels: Vessel[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  onViewport: (bbox: string) => void
  layers: { vessels: boolean; heatmap: boolean; ports: boolean }
  mapMode: MapMode
  anomalies: AnomalyResponse[]
}

const REAL_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const HEATMAP_LAYER_VISUALS = {
  'heatmap-opacity': 0.86,
  deepWaterRgb: [1, 18, 6, 46] as [number, number, number, number],
  warmStop: [0.9, 'rgba(251,146,60,0.96)'] as [number, string],
}

const VesselRealMap: React.FC<RealMapProps> = ({ vessels, selectedId, onSelect, onViewport, layers, mapMode, anomalies }) => {
  const mapRef = useRef<any>(null)
  const [viewState, setViewState] = useState({
    longitude: 35,
    latitude: 22,
    zoom: 1.55,
    pitch: 0,
    bearing: 0
  });

  const timeoutRef = useRef<number>();
  const handleViewStateChange = useCallback(({ viewState: nextViewState }: any) => {
    setViewState(nextViewState);

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      const { longitude, latitude, zoom } = nextViewState;
      const lngSpan = 360 / Math.pow(2, zoom) * 2;
      const latSpan = 180 / Math.pow(2, zoom) * 2;

      const minLon = Math.max(-180, longitude - lngSpan);
      const minLat = Math.max(-90, latitude - latSpan);
      const maxLon = Math.min(180, longitude + lngSpan);
      const maxLat = Math.min(90, latitude + latSpan);

      onViewport(`${minLon},${minLat},${maxLon},${maxLat}`);
    }, 250);
  }, [onViewport]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.()
    if (!map) return
    if (mapMode === 'flat') {
      map.setProjection({ type: 'mercator' })
      map.setSky(undefined)
      return
    }
    map.setProjection({ type: 'globe' })
    map.setSky({
      'atmosphere-blend': 0.9,
      'atmosphere-color': 'rgba(14,165,165,0.35)',
      'space-color': '#020617',
      'star-intensity': 0.2,
    })
  }, [mapMode])

  const portsQuery = useQuery({
    queryKey: queryKeys.ports(),
    queryFn: ({ signal }) => apiClient.ports(undefined, { signal }),
  });

  const congestionQuery = useQuery({
    queryKey: queryKeys.portCongestion,
    queryFn: ({ signal }) => apiClient.portCongestion({ signal }),
  });

  const ports = useMemo(() => {
    if (!portsQuery.data) return [];
    const latestAnomalyByPort = latestPortAnomalyById(anomalies)
    return portsQuery.data.map(port => {
      const congestion = congestionQuery.data?.find(c => c.port_id === port.id);
      const latestAnomaly = latestAnomalyByPort.get(port.id);
      const level = latestAnomaly?.severity === 'high' || latestAnomaly?.severity === 'medium'
        ? latestAnomaly.severity
        : 'low';

      let color: [number, number, number] = [34, 197, 94]; // Green
      if (level === 'high') color = [239, 68, 68]; // Red
      else if (level === 'medium') color = [234, 179, 8]; // Yellow

      return {
        ...port,
        congestion,
        color,
        hasAnomaly: level !== 'low'
      };
    });
  }, [portsQuery.data, congestionQuery.data, anomalies]);

  // Build mmsi → anomaly RGB colour for vessel dot highlighting.
  // Each vessel inherits the colour of the nearest port with an active anomaly
  // (within ~1 degree ≈ 111 km). Vessels not near any flagged port keep their
  // vessel-type colour. Port colours are already computed in the `ports` useMemo.
  const vesselAnomalyColorByMmsi = useMemo((): Map<number, [number, number, number]> => {
    const map = new globalThis.Map() as globalThis.Map<number, [number, number, number]>
    const flaggedPorts = ports.filter(p => p.hasAnomaly)
    if (!flaggedPorts.length) return map
    vessels.forEach(v => {
      let bestDist = Infinity
      let bestColor: [number, number, number] | null = null
      flaggedPorts.forEach(p => {
        const dLat = (p.lat ?? 0) - v.lat
        const dLon = (p.lon ?? 0) - v.lon
        const dist = dLat * dLat + dLon * dLon
        if (dist < 1.0 && dist < bestDist) { // 1° ≈ 111 km bounding box
          bestDist = dist
          bestColor = p.color as [number, number, number]
        }
      })
      if (bestColor) map.set(v.id, bestColor)
    })
    return map
  }, [vessels, ports])

  const deckLayers = [
    layers.heatmap && new HeatmapLayer({
      id: 'vessel-heatmap',
      data: vessels,
      getPosition: (d: any) => [d.lon, d.lat],
      getWeight: (d: any) => d.speed || 1,
      radiusPixels: 40,
      intensity: 1,
      opacity: HEATMAP_LAYER_VISUALS['heatmap-opacity'],
      threshold: 0.05,
      colorRange: [
        HEATMAP_LAYER_VISUALS.deepWaterRgb,
        [56, 189, 248, 128],
        [250, 204, 21, 200],
        [251, 146, 60, 230],
        [239, 68, 68, 255]
      ],
      pickable: false,
    }),

    layers.ports && new TextLayer({
      id: 'ports-icon',
      data: ports,
      getPosition: (d: any) => [d.lon ?? 0, d.lat ?? 0],
      getText: () => '⚓',
      characterSet: ['⚓'],
      getSize: 18,
      getColor: (d: any) => d.color,
      getAlignmentBaseline: 'center',
      getTextAnchor: 'middle',
      pickable: true,
      onClick: ({ object }: any) => object && onSelect(object.id),
    }),

    layers.ports && new TextLayer({
      id: 'ports-label',
      data: ports,
      getPosition: (d: any) => [d.lon ?? 0, d.lat ?? 0],
      getText: (d: any) => d.name,
      getSize: 11,
      getColor: [226, 232, 240, 255],
      getPixelOffset: [0, 16],
      getAlignmentBaseline: 'top',
      getTextAnchor: 'middle',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      pickable: false,
    }),

    layers.vessels && new ScatterplotLayer({
      id: 'vessels',
      data: vessels,
      getPosition: (d: any) => [d.lon, d.lat],
      // Colour vessels by proximity-based anomaly: vessels near a port with an
      // active PortWatch anomaly inherit the port's anomaly colour (red/amber).
      // All other vessels keep their vessel-type colour.
      getFillColor: (d: any) => vesselAnomalyColorByMmsi.get(d.id) ?? VESSEL_TYPE_INFO[d.type as VesselTypeId].colorRgb,
      getRadius: (d: any) => vesselAnomalyColorByMmsi.has(d.id) ? 5 : 4,
      radiusMinPixels: 3,
      radiusMaxPixels: 9,
      pickable: true,
      onClick: ({ object }: any) => object && onSelect(object.id),
    }),
  ].filter(Boolean);

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      <DeckGL
        layers={deckLayers}
        viewState={viewState}
        onViewStateChange={handleViewStateChange}
        controller={true}
        getCursor={({ isDragging, isHovering }: any) => isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'}
      >
        <Map
          ref={mapRef}
          mapStyle={REAL_MAP_STYLE}
          reuseMaps
        >
          <NavigationControl position="bottom-right" visualizePitch />
        </Map>
      </DeckGL>
    </div>
  );
}

// ---- Vessel Drawer ----

const VesselDrawer: React.FC<{
  vessel: Vessel
  detail?: VesselDetail
  loading?: boolean
  watchlist?: VesselWatchlistResponse
  etaDrift?: VesselEtaDriftResponse
  anomalies?: AnomalyResponse[]
  onClose: () => void
}> = ({ vessel, detail, loading, watchlist, etaDrift, anomalies = [], onClose }) => {
  const info = VESSEL_TYPE_INFO[vessel.type]
  const realTrack = detail?.track?.slice().reverse().map(point => ({ x: point.lon, y: point.lat })) ?? []
  const trackPts = realTrack.length > 1 ? realTrack : []
  const minX = trackPts.length ? Math.min(...trackPts.map(p => p.x)) : 0
  const maxX = trackPts.length ? Math.max(...trackPts.map(p => p.x)) : 1
  const minY = trackPts.length ? Math.min(...trackPts.map(p => p.y)) : 0
  const maxY = trackPts.length ? Math.max(...trackPts.map(p => p.y)) : 1
  const rx = maxX - minX || 1, ry = maxY - minY || 1
  const story = vesselStoryText(vessel, realTrack.length, watchlist, etaDrift, anomalies)

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 300,
      background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column',
      zIndex: 10, overflow: 'auto',
    }}>
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{vessel.name}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: info.color + '22', color: info.color }}>{info.label}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{vessel.flag}</span>
          </div>
        </div>
        <div onClick={onClose} style={{ cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
          <Icons.X size={16} />
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', fontSize: 12, marginBottom: 16 }}>
          {([['IMO', vessel.imo], ['MMSI', vessel.mmsi], ['Speed', `${vessel.speed} kn`], ['Course', `${vessel.course}°`], ['Lat', `${vessel.lat.toFixed(3)}°`], ['Lon', `${vessel.lon.toFixed(3)}°`]] as [string, string][]).map(([label, val]) => (
            <div key={label}>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 }}>{label}</div>
              <div className="mono-num" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>7-Day Track</div>
        <div style={{ background: '#060B16', borderRadius: 6, padding: 8 }}>
          {loading ? <div style={{ height: 90, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading track...</div> : trackPts.length > 1 ? <svg width="100%" viewBox="0 0 250 90" style={{ display: 'block' }}>
            <polyline
              points={trackPts.map(pt => `${10 + ((pt.x - minX) / rx) * 230},${10 + (1 - (pt.y - minY) / ry) * 70}`).join(' ')}
              fill="none" stroke={info.color} strokeWidth="1.5" strokeLinejoin="round" opacity="0.8"
            />
            {trackPts.map((pt, i) => {
              const x = 10 + ((pt.x - minX) / rx) * 230
              const y = 10 + (1 - (pt.y - minY) / ry) * 70
              return <circle key={i} cx={x} cy={y} r={i === trackPts.length - 1 ? 3.5 : 1.5}
                fill={i === trackPts.length - 1 ? info.color : info.color + '80'} />
            })}
          </svg> : <EmptyState title="No AIS track rows" detail="Track appears after selective AIS collection stores positions for this vessel." compact />}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          {realTrack.length > 1 ? `${realTrack.length} API track points` : 'No detail track returned by API.'}
        </div>
        <div style={{ marginTop: 16, padding: 12, borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Vessel Story</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{story}</div>
        </div>
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>Operational Context</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Watchlist reason</div>
              <div style={{ color: 'var(--text-primary)' }}>{watchlist?.reason ?? 'Selected AIS vessel'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>ETA drift</div>
              <div className="mono-num" style={{ color: etaDrift?.eta_drift_minutes ? 'var(--warning)' : 'var(--text-primary)' }}>
                {etaDrift?.eta_drift_minutes == null ? 'No drift estimate' : `${etaDrift.eta_drift_minutes} min · ${Math.round(etaDrift.confidence * 100)}%`}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Anomaly markers</div>
              <div style={{ color: anomalies.length ? 'var(--danger)' : 'var(--text-primary)' }}>
                {anomalies.length ? `${anomalies.length} active vessel anomalies` : 'No active anomaly context'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Filter Sidebar ----

interface FilterState { types: Set<VesselTypeId>; speedMax: number; flag: string }
interface LayerState { vessels: boolean; heatmap: boolean; ports: boolean }

const LAYER_LABELS: Record<keyof LayerState, string> = {
  vessels: 'Vessels',
  heatmap: 'Density Heatmap',
  ports: 'Port Markers',
}

const FilterSidebar: React.FC<{
  filters: FilterState; onFilters: (f: FilterState) => void
  layers: LayerState; onLayers: (l: LayerState) => void
  counts: Record<VesselTypeId, number>
  flags: string[]
}> = ({ filters, onFilters, layers, onLayers, counts, flags }) => {
  const toggleType = (id: VesselTypeId) => {
    const next = new Set(filters.types)
    if (next.has(id)) { if (next.size > 1) next.delete(id) } else next.add(id)
    onFilters({ ...filters, types: next })
  }
  return (
    <div style={{ width: 210, flexShrink: 0, background: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)', padding: 16, display: 'flex', flexDirection: 'column', gap: 20, overflow: 'auto' }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>Vessel Type</div>
        {VESSEL_TYPE_IDS.map(id => {
          const info = VESSEL_TYPE_INFO[id]
          return (
            <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={filters.types.has(id)} onChange={() => toggleType(id)} style={{ accentColor: info.color }} />
              <VesselSymbolIcon type={id} color={info.color} size={13} />
              <span style={{ flex: 1 }}>{info.label}</span>
              <span className="mono-num" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{counts[id].toLocaleString()}</span>
            </label>
          )
        })}
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>Speed</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <span className="mono-num" style={{ color: 'var(--text-muted)', minWidth: 14 }}>0</span>
          <input type="range" min="0" max="25" value={filters.speedMax} onChange={e => onFilters({ ...filters, speedMax: +e.target.value })} style={{ flex: 1, accentColor: 'var(--accent)' }} />
          <span className="mono-num" style={{ color: 'var(--text-muted)', minWidth: 38 }}>{filters.speedMax} kn</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>Layers</div>
        {(Object.entries(layers) as [keyof LayerState, boolean][]).map(([key, val]) => (
          <label key={key} style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, cursor: 'pointer', fontSize: 12,
            color: val ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: val ? 'rgba(56,189,248,0.13)' : 'transparent',
            border: `1px solid ${val ? 'rgba(56,189,248,0.38)' : 'transparent'}`,
            borderRadius: 6,
            padding: '5px 7px',
            marginInline: -7,
          }}>
            <input type="checkbox" checked={val} onChange={e => onLayers({ ...layers, [key]: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
            {LAYER_LABELS[key]}
          </label>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>Flag</div>
        <select value={filters.flag} onChange={e => onFilters({ ...filters, flag: e.target.value })}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12, background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', fontFamily: 'IBM Plex Sans' }}>
          <option value="">All Flags</option>
          {flags.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <div style={{ marginTop: 'auto', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Scroll to zoom · Drag to pan · Double-click to reset
      </div>
    </div>
  )
}

// ---- Stats Overlay ----

const VesselStatsOverlay: React.FC<{ vessels: Vessel[] }> = ({ vessels }) => {
  const byType = useMemo(() => {
    const c = emptyTypeCounts()
    vessels.forEach(v => { c[v.type]++ }); return c
  }, [vessels])
  return (
    <div style={{ position: 'absolute', bottom: 16, left: 16, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-md)', zIndex: 5, minWidth: 155 }}>
      <div className="mono-num" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{vessels.length.toLocaleString()}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>vessels in view</div>
      {VESSEL_TYPE_IDS.map(id => {
        const info = VESSEL_TYPE_INFO[id]
        return (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <VesselSymbolIcon type={id} color={info.color} size={12} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>{info.label}</span>
            <span className="mono-num" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{byType[id]}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---- Main Page ----

export const VesselMap: React.FC = () => {
  const [filters, setFilters] = useState<FilterState>({ types: new Set(VESSEL_TYPE_IDS), speedMax: 25, flag: '' })
  const [layers, setLayers] = useState<LayerState>({ vessels: true, heatmap: true, ports: true })
  const [mapMode, setMapMode] = useState<MapMode>('flat')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [bbox, setBbox] = useState('-180,-90,180,90')
  const updateViewport = useCallback((next: string) => setBbox(prev => prev === next ? prev : next), [])

  const vesselQuery = useQuery({
    queryKey: queryKeys.vessels(bbox, 5000),
    queryFn: ({ signal }) => apiClient.vesselSnapshot({ bbox, limit: 5000 }, { signal }),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  })
  const anomaliesQuery = useQuery({
    queryKey: queryKeys.anomalies(30),
    queryFn: ({ signal }) => apiClient.anomalies({ days: 30 }, { signal }),
  })
  const anomalies = anomaliesQuery.data ?? []
  const watchlistQuery = useQuery({
    queryKey: queryKeys.vesselWatchlist,
    queryFn: ({ signal }) => apiClient.vesselWatchlist({ signal }),
    refetchInterval: 60_000,
  })
  const vessels = useMemo(() => {
    return (vesselQuery.data ?? []).map(mapApiVessel)
  }, [vesselQuery.data])

  const typeCounts = useMemo(() => {
    const counts = emptyTypeCounts()
    vessels.forEach(vessel => { counts[vessel.type]++ })
    return counts
  }, [vessels])

  const flags = useMemo(
    () => Array.from(new Set(vessels.map(vessel => vessel.flag).filter(flag => flag !== 'Unknown'))).sort(),
    [vessels],
  )

  const filtered = useMemo(() => vessels.filter(v =>
    filters.types.has(v.type) && v.speed <= filters.speedMax && (!filters.flag || v.flag === filters.flag)
  ), [filters, vessels])

  const selectedVessel = selectedId !== null ? vessels.find(v => v.id === selectedId) ?? null : null
  const selectedWatchlist = selectedId !== null
    ? (watchlistQuery.data ?? []).find(item => item.mmsi === selectedId)
    : undefined
  const detailQuery = useQuery({
    queryKey: selectedId !== null
      ? (selectedWatchlist ? queryKeys.watchedVesselPositions(selectedId) : queryKeys.vesselDetail(selectedId))
      : ['vessels', 'no-selection'],
    queryFn: async ({ signal }) => {
      if (selectedWatchlist) {
        const track = await apiClient.watchedVesselPositions(selectedId!, 200, { signal })
        return { vessel: null, track }
      }
      return apiClient.vesselDetail(selectedId!, { signal })
    },
    enabled: selectedId !== null,
    retry: false,
  })
  const anomalyQuery = useQuery({
    queryKey: selectedId !== null ? queryKeys.watchedVesselAnomalies(selectedId) : ['risk', 'watchlist', 'no-selection', 'anomalies'],
    queryFn: ({ signal }) => apiClient.watchedVesselAnomalies(selectedId!, { signal }),
    enabled: selectedId !== null,
    retry: false,
  })
  const etaDriftQuery = useQuery({
    queryKey: selectedId !== null ? queryKeys.watchedVesselEtaDrift(selectedId) : ['risk', 'watchlist', 'no-selection', 'eta-drift'],
    queryFn: ({ signal }) => apiClient.watchedVesselEtaDrift(selectedId!, { signal }),
    enabled: selectedId !== null,
    retry: false,
  })

  const sourceError = vesselQuery.error ?? watchlistQuery.error
  const status: VesselSourceStatus = vesselQuery.isLoading || watchlistQuery.isLoading ? 'loading'
    : sourceError ? isDisabledSourceError(sourceError) ? 'disabled' : 'error'
      : vessels.length === 0 ? 'empty'
        : 'live'

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
      <FilterSidebar filters={filters} onFilters={setFilters} layers={layers} onLayers={setLayers} counts={typeCounts} flags={flags} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minWidth: 0 }}>
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: 'var(--shadow-md)', zIndex: 5 }}>
          <Icons.Globe size={14} style={{ color: 'var(--accent)' } as React.CSSProperties} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>GlobalSupplyWatch · Monitored Port Traffic</span>
          <Badge variant={vesselStatusVariant(status)}>{vesselStatusLabel(status)}</Badge>
          <span className="mono-num" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{filtered.length.toLocaleString()} vessels in view</span>
          <div aria-label="Map display mode" style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 2, borderRadius: 7, background: 'rgba(2,6,23,0.42)', border: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              aria-pressed={mapMode === 'flat'}
              onClick={() => setMapMode('flat')}
              title="2D map"
              style={{
                border: 0,
                borderRadius: 5,
                padding: '3px 8px',
                minWidth: 30,
                cursor: 'pointer',
                background: mapMode === 'flat' ? 'var(--accent)' : 'transparent',
                color: mapMode === 'flat' ? 'white' : 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              2D
            </button>
            <button
              type="button"
              aria-pressed={mapMode === 'globe'}
              onClick={() => setMapMode('globe')}
              title="3D globe"
              style={{
                border: 0,
                borderRadius: 5,
                padding: '3px 8px',
                minWidth: 30,
                cursor: 'pointer',
                background: mapMode === 'globe' ? 'var(--accent)' : 'transparent',
                color: mapMode === 'globe' ? 'white' : 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              3D
            </button>
          </div>
        </div>
        <VesselRealMap vessels={filtered} selectedId={selectedId} onSelect={setSelectedId} onViewport={updateViewport} layers={layers} mapMode={mapMode} anomalies={anomalies} />
        <VesselStatsOverlay vessels={filtered} />
        {sourceError && status !== 'disabled' && (
          <div style={{ position: 'absolute', left: 230, top: 64, width: 360, zIndex: 8 }}>
            <ErrorPanel error={sourceError} title="Vessel AIS source unavailable" compact />
          </div>
        )}
        {status === 'disabled' && (
          <div style={{ position: 'absolute', left: 230, top: 64, width: 360, zIndex: 8 }}>
            <EmptyState title="AIS source disabled" detail="Configure AISStream credentials and run the AIS collector to load vessel positions." compact />
          </div>
        )}
        {status === 'empty' && (
          <div style={{ position: 'absolute', left: 230, top: 64, width: 360, zIndex: 8 }}>
            <EmptyState title="No AIS vessels in this viewport" detail="Zoom out or trigger the AIS collector to load real-time vessel positions for monitored ports." compact />
          </div>
        )}
        {selectedVessel && (
          <VesselDrawer
            vessel={selectedVessel}
            detail={detailQuery.data}
            loading={detailQuery.isLoading}
            watchlist={selectedWatchlist}
            etaDrift={etaDriftQuery.data}
            anomalies={anomalyQuery.data}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  )
}
