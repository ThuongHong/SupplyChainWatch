import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import maplibregl, { type MapLayerMouseEvent } from 'maplibre-gl'
import { useQuery } from '@tanstack/react-query'
import 'maplibre-gl/dist/maplibre-gl.css'
import { PORT_DATA } from '../components/MiniMap'
import { Badge } from '../components/Badge'
import { Icons } from '../components/icons'
import { apiClient, type VesselDetail, type VesselSnapshotItem } from '../api/client'
import { queryKeys } from '../api/queries'
import { EmptyState, ErrorPanel } from '../components/DataState'

// ---- Vessel types ----

const VESSEL_TYPE_IDS = ['cargo', 'tanker', 'passenger', 'tug', 'fishing', 'service', 'pleasure', 'other', 'unknown'] as const
type VesselTypeId = typeof VESSEL_TYPE_IDS[number]

const VESSEL_TYPE_INFO: Record<VesselTypeId, { label: string; color: string; symbol: string }> = {
  cargo:     { label: 'Cargo',           color: '#3B82F6', symbol: '■' },
  tanker:    { label: 'Tanker',          color: '#F59E0B', symbol: '◆' },
  passenger: { label: 'Passenger',       color: '#22C55E', symbol: '●' },
  tug:       { label: 'Tug / Towing',     color: '#A855F7', symbol: '▰' },
  fishing:   { label: 'Fishing',         color: '#06B6D4', symbol: '◇' },
  service:   { label: 'Service',         color: '#EF4444', symbol: '+' },
  pleasure:  { label: 'Pleasure / Sail', color: '#EC4899', symbol: '▲' },
  other:     { label: 'Other',           color: '#94A3B8', symbol: '▪' },
  unknown:   { label: 'Unknown',         color: '#64748B', symbol: '•' },
}

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

// ---- Symbol Icon ----

const VesselSymbolIcon: React.FC<{ type: VesselTypeId; color: string; size?: number }> = ({ type, color, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" style={{ flexShrink: 0, display: 'block' }}>
    {type === 'cargo' && <rect x="3" y="3" width="8" height="8" fill={color} />}
    {type === 'tanker'    && <polygon points="7,1 12,7 7,13 2,7" fill={color} />}
    {type === 'passenger' && <circle cx="7" cy="7" r="5" fill={color} />}
    {type === 'tug'       && <path d="M2.5 5.5h9v5h-9zM5 2.5h4v3H5z" fill={color} />}
    {type === 'fishing'   && <polygon points="2,7 7,3 12,7 7,11" fill={color} />}
    {type === 'service'   && <path d="M5.5,2 h3 v3.5 h3.5 v3 h-3.5 v3.5 h-3 v-3.5 h-3.5 v-3 h3.5 z" fill={color} />}
    {type === 'pleasure'  && <polygon points="7,2 12.5,11.5 1.5,11.5" fill={color} />}
    {type === 'other'     && <rect x="3" y="3" width="8" height="8" rx="2" fill={color} />}
    {type === 'unknown'   && <circle cx="7" cy="7" r="4.5" fill={color} opacity="0.8" />}
  </svg>
)

// ---- Real Map ----

type PointFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: Record<string, string | number | boolean | null>
}

type FeatureCollection<TFeature extends PointFeature> = {
  type: 'FeatureCollection'
  features: TFeature[]
}

type MapMode = 'flat' | 'globe'

