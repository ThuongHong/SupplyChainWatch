import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import maplibregl, { type MapLayerMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { PORT_DATA } from '../components/MiniMap'
import { Badge } from '../components/Badge'
import { Icons } from '../components/icons'

// ---- Vessel types ----

const VESSEL_TYPE_IDS = ['container', 'tanker', 'bulk', 'other'] as const
type VesselTypeId = typeof VESSEL_TYPE_IDS[number]

const VESSEL_TYPE_INFO: Record<VesselTypeId, { label: string; color: string; count: number }> = {
  container: { label: 'Container',    color: '#3B82F6', count: 4231 },
  tanker:    { label: 'Tanker',       color: '#F59E0B', count: 3892 },
  bulk:      { label: 'Bulk Carrier', color: '#06B6D4', count: 2847 },
  other:     { label: 'Other',        color: '#64748B', count: 1877 },
}

const FLAGS = ['Panama', 'Liberia', 'Marshall Is.', 'Hong Kong', 'Singapore', 'Bahamas', 'Malta', 'Greece', 'China', 'Japan']

const NAMED_VESSELS = [
  { name: 'MSC Marina',       type: 'container' as VesselTypeId, flag: 'Panama' },
  { name: 'Maersk Eindhoven', type: 'container' as VesselTypeId, flag: 'Singapore' },
  { name: 'CMA CGM Pegasus',  type: 'container' as VesselTypeId, flag: 'Malta' },
  { name: 'COSCO Universe',   type: 'container' as VesselTypeId, flag: 'Hong Kong' },
  { name: 'Ever Given',       type: 'container' as VesselTypeId, flag: 'Panama' },
  { name: 'Nordic Voyager',   type: 'tanker'    as VesselTypeId, flag: 'Liberia' },
  { name: 'Suezmax Pioneer',  type: 'tanker'    as VesselTypeId, flag: 'Marshall Is.' },
  { name: 'Arabian Pearl',    type: 'tanker'    as VesselTypeId, flag: 'Liberia' },
  { name: 'Pacific Fortune',  type: 'bulk'      as VesselTypeId, flag: 'China' },
  { name: 'Golden Harvest',   type: 'bulk'      as VesselTypeId, flag: 'Japan' },
  { name: 'Great Wall',       type: 'bulk'      as VesselTypeId, flag: 'Hong Kong' },
  { name: 'Cape Brilliance',  type: 'bulk'      as VesselTypeId, flag: 'Marshall Is.' },
  { name: 'Stena Explorer',   type: 'other'     as VesselTypeId, flag: 'Greece' },
]

const LANES: { pts: [number, number][] }[] = [
  { pts: [[122,31],[160,38],[190,40],[220,36],[240,34]] },
  { pts: [[104,1],[85,12],[60,22],[44,30],[33,32],[10,48],[0,51]] },
  { pts: [[55,25],[70,18],[85,12],[104,1]] },
  { pts: [[0,51],[-15,48],[-40,42],[-70,38],[-78,33]] },
  { pts: [[-45,-22],[-30,-15],[-15,5],[0,35]] },
  { pts: [[104,1],[110,-8],[120,-18],[135,-25],[150,-32]] },
  { pts: [[122,31],[126,34],[130,35],[135,35]] },
]

const CONTINENTS: [number, number][][] = [
  [[-130,50],[-140,58],[-160,62],[-168,65],[-165,72],[-140,70],[-120,72],[-95,72],[-80,68],[-65,60],[-55,48],[-67,44],[-75,35],[-82,25],[-98,18],[-105,20],[-115,28],[-120,34],[-125,42],[-130,50]],
  [[-98,18],[-95,16],[-88,15],[-84,11],[-80,8],[-78,9],[-82,14],[-85,16],[-90,20],[-98,18]],
  [[-80,8],[-75,10],[-60,5],[-50,0],[-35,-5],[-35,-15],[-38,-22],[-43,-23],[-48,-28],[-53,-33],[-58,-38],[-65,-46],[-68,-53],[-72,-50],[-75,-42],[-75,-30],[-70,-18],[-75,-10],[-80,0],[-80,8]],
  [[-10,36],[0,38],[5,44],[0,48],[-5,48],[2,51],[5,54],[8,54],[12,56],[15,58],[10,62],[18,65],[20,70],[28,71],[32,68],[30,60],[28,55],[22,52],[14,50],[12,46],[15,42],[12,38],[5,36],[-10,36]],
  [[-15,35],[-17,15],[-15,5],[-8,5],[5,5],[10,2],[10,-5],[12,-10],[15,-18],[20,-28],[25,-34],[32,-34],[35,-28],[40,-15],[45,-12],[50,0],[50,10],[44,12],[42,18],[35,30],[32,35],[10,37],[0,36],[-15,35]],
  [[28,71],[35,68],[42,65],[52,62],[60,56],[68,55],[75,55],[85,50],[90,46],[95,42],[100,38],[105,30],[110,22],[115,22],[118,25],[122,31],[125,34],[128,36],[130,38],[132,35],[132,32],[135,34],[140,38],[142,42],[145,45],[140,52],[135,55],[140,58],[145,60],[160,62],[175,65],[180,68],[180,72],[170,72],[140,72],[120,72],[100,72],[80,72],[60,72],[40,70],[28,71]],
  [[68,28],[72,22],[76,15],[78,8],[80,12],[85,18],[88,22],[92,18],[95,16],[100,14],[100,18],[105,15],[110,5],[115,2],[105,0],[98,2],[95,8],[88,25],[82,28],[72,30],[68,28]],
  [[115,-15],[120,-14],[130,-12],[138,-14],[145,-16],[150,-22],[153,-27],[152,-32],[148,-36],[142,-38],[136,-35],[130,-32],[125,-30],[118,-22],[114,-25],[115,-20],[115,-15]],
]

// Labels: [lon, lat, text, minZoom, fontSize, opacity]
const MAP_LABELS: { lon: number; lat: number; text: string; minZoom: number; size: number; alpha: number; upper: boolean }[] = [
  // Oceans
  { lon: -160, lat: 5,  text: 'PACIFIC OCEAN',  minZoom: 0.8, size: 13, alpha: 0.2, upper: true },
  { lon: 170,  lat: 5,  text: 'PACIFIC',        minZoom: 0.8, size: 11, alpha: 0.18, upper: true },
  { lon: -30,  lat: 12, text: 'ATLANTIC OCEAN', minZoom: 0.8, size: 12, alpha: 0.2, upper: true },
  { lon: 75,   lat: -25,text: 'INDIAN OCEAN',   minZoom: 0.8, size: 12, alpha: 0.2, upper: true },
  { lon: 0,    lat: 78, text: 'ARCTIC OCEAN',   minZoom: 0.8, size: 10, alpha: 0.18, upper: true },
  { lon: 10,   lat: -55,text: 'SOUTHERN OCEAN', minZoom: 0.8, size: 10, alpha: 0.18, upper: true },
  // Major regions / countries
  { lon: -100, lat: 62, text: 'CANADA',         minZoom: 1,   size: 11, alpha: 0.35, upper: true },
  { lon: -98,  lat: 38, text: 'UNITED STATES',  minZoom: 1,   size: 12, alpha: 0.35, upper: true },
  { lon: -52,  lat: -12,text: 'BRAZIL',         minZoom: 1,   size: 11, alpha: 0.35, upper: true },
  { lon: 15,   lat: 52, text: 'EUROPE',         minZoom: 1,   size: 11, alpha: 0.3, upper: true },
  { lon: 100,  lat: 65, text: 'RUSSIA',         minZoom: 1,   size: 13, alpha: 0.35, upper: true },
  { lon: 105,  lat: 36, text: 'CHINA',          minZoom: 1,   size: 12, alpha: 0.35, upper: true },
  { lon: 80,   lat: 22, text: 'INDIA',          minZoom: 1,   size: 11, alpha: 0.35, upper: true },
  { lon: 133,  lat: -25,text: 'AUSTRALIA',      minZoom: 1,   size: 11, alpha: 0.35, upper: true },
  { lon: 22,   lat: 5,  text: 'AFRICA',         minZoom: 1,   size: 12, alpha: 0.3, upper: true },
  { lon: -60,  lat: -20,text: 'S. AMERICA',     minZoom: 1,   size: 10, alpha: 0.28, upper: true },
  // Smaller countries (min zoom 1.8)
  { lon: 44,   lat: 24, text: 'SAUDI ARABIA',   minZoom: 1.8, size: 10, alpha: 0.4, upper: true },
  { lon: 138,  lat: 36, text: 'JAPAN',          minZoom: 1.8, size: 10, alpha: 0.4, upper: true },
  { lon: 128,  lat: 36, text: 'KOREA',          minZoom: 2.5, size: 9,  alpha: 0.4, upper: true },
  { lon: -3,   lat: 54, text: 'UK',             minZoom: 2.5, size: 9,  alpha: 0.4, upper: true },
  { lon: 2,    lat: 46, text: 'FRANCE',         minZoom: 2.5, size: 9,  alpha: 0.4, upper: true },
  { lon: 10,   lat: 51, text: 'GERMANY',        minZoom: 2.5, size: 9,  alpha: 0.4, upper: true },
  { lon: 35,   lat: 39, text: 'TURKEY',         minZoom: 2,   size: 9,  alpha: 0.4, upper: true },
  { lon: 104,  lat: 14, text: 'SE ASIA',        minZoom: 1.5, size: 9,  alpha: 0.3, upper: true },
  // Seas / straits
  { lon: 18,   lat: 36, text: 'Mediterranean',  minZoom: 1.5, size: 9,  alpha: 0.22, upper: false },
  { lon: -90,  lat: 24, text: 'Gulf of Mexico', minZoom: 1.5, size: 9,  alpha: 0.22, upper: false },
  { lon: 113,  lat: 14, text: 'South China Sea',minZoom: 1.5, size: 9,  alpha: 0.22, upper: false },
  { lon: 62,   lat: 18, text: 'Arabian Sea',    minZoom: 2,   size: 8,  alpha: 0.22, upper: false },
  { lon: 89,   lat: 14, text: 'Bay of Bengal',  minZoom: 2,   size: 8,  alpha: 0.22, upper: false },
  { lon: 32,   lat: 27, text: 'Red Sea',        minZoom: 2,   size: 8,  alpha: 0.22, upper: false },
  { lon: 52,   lat: 26, text: 'Persian Gulf',   minZoom: 2,   size: 8,  alpha: 0.22, upper: false },
  { lon: 32,   lat: 41, text: 'Black Sea',      minZoom: 2.5, size: 8,  alpha: 0.22, upper: false },
  { lon: -60,  lat: 12, text: 'Caribbean Sea',  minZoom: 2,   size: 8,  alpha: 0.22, upper: false },
]

// ---- Types ----

interface Vessel {
  id: number; name: string; type: VesselTypeId; flag: string
  imo: string; mmsi: string; lat: number; lon: number; speed: number; course: number
}

interface Viewport { zoom: number; pan: { x: number; y: number } }

// ---- Data Generation ----

const LANE_WEIGHTS = [4, 5, 2, 2, 1.5, 1, 1.5]
const TOTAL_LANE_W = LANE_WEIGHTS.reduce((a, b) => a + b, 0)

function seededRand(i: number, s: number): number {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453
  return x - Math.floor(x)
}

function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180
}

