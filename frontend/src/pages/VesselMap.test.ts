import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'VesselMap.tsx'), 'utf8')

describe('VesselMap layer controls', () => {
  it('removes the shipping lanes feature from map setup and controls', () => {
    expect(source).not.toMatch(/shipping-lanes|Shipping Lanes|lanesToGeoJson|LANES/)
    expect(source).not.toMatch(/lanes:\s*boolean/)
  })

  it('makes the vessel density heatmap obvious when enabled', () => {
    expect(source).toMatch(/heatmap:\s*true/)
    expect(source).toMatch(/'heatmap-opacity':\s*0\.86/)
    expect(source).toMatch(/1,\s*18,\s*6,\s*46/)
    expect(source).toMatch(/0\.9,\s*'rgba\(251,146,60,0\.96\)'/)
  })
})

describe('VesselMap globe mode toggle', () => {
  it('keeps the original 2D map as the default mode', () => {
    expect(source).toMatch(/type MapMode = 'flat' \| 'globe'/)
    expect(source).toMatch(/useState<MapMode>\('flat'\)/)
  })

  it('passes map mode into the MapLibre map component', () => {
    expect(source).toMatch(/mapMode:\s*MapMode/)
    expect(source).toMatch(/<VesselRealMap[^>]*mapMode=\{mapMode\}/s)
  })

  it('switches MapLibre between mercator and globe projections', () => {
    expect(source).toMatch(/setProjection\(\{\s*type:\s*'mercator'\s*\}\)/)
    expect(source).toMatch(/setProjection\(\{\s*type:\s*'globe'\s*\}\)/)
    expect(source).toMatch(/setSky\(/)
    expect(source).toMatch(/'atmosphere-blend':\s*0\.9/)
  })

  it('renders a compact 2D and 3D segmented control', () => {
    expect(source).toMatch(/aria-label="Map display mode"/)
    expect(source).toMatch(/aria-pressed=\{mapMode === 'flat'\}/)
    expect(source).toMatch(/aria-pressed=\{mapMode === 'globe'\}/)
    expect(source).toMatch(/>\s*2D\s*</)
    expect(source).toMatch(/>\s*3D\s*</)
  })
})

describe('VesselMap selective drilldown', () => {
  it('uses watchlist APIs and labels the map as selective AIS drilldown', () => {
    expect(source).toMatch(/vesselWatchlist/)
    expect(source).toMatch(/watchedVesselPositions/)
    expect(source).toMatch(/watchedVesselAnomalies/)
    expect(source).toMatch(/watchedVesselEtaDrift/)
    expect(source).toMatch(/Selective Vessel Drilldown/)
    expect(source).toMatch(/Watchlist AIS/)
  })

  it('shows ETA drift, anomaly markers, and watchlist reason in drawer', () => {
    expect(source).toMatch(/Operational Context/)
    expect(source).toMatch(/Watchlist reason/)
    expect(source).toMatch(/ETA drift/)
    expect(source).toMatch(/Anomaly markers/)
  })
})
