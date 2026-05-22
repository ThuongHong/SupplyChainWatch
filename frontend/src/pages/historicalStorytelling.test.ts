import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const readPage = (name: string) => readFileSync(join(root, name), 'utf8')
const readApi = (name: string) => readFileSync(join(root, '..', 'api', name), 'utf8')

describe('historical storytelling uses real data only', () => {
  it('adds API clients for coverage, history, stories, and entity forecast', () => {
    const source = readApi('client.ts')

    expect(source).toMatch(/riskCoverage/)
    expect(source).toMatch(/riskEntityHistory/)
    expect(source).toMatch(/riskStories/)
    expect(source).toMatch(/riskEntityForecast/)
  })

  it('shows Dashboard story and forecast states without demo rows', () => {
    const source = readPage('Dashboard.tsx')

    expect(source).toMatch(/riskStoriesQuery/)
    expect(source).toMatch(/riskForecastQuery/)
    expect(source).toMatch(/No live risk story events/)
    expect(source).toMatch(/Forecast unavailable/)
    expect(source).not.toMatch(/demoStory/)
  })

  it('shows Ports detail history gaps without fabricated timeline values', () => {
    const source = readPage('Ports.tsx')

    expect(source).toMatch(/riskEntityHistory/)
    expect(source).toMatch(/riskCoverage/)
    expect(source).toMatch(/Insufficient history/)
    expect(source).toMatch(/No risk history rows/)
  })
})