interface RealMapProps {
  vessels: Vessel[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  onViewport: (bbox: string) => void
  layers: { vessels: boolean; heatmap: boolean; ports: boolean }
  mapMode: MapMode
}

const REAL_MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
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
        symbol: VESSEL_TYPE_INFO[vessel.type].symbol,
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

const emptyPoints: FeatureCollection<PointFeature> = { type: 'FeatureCollection', features: [] }
const VESSEL_SYMBOL_LAYERS = VESSEL_TYPE_IDS.map(type => `vessels-${type}`)
const VESSEL_INTERACTION_LAYERS = ['vessel-type-symbols', ...VESSEL_SYMBOL_LAYERS]

function createVesselIcon(type: VesselTypeId, color: string): ImageData {
  const size = 48
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')
  ctx.translate(size / 2, size / 2)
  ctx.fillStyle = color
  ctx.strokeStyle = 'rgba(2,6,23,0.92)'
  ctx.lineWidth = 4
  ctx.beginPath()
  if (type === 'cargo') {
    ctx.rect(-12, -12, 24, 24)
  } else if (type === 'tanker') {
    ctx.moveTo(0, -16); ctx.lineTo(16, 0); ctx.lineTo(0, 16); ctx.lineTo(-16, 0); ctx.closePath()
  } else if (type === 'passenger') {
    ctx.arc(0, 0, 12, 0, Math.PI * 2)
  } else if (type === 'tug') {
    ctx.rect(-14, -7, 28, 16)
  } else if (type === 'fishing') {
    ctx.moveTo(-16, 0); ctx.lineTo(0, -12); ctx.lineTo(16, 0); ctx.lineTo(0, 12); ctx.closePath()
  } else if (type === 'service') {
    ctx.moveTo(-6, -16); ctx.lineTo(6, -16); ctx.lineTo(6, -6); ctx.lineTo(16, -6); ctx.lineTo(16, 6); ctx.lineTo(6, 6); ctx.lineTo(6, 16); ctx.lineTo(-6, 16); ctx.lineTo(-6, 6); ctx.lineTo(-16, 6); ctx.lineTo(-16, -6); ctx.lineTo(-6, -6); ctx.closePath()
  } else if (type === 'pleasure') {
    ctx.moveTo(0, -16); ctx.lineTo(16, 15); ctx.lineTo(-16, 15); ctx.closePath()
  } else if (type === 'other') {
    ctx.roundRect(-12, -12, 24, 24, 5)
  } else {
    ctx.arc(0, 0, 11, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.stroke()
  return ctx.getImageData(0, 0, size, size)
}

function addVesselIcons(map: maplibregl.Map): void {
  VESSEL_TYPE_IDS.forEach(type => {
    const imageId = `vessel-${type}`
    if (!map.hasImage(imageId)) {
      map.addImage(imageId, createVesselIcon(type, VESSEL_TYPE_INFO[type].color), { pixelRatio: 1 })
    }
  })
}

function mapBoundsToBbox(map: maplibregl.Map): string {
  const bounds = map.getBounds()
  return [
    bounds.getWest().toFixed(4),
    bounds.getSouth().toFixed(4),
    bounds.getEast().toFixed(4),
    bounds.getNorth().toFixed(4),
  ].join(',')
}

function applyMapMode(map: maplibregl.Map, mapMode: MapMode): void {
  try {
    if (mapMode === 'globe') {
      map.setProjection({ type: 'globe' })
      map.setSky({
        'sky-color': '#020617',
        'horizon-color': '#38BDF8',
        'fog-color': '#0E1A32',
        'fog-ground-blend': 0.52,
        'horizon-fog-blend': 0.2,
        'sky-horizon-blend': 0.38,
        'atmosphere-blend': 0.9,
      })
      map.easeTo({ pitch: 35, duration: 500 })
      return
    }
    map.setProjection({ type: 'mercator' })
    map.setSky({
      'sky-color': '#020617',
      'horizon-color': '#020617',
      'fog-color': 'transparent',
      'atmosphere-blend': 0,
    })
    map.easeTo({ pitch: 0, bearing: 0, duration: 500 })
  } catch (error) {
    console.warn('Map display mode update failed', error)
  }
}

const VesselRealMap: React.FC<RealMapProps> = ({ vessels, selectedId, onSelect, onViewport, layers, mapMode }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const hasFitVesselBoundsRef = useRef(false)
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
      addVesselIcons(map)
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
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'speed'], 0, 0.35, 25, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 1, 0.85, 6, 2.35],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 1, 18, 6, 46],
          'heatmap-opacity': 0.86,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(45,212,191,0)',
            0.15, 'rgba(45,212,191,0.5)',
            0.45, 'rgba(56,189,248,0.76)',
            0.7, 'rgba(250,204,21,0.9)',
            0.9, 'rgba(251,146,60,0.96)',
            1, 'rgba(239,68,68,1)',
          ],
        },
      })

      map.addSource('vessels', { type: 'geojson', data: emptyPoints })
      map.addLayer({
        id: 'vessel-halos',
        type: 'circle',
        source: 'vessels',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 8, 5, 12],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-opacity': 0.72,
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 1, 1.4, 5, 2.2],
        },
      })
      VESSEL_TYPE_IDS.forEach(type => {
        map.addLayer({
          id: `vessels-${type}`,
          type: 'symbol',
          source: 'vessels',
          filter: ['==', ['get', 'type'], type],
          layout: {
            'icon-image': `vessel-${type}`,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 0.56, 5, 0.74],
            'icon-rotate': ['get', 'course'],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
          paint: {
            'icon-opacity': 0.98,
          },
        })
      })
      map.addLayer({
        id: 'vessel-type-symbols',
        type: 'symbol',
        source: 'vessels',
        layout: {
          'text-field': ['get', 'symbol'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 1, 15, 5, 20],
          'text-font': ['Open Sans Bold'],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'text-rotation-alignment': 'viewport',
        },
        paint: {
          'text-color': ['get', 'color'],
          'text-halo-color': '#020617',
          'text-halo-width': 1.8,
          'text-opacity': 1,
        },
      })
      applyMapMode(map, mapMode)
      setReady(true)
      onViewport(mapBoundsToBbox(map))
    })

    return () => {
      popupRef.current?.remove()
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [onViewport])

  useEffect(() => {
    if (!ready) return
    const map = mapRef.current
    if (!map) return
    let timer: number | undefined
    const handleMoveEnd = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => onViewport(mapBoundsToBbox(map)), 180)
    }
    map.on('moveend', handleMoveEnd)
    return () => {
      window.clearTimeout(timer)
      map.off('moveend', handleMoveEnd)
    }
  }, [ready, onViewport])

  useEffect(() => {
    if (!ready) return
    const map = mapRef.current
    if (!map) return
    applyMapMode(map, mapMode)
  }, [ready, mapMode])

  useEffect(() => {
    if (!ready) return
    const map = mapRef.current
    const data = vesselsToGeoJson(vessels)
    ;(map?.getSource('vessels') as maplibregl.GeoJSONSource | undefined)?.setData(data)
    ;(map?.getSource('vessel-heat') as maplibregl.GeoJSONSource | undefined)?.setData(data)
  }, [ready, vessels])

  useEffect(() => {
    if (!ready || vessels.length === 0 || hasFitVesselBoundsRef.current) return
    const map = mapRef.current
    if (!map) return
    const bounds = new maplibregl.LngLatBounds()
    vessels.forEach(vessel => bounds.extend([normalizeLon(vessel.lon), vessel.lat]))
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 72, maxZoom: 2.8, duration: 650 })
      hasFitVesselBoundsRef.current = true
    }
  }, [ready, vessels])

  useEffect(() => {
    if (!ready) return
    const map = mapRef.current
    if (!map) return
    const visibility = (visible: boolean) => (visible ? 'visible' : 'none')
    ;['vessel-halos', 'vessel-type-symbols', ...VESSEL_SYMBOL_LAYERS].forEach(id => map.setLayoutProperty(id, 'visibility', visibility(layers.vessels)))
    ;['vessel-heat'].forEach(id => map.setLayoutProperty(id, 'visibility', visibility(layers.heatmap)))
    ;['ports', 'port-halos', 'port-labels'].forEach(id => map.setLayoutProperty(id, 'visibility', visibility(layers.ports)))
  }, [ready, layers])

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
    VESSEL_INTERACTION_LAYERS.forEach(id => {
      map.on('click', id, handleClick)
      map.on('mouseenter', id, handleEnter)
      map.on('mouseleave', id, handleLeave)
    })
    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(event.point, { layers: VESSEL_INTERACTION_LAYERS })
      if (hits.length === 0) onSelect(null)
    }
    map.on('click', handleMapClick)
    return () => {
      VESSEL_INTERACTION_LAYERS.forEach(id => {
        map.off('click', id, handleClick)
        map.off('mouseenter', id, handleEnter)
        map.off('mouseleave', id, handleLeave)
      })
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
        AIS positions · scroll / drag / rotate
      </div>
    </div>
  )
}

