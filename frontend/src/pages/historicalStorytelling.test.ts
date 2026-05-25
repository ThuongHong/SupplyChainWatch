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

    expect(source).toMatch(/Executive Brief/)
    expect(source).toMatch(/forecastDirection/)
    expect(source).toMatch(/Dashboard live synthesis/)
    expect(source).not.toMatch(/demoStory/)
  })

  it('removes hardcoded AI Story Mode from analysis pages', () => {
    const dashboard = readPage('Dashboard.tsx')
    const insightsHub = readPage('InsightsHub.tsx')

    for (const source of [dashboard, insightsHub]) {
      expect(source).not.toMatch(/STORY_PAIRS/)
      expect(source).not.toMatch(/storyAnalyze/)
      expect(source).not.toMatch(/Shanghai × FBX/)
      expect(source).not.toMatch(/Suez × WCI/)
      expect(source).not.toMatch(/AI Story Mode/)
    }
  })

  it('keeps Global Intelligence labels on PortWatch risk snapshots instead of AIS congestion', () => {
    const source = readPage('Dashboard.tsx')

    expect(source).toMatch(/PortWatch risk/)
    expect(source).toMatch(/risk snapshots/)
    expect(source).not.toMatch(/Port Congestion Intelligence/)
    expect(source).not.toMatch(/Top Port Congestion/)
    expect(source).not.toMatch(/High-pressure ports/)
    expect(source).not.toMatch(/No live AIS telemetry/)
  })

  it('shows Ports detail history gaps without fabricated timeline values', () => {
    const source = readPage('Ports.tsx')

    expect(source).toMatch(/riskEntityHistory/)
    expect(source).toMatch(/riskCoverage/)
    expect(source).toMatch(/riskStoriesQuery/)
    expect(source).toMatch(/riskForecastQuery/)
    expect(source).toMatch(/Story Events/)
    expect(source).toMatch(/Forecast Readiness/)
    expect(source).toMatch(/Insufficient history/)
    expect(source).toMatch(/No risk history rows/)
  })

  it('shows Exploratory Analysis interpretation widgets from real backend rows', () => {
    const source = readPage('Analytics.tsx')
    const insightRowSource = readFileSync(join(root, '..', 'components', 'InsightRow.tsx'), 'utf8')

    expect(source).toMatch(/Exploratory Analysis/)
    expect(source).toMatch(/Port Activity Time Series/)
    expect(source).toMatch(/Port Anomaly Detection Log/)
    expect(source).toMatch(/Top Ports Comparison/)
    expect(source).toMatch(/Port Activity Distribution/)
    expect(source).toMatch(/Port Anomaly Severity/)
    expect(source).toMatch(/Port Severity Mix/)
    expect(source).toMatch(/DeckGL/)
    expect(source).toMatch(/ScatterplotLayer/)
    expect(source).toMatch(/onSelectPort/)
    expect(source).toMatch(/allPortAnomaliesQuery/)
    expect(insightRowSource).toMatch(/Traffic Anomaly/)
    expect(insightRowSource).toMatch(/Risk Story/)
    expect(insightRowSource).toMatch(/Data Quality/)
    expect(source).not.toMatch(/demoRiskStory/)
  })

  it('shows Macro Indices market story from live histories correlations and forecasts', () => {
    const source = readPage('MacroIndices.tsx')

    expect(source).toMatch(/Market Story/)
    expect(source).toMatch(/strongestCorrelation/)
    expect(source).toMatch(/correlationsQuery/)
    expect(source).toMatch(/Top move/)
    expect(source).toMatch(/Forward read/)
  })
})
