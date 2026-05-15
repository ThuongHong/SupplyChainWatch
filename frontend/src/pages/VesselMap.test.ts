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