function generateVessels(count: number): Vessel[] {
  const vessels: Vessel[] = []
  for (let i = 0; i < count; i++) {
    let r = seededRand(i, 0) * TOTAL_LANE_W, laneIdx = 0
    for (let j = 0; j < LANES.length; j++) { r -= LANE_WEIGHTS[j]; if (r <= 0) { laneIdx = j; break } }
    const lane = LANES[laneIdx]
    const t = seededRand(i, 1)
    const segIdx = Math.min(Math.floor(t * (lane.pts.length - 1)), lane.pts.length - 2)
    const segT = t * (lane.pts.length - 1) - segIdx
    const p0 = lane.pts[segIdx], p1 = lane.pts[segIdx + 1]
    const typeR = seededRand(i, 4)
    const type: VesselTypeId = typeR < 0.33 ? 'container' : typeR < 0.6 ? 'tanker' : typeR < 0.82 ? 'bulk' : 'other'
    const named = i < NAMED_VESSELS.length ? NAMED_VESSELS[i] : null
    vessels.push({
      id: i,
      name: named ? named.name : `Vessel ${String(i).padStart(4, '0')}`,
      type: named ? named.type : type,
      flag: named ? named.flag : FLAGS[Math.floor(seededRand(i, 7) * FLAGS.length)],
      imo: `9${String(Math.floor(seededRand(i, 8) * 900000 + 100000))}`,
      mmsi: String(Math.floor(seededRand(i, 9) * 900000000 + 100000000)),
      lat: Math.max(-58, Math.min(72, p0[1] + (p1[1] - p0[1]) * segT + (seededRand(i, 3) - 0.5) * 12)),
      lon: normalizeLon(p0[0] + (p1[0] - p0[0]) * segT + (seededRand(i, 2) - 0.5) * 20),
      speed: Math.round((5 + seededRand(i, 5) * 18) * 10) / 10,
      course: Math.round(seededRand(i, 6) * 360),
    })
  }
  return vessels
}

