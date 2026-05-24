import React, { useEffect, useRef, useState, useMemo } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { PortCongestionResponse, AnomalyResponse } from '../api/client'
import { Icons } from './icons'

export const PORT_DATA = [
  { name: 'Shanghai', lat: 31.2, lon: 121.5, congestion: 'high' as const },
  { name: 'Singapore', lat: 1.3, lon: 103.8, congestion: 'medium' as const },
  { name: 'Rotterdam', lat: 51.9, lon: 4.5, congestion: 'low' as const },
  { name: 'Los Angeles', lat: 33.9, lon: -118.2, congestion: 'high' as const },
  { name: 'Antwerp', lat: 51.2, lon: 4.4, congestion: 'medium' as const },
  { name: 'Ningbo', lat: 29.9, lon: 121.6, congestion: 'high' as const },
  { name: 'Busan', lat: 35.1, lon: 129.0, congestion: 'low' as const },
  { name: 'Hamburg', lat: 53.5, lon: 10.0, congestion: 'medium' as const },
  { name: 'Shenzhen', lat: 22.5, lon: 114.1, congestion: 'medium' as const },
  { name: 'Hong Kong', lat: 22.3, lon: 114.2, congestion: 'low' as const },
]

const congColor: Record<string, string> = { low: 'var(--cong-low)', medium: 'var(--cong-med)', high: 'var(--cong-high)' }
const congHex: Record<string, string> = { low: '#22C55E', medium: '#EAB308', high: '#EF4444' }

interface MiniMapProps {
  width?: number
  height?: number
  congestion?: PortCongestionResponse[]
  anomalies?: AnomalyResponse[]
}

export const MiniMap: React.FC<MiniMapProps> = ({ width: W = 440, height: H = 200, congestion = [], anomalies = [] }) => {
  const [hoverPort, setHoverPort] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  const currentPorts = useMemo(() => {
    return PORT_DATA.map((port, index) => {
      const portAnomalies = anomalies.filter(
        a => a.port_name?.toLowerCase() === port.name.toLowerCase() ||
             (a.port_id && a.port_id === index + 1)
      )
      const activeAnomaly = portAnomalies.find(a => a.severity === 'high' || a.severity === 'medium')
      const level = activeAnomaly ? (activeAnomaly.severity as 'high' | 'medium') : 'low'
      return { ...port, congestion: level, hasAnomaly: !!activeAnomaly }
    })
  }, [anomalies])

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = new maplibregl.Map({
      container,
      style: {
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
      },
      center: [48, 25],
      zoom: 0.9,
      minZoom: 0.85,
      maxZoom: 4,
      attributionControl: false,
    })
    map.dragPan.disable()
    map.scrollZoom.disable()
    map.doubleClickZoom.disable()
    map.touchZoomRotate.disable()
    map.keyboard.disable()
    mapRef.current = map

    map.on('load', () => {
      map.addSource('ports-mini', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: currentPorts.map((port, index) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [port.lon, port.lat] },
            properties: {
              index,
              name: port.name,
              congestion: port.congestion,
              color: congHex[port.congestion],
            },
          })),
        },
      })
      map.addLayer({
        id: 'ports-mini-halo',
        type: 'circle',
        source: 'ports-mini',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0.85, 9, 4, 21],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.16,
        },
      })
      map.addLayer({
        id: 'ports-mini',
        type: 'circle',
        source: 'ports-mini',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0.85, 3.5, 4, 7],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#F8FAFC',
          'circle-stroke-width': 0.75,
        },
      })
      map.addLayer({
        id: 'ports-mini-labels',
        type: 'symbol',
        source: 'ports-mini',
        minzoom: 1.25,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 10,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#CBD5E1',
          'text-halo-color': '#020617',
          'text-halo-width': 1,
        },
      })
      map.on('mouseenter', 'ports-mini', event => {
        const index = event.features?.[0]?.properties?.index
        setHoverPort(typeof index === 'number' ? index : Number(index))
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'ports-mini', () => {
        setHoverPort(null)
        map.getCanvas().style.cursor = ''
      })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource('ports-mini') as maplibregl.GeoJSONSource | undefined
    if (!source) return
    source.setData({
      type: 'FeatureCollection',
      features: currentPorts.map((port, index) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [port.lon, port.lat] },
        properties: {
          index,
          name: port.name,
          congestion: port.congestion,
          color: congHex[port.congestion],
        },
      })),
    })
  }, [currentPorts])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!map.getLayer('ports-mini-halo')) return
    if (hoverPort === null) {
      map.setFilter('ports-mini-halo', null)
      return
    }
    map.setFilter('ports-mini-halo', ['==', ['get', 'index'], hoverPort])
  }, [hoverPort])

  return (
    <div style={{ position: 'relative', width: '100%', height: H, minHeight: H, borderRadius: 6, overflow: 'hidden', background: '#060B16' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <div style={{
        position: 'absolute', left: 8, bottom: 8, display: 'flex', gap: 8,
        background: 'rgba(12,18,33,0.78)', border: '1px solid var(--border-subtle)',
        borderRadius: 6, padding: '5px 7px', pointerEvents: 'none',
      }}>
        {(['low', 'medium', 'high'] as const).map(level => (
          <span key={level} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: congColor[level] }} />
            {level === 'low' ? 'Normal' : level === 'medium' ? 'Medium Anomaly' : 'High Anomaly'}
          </span>
        ))}
      </div>
      {hoverPort !== null && (
        <div style={{
          position: 'absolute', right: 8, top: 8, background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)', borderRadius: 6,
          padding: '6px 8px', boxShadow: 'var(--shadow-sm)',
          zIndex: 10,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{currentPorts[hoverPort]?.name}</div>
          <div style={{ fontSize: 10, color: congColor[currentPorts[hoverPort]?.congestion ?? 'low'], marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            {currentPorts[hoverPort]?.hasAnomaly && <Icons.AlertTriangle size={10} style={{ color: congColor[currentPorts[hoverPort]?.congestion ?? 'low'] }} />}
            {currentPorts[hoverPort]?.hasAnomaly ? `${currentPorts[hoverPort]?.congestion.toUpperCase()} anomaly` : 'Normal'}
          </div>
        </div>
      )}
    </div>
  )
}