// ---- Vessel Drawer ----

const VesselDrawer: React.FC<{ vessel: Vessel; detail?: VesselDetail; loading?: boolean; onClose: () => void }> = ({ vessel, detail, loading, onClose }) => {
  const info = VESSEL_TYPE_INFO[vessel.type]
  const realTrack = detail?.track?.slice().reverse().map(point => ({ x: point.lon, y: point.lat })) ?? []
  const trackPts = realTrack.length > 1 ? realTrack : Array.from({ length: 14 }, (_, i) => ({
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
          {loading ? <div style={{ height: 90, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading track...</div> : <svg width="100%" viewBox="0 0 250 90" style={{ display: 'block' }}>
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
          </svg>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          {realTrack.length > 1 ? `${realTrack.length} API track points` : 'Fallback track shown because no detail track was returned.'}
        </div>
      </div>
    </div>
  )
}

// ---- Filter Sidebar ----

interface FilterState { types: Set<VesselTypeId>; speedMax: number; flag: string }
interface LayerState  { vessels: boolean; heatmap: boolean; ports: boolean }

const LAYER_LABELS: Record<keyof LayerState, string> = {
  vessels: 'Vessels',
  heatmap: 'Density Heatmap',
  ports: 'Port Markers',
}

const FilterSidebar: React.FC<{
  filters: FilterState; onFilters: (f: FilterState) => void
  layers: LayerState;   onLayers:  (l: LayerState) => void
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
  })
  const vessels = useMemo(() => (vesselQuery.data ?? []).map(mapApiVessel), [vesselQuery.data])

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
  const detailQuery = useQuery({
    queryKey: selectedId !== null ? queryKeys.vesselDetail(selectedId) : ['vessels', 'no-selection'],
    queryFn: ({ signal }) => apiClient.vesselDetail(selectedId!, { signal }),
    enabled: selectedId !== null,
    retry: false,
  })

  const status: 'loading' | 'live' | 'error' = vesselQuery.isLoading ? 'loading' : vesselQuery.isError ? 'error' : 'live'

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
      <FilterSidebar filters={filters} onFilters={setFilters} layers={layers} onLayers={setLayers} counts={typeCounts} flags={flags} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minWidth: 0 }}>
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: 'var(--shadow-md)', zIndex: 5 }}>
          <Icons.Globe size={14} style={{ color: 'var(--accent)' } as React.CSSProperties} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>GlobalSupplyWatch · Live Vessel Tracking</span>
          <Badge variant={status === 'error' ? 'danger' : status === 'loading' ? 'warning' : 'success'}>
            {status === 'loading' ? 'Loading AIS' : status === 'error' ? 'API Error' : 'AIS Live'}
          </Badge>
          <span className="mono-num" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{filtered.length.toLocaleString()} shown</span>
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
        <VesselRealMap vessels={filtered} selectedId={selectedId} onSelect={setSelectedId} onViewport={updateViewport} layers={layers} mapMode={mapMode} />
        <VesselStatsOverlay vessels={filtered} />
        {vesselQuery.isError && (
          <div style={{ position: 'absolute', left: 230, top: 64, width: 360, zIndex: 8 }}>
            <ErrorPanel error={vesselQuery.error} title="Vessel snapshot unavailable" compact />
          </div>
        )}
        {!vesselQuery.isLoading && !vesselQuery.isError && vessels.length === 0 && (
          <div style={{ position: 'absolute', left: 230, top: 64, width: 360, zIndex: 8 }}>
            <EmptyState title="No vessels in this viewport" detail="Pan or zoom out, or run AIS collectors before the demo." compact />
          </div>
        )}
        {selectedVessel && <VesselDrawer vessel={selectedVessel} detail={detailQuery.data} loading={detailQuery.isLoading} onClose={() => setSelectedId(null)} />}
      </div>
    </div>
  )
}