const ALL_VESSELS = generateVessels(1200)

// ---- Symbol Icon ----

const VesselSymbolIcon: React.FC<{ type: VesselTypeId; color: string; size?: number }> = ({ type, color, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" style={{ flexShrink: 0, display: 'block' }}>
    {type === 'container' && <rect x="3" y="3" width="8" height="8" fill={color} />}
    {type === 'tanker'    && <polygon points="7,1 12,7 7,13 2,7" fill={color} />}
    {type === 'bulk'      && <polygon points="7,2 12.5,11.5 1.5,11.5" fill={color} />}
    {type === 'other'     && <path d="M5.5,2 h3 v3.5 h3.5 v3 h-3.5 v3.5 h-3 v-3.5 h-3.5 v-3 h3.5 z" fill={color} />}
  </svg>
)

// ---- Real Map ----

type PointFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: Record<string, string | number | boolean | null>
}

type LineFeature = {
  type: 'Feature'
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  properties: Record<string, string | number | boolean | null>
}

type FeatureCollection<TFeature extends PointFeature | LineFeature> = {
  type: 'FeatureCollection'
  features: TFeature[]
}

interface RealMapProps {
  vessels: Vessel[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  layers: { vessels: boolean; heatmap: boolean; ports: boolean; lanes: boolean }
}

const REAL_MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
  },
  layers: [{ id: 'carto-base', type: 'raster', source: 'carto' }],
}

