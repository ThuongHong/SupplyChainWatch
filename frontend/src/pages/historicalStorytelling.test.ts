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
    expect(source).toMatch(/Insight Feed/)
    expect(source).toMatch(/Correlation Heatmap/)
    expect(source).toMatch(/Forecast Reliability/)
    expect(source).toMatch(/Relationship Summary/)
    expect(source).toMatch(/Risk Context/)
    expect(source).toMatch(/Port Anomaly Severity/)
    expect(source).toMatch(/Risk Severity/)
    expect(source).toMatch(/Port Severity Mix/)
    expect(source).toMatch(/DeckGL/)
    expect(source).toMatch(/ScatterplotLayer/)
    expect(source).toMatch(/onSelectPort/)
    expect(source).toMatch(/co-movement, not causation/)
    expect(source).toMatch(/moving_average_baseline/)
    expect(source).toMatch(/allPortAnomaliesQuery/)
    expect(source).toMatch(/port_risk/)
    expect(source).toMatch(/risk_story/)
    expect(source).toMatch(/data_quality/)
    expect(insightRowSource).toMatch(/Port Risk/)
    expect(insightRowSource).toMatch(/Risk Story/)
    expect(insightRowSource).toMatch(/Data Quality/)
    expect(source).toMatch(/riskCoverageQuery/)
    expect(source).toMatch(/riskStoriesQuery/)
    expect(source).toMatch(/riskForecastQuery/)
    expect(source).toMatch(/metricBadgeValue/)
    expect(source).toMatch(/Relationship summary unavailable/)
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