function vesselsToGeoJson(vessels: Vessel[]): FeatureCollection<PointFeature> {
  return {
    type: 'FeatureCollection',
    features: vessels.map(vessel => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [normalizeLon(vessel.lon), vessel.lat] },
      properties: {
        id: vessel.id,
        name: vessel.name,
        type: vessel.type,
        typeLabel: VESSEL_TYPE_INFO[vessel.type].label,
        color: VESSEL_TYPE_INFO[vessel.type].color,
        flag: vessel.flag,
        speed: vessel.speed,
        course: vessel.course,
      },
    })),
  }
}

function portsToGeoJson(): FeatureCollection<PointFeature> {
  return {
    type: 'FeatureCollection',
    features: PORT_DATA.map(port => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [port.lon, port.lat] },
      properties: {
        name: port.name,
        congestion: port.congestion,
        color: port.congestion === 'high' ? '#EF4444' : port.congestion === 'medium' ? '#EAB308' : '#22C55E',
      },
    })),
  }
}

function lanesToGeoJson(): FeatureCollection<LineFeature> {
  return {
    type: 'FeatureCollection',
    features: LANES.map((lane, index) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: lane.pts.map(([lon, lat]) => [normalizeLon(lon), lat]) },
      properties: { id: index },
    })),
  }
}

const emptyPoints: FeatureCollection<PointFeature> = { type: 'FeatureCollection', features: [] }

const VesselRealMap: React.FC<RealMapProps> = ({ vessels, selectedId, onSelect, layers }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const [ready, setReady] = useState(false)

  const selectedVessel = useMemo(
    () => (selectedId !== null ? vessels.find(vessel => vessel.id === selectedId) ?? null : null),
    [selectedId, vessels],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = new maplibregl.Map({
      container,
      style: REAL_MAP_STYLE,
      center: [35, 22],
      zoom: 1.55,
      minZoom: 1,
      maxZoom: 8,
      attributionControl: false,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')

    map.on('load', () => {
      map.addSource('shipping-lanes', { type: 'geojson', data: lanesToGeoJson() })
      map.addLayer({
        id: 'shipping-lanes-glow',
        type: 'line',
        source: 'shipping-lanes',
        paint: {
          'line-color': '#38BDF8',
          'line-opacity': 0.16,
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1.5, 5, 4],
          'line-blur': 2,
        },
      })
      map.addLayer({
        id: 'shipping-lanes',
        type: 'line',
        source: 'shipping-lanes',
        paint: {
          'line-color': '#93C5FD',
          'line-opacity': 0.45,
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 5, 1.6],
          'line-dasharray': [2, 2],
        },
      })

      map.addSource('ports', { type: 'geojson', data: portsToGeoJson() })
      map.addLayer({
        id: 'port-halos',
        type: 'circle',
        source: 'ports',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 7, 5, 16],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.16,
        },
      })
      map.addLayer({
        id: 'ports',
        type: 'circle',
        source: 'ports',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3, 5, 6],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#F8FAFC',
          'circle-stroke-width': 0.8,
        },
      })
      map.addLayer({
        id: 'port-labels',
        type: 'symbol',
        source: 'ports',
        minzoom: 2.2,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-offset': [0, 1.15],
          'text-anchor': 'top',
          'text-font': ['Open Sans Regular'],
        },
        paint: {
          'text-color': '#E2E8F0',
          'text-halo-color': '#020617',
          'text-halo-width': 1.2,
        },
      })

      map.addSource('vessel-heat', { type: 'geojson', data: emptyPoints })
      map.addLayer({
        id: 'vessel-heat',
        type: 'heatmap',
        source: 'vessel-heat',
        maxzoom: 7,
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'speed'], 0, 0.2, 25, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 1, 0.35, 6, 1.5],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 1, 12, 6, 32],
          'heatmap-opacity': 0.62,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(14,165,233,0)',
            0.2, 'rgba(14,165,233,0.35)',
            0.55, 'rgba(59,130,246,0.62)',
            0.85, 'rgba(234,179,8,0.78)',
            1, 'rgba(239,68,68,0.88)',
          ],
        },
      })

      map.addSource('vessels', { type: 'geojson', data: emptyPoints })
      map.addLayer({
        id: 'vessels',
        type: 'circle',
        source: 'vessels',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'id'], selectedId ?? -1], 7, ['interpolate', ['linear'], ['zoom'], 1, 2.1, 5, 4.3]],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.86,
          'circle-stroke-color': ['case', ['==', ['get', 'id'], selectedId ?? -1], '#FFFFFF', 'rgba(2,6,23,0.75)'],
          'circle-stroke-width': ['case', ['==', ['get', 'id'], selectedId ?? -1], 2, 0.8],
        },
      })
      setReady(true)
    })

    return () => {
      popupRef.current?.remove()
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const map = mapRef.current
    const data = vesselsToGeoJson(vessels)
    ;(map?.getSource('vessels') as maplibregl.GeoJSONSource | undefined)?.setData(data)
    ;(map?.getSource('vessel-heat') as maplibregl.GeoJSONSource | undefined)?.setData(data)
  }, [ready, vessels])

  useEffect(() => {
    if (!ready) return
    const map = mapRef.current
    if (!map) return
    const visibility = (visible: boolean) => (visible ? 'visible' : 'none')
    ;['vessels'].forEach(id => map.setLayoutProperty(id, 'visibility', visibility(layers.vessels)))
    ;['vessel-heat'].forEach(id => map.setLayoutProperty(id, 'visibility', visibility(layers.heatmap)))
    ;['ports', 'port-halos', 'port-labels'].forEach(id => map.setLayoutProperty(id, 'visibility', visibility(layers.ports)))
    ;['shipping-lanes', 'shipping-lanes-glow'].forEach(id => map.setLayoutProperty(id, 'visibility', visibility(layers.lanes)))
  }, [ready, layers])

  useEffect(() => {
    if (!ready) return
    const map = mapRef.current
    if (!map) return
    const selected = selectedId ?? -1
    map.setPaintProperty('vessels', 'circle-radius', ['case', ['==', ['get', 'id'], selected], 7, ['interpolate', ['linear'], ['zoom'], 1, 2.1, 5, 4.3]])
    map.setPaintProperty('vessels', 'circle-stroke-color', ['case', ['==', ['get', 'id'], selected], '#FFFFFF', 'rgba(2,6,23,0.75)'])
    map.setPaintProperty('vessels', 'circle-stroke-width', ['case', ['==', ['get', 'id'], selected], 2, 0.8])
  }, [ready, selectedId])

  useEffect(() => {
    if (!ready || !selectedVessel) return
    const map = mapRef.current
    if (!map) return
    const lngLat: [number, number] = [normalizeLon(selectedVessel.lon), selectedVessel.lat]
    map.easeTo({ center: lngLat, zoom: Math.max(map.getZoom(), 3.1), duration: 550 })
    popupRef.current?.remove()
    popupRef.current = new maplibregl.Popup({ closeButton: false, offset: 13, className: 'gsw-map-popup' })
      .setLngLat(lngLat)
      .setHTML(`<strong>${selectedVessel.name}</strong><span>${VESSEL_TYPE_INFO[selectedVessel.type].label} · ${selectedVessel.speed} kn</span>`)
      .addTo(map)
  }, [ready, selectedVessel])

  useEffect(() => {
    if (!ready || selectedVessel) return
    popupRef.current?.remove()
  }, [ready, selectedVessel])

  useEffect(() => {
    if (!ready) return
    const map = mapRef.current
    if (!map) return
    const handleClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      const id = feature?.properties?.id
      onSelect(typeof id === 'number' ? id : Number(id))
    }
    const handleEnter = () => { map.getCanvas().style.cursor = 'pointer' }
    const handleLeave = () => { map.getCanvas().style.cursor = '' }
    map.on('click', 'vessels', handleClick)
    map.on('mouseenter', 'vessels', handleEnter)
    map.on('mouseleave', 'vessels', handleLeave)
    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(event.point, { layers: ['vessels'] })
      if (hits.length === 0) onSelect(null)
    }
    map.on('click', handleMapClick)
    return () => {
      map.off('click', 'vessels', handleClick)
      map.off('mouseenter', 'vessels', handleEnter)
      map.off('mouseleave', 'vessels', handleLeave)
      map.off('click', handleMapClick)
    }
  }, [ready, onSelect])

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      <div style={{
        position: 'absolute', right: 12, top: 12, zIndex: 2, pointerEvents: 'none',
        background: 'rgba(12,18,33,0.86)', border: '1px solid var(--border-subtle)', borderRadius: 7,
        padding: '6px 9px', fontSize: 11, color: 'var(--text-secondary)', boxShadow: 'var(--shadow-sm)',
      }}>
        Real basemap · scroll / drag / rotate
      </div>
    </div>
  )
}

// ---- Vessel Drawer ----

const VesselDrawer: React.FC<{ vessel: Vessel; onClose: () => void }> = ({ vessel, onClose }) => {
  const info = VESSEL_TYPE_INFO[vessel.type]
  const trackPts = Array.from({ length: 14 }, (_, i) => ({
    x: vessel.lon - (14 - i) * 0.8 + Math.sin(i) * 0.5,
    y: vessel.lat + (14 - i) * 0.3 * Math.cos(i * 0.7),
  }))
  const minX = Math.min(...trackPts.map(p => p.x)), maxX = Math.max(...trackPts.map(p => p.x))
  const minY = Math.min(...trackPts.map(p => p.y)), maxY = Math.max(...trackPts.map(p => p.y))
  const rx = maxX - minX || 1, ry = maxY - minY || 1

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
          <svg width="100%" viewBox="0 0 250 90" style={{ display: 'block' }}>
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
          </svg>
        </div>
      </div>
    </div>
  )
}

// ---- Filter Sidebar ----

interface FilterState { types: Set<VesselTypeId>; speedMax: number; flag: string }
interface LayerState  { vessels: boolean; heatmap: boolean; ports: boolean; lanes: boolean }

const FilterSidebar: React.FC<{
  filters: FilterState; onFilters: (f: FilterState) => void
  layers: LayerState;   onLayers:  (l: LayerState) => void
}> = ({ filters, onFilters, layers, onLayers }) => {
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
              <span className="mono-num" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{info.count.toLocaleString()}</span>
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
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={val} onChange={e => onLayers({ ...layers, [key]: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
            {{ vessels: 'Vessels', heatmap: 'Density Heatmap', ports: 'Port Markers', lanes: 'Shipping Lanes' }[key]}
          </label>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>Flag</div>
        <select value={filters.flag} onChange={e => onFilters({ ...filters, flag: e.target.value })}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12, background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', fontFamily: 'IBM Plex Sans' }}>
          <option value="">All Flags</option>
          {FLAGS.map(f => <option key={f} value={f}>{f}</option>)}
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
    const c: Record<VesselTypeId, number> = { container: 0, tanker: 0, bulk: 0, other: 0 }
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
  const [layers, setLayers] = useState<LayerState>({ vessels: true, heatmap: false, ports: true, lanes: true })
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const filtered = useMemo(() => ALL_VESSELS.filter(v =>
    filters.types.has(v.type) && v.speed <= filters.speedMax && (!filters.flag || v.flag === filters.flag)
  ), [filters])

  const selectedVessel = selectedId !== null ? ALL_VESSELS.find(v => v.id === selectedId) ?? null : null

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
      <FilterSidebar filters={filters} onFilters={setFilters} layers={layers} onLayers={setLayers} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minWidth: 0 }}>
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: 'var(--shadow-md)', zIndex: 5 }}>
          <Icons.Globe size={14} style={{ color: 'var(--accent)' } as React.CSSProperties} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>GlobalSupplyWatch · Live Vessel Tracking</span>
          <Badge variant="success">Live</Badge>
        </div>
        <VesselRealMap vessels={filtered} selectedId={selectedId} onSelect={setSelectedId} layers={layers} />
        <VesselStatsOverlay vessels={filtered} />
        {selectedVessel && <VesselDrawer vessel={selectedVessel} onClose={() => setSelectedId(null)} />}
      </div>
    </div>
  )
}
