import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const readPage = (name: string) => readFileSync(join(root, name), 'utf8')
const readComponent = (name: string) => readFileSync(join(root, '..', 'components', name), 'utf8')

describe('real data default page behavior', () => {
  it('keeps Dashboard demo port risk and insights behind explicit demo mode', () => {
    const source = readPage('Dashboard.tsx')
    expect(source).toMatch(/ENABLE_DEMO_FALLBACK/)
    expect(source).toMatch(/displayedPortRiskRows = portRiskRows\.length \? portRiskRows : useDemoPortRisk \? demoPortRiskRows\(\) : \[\]/)
    expect(source).toMatch(/insights: FeedInsight\[\] = liveInsights\.length > 0 \? liveInsights : useDemoInsights \? MOCK\.insights/)
    expect(source).toMatch(/No PortWatch risk score rows/)
    expect(source).toMatch(/No live insights/)
  })

  it('keeps Ports demo rows behind explicit demo mode', () => {
    const source = readPage('Ports.tsx')
    expect(source).toMatch(/ENABLE_DEMO_FALLBACK/)
    expect(source).toMatch(/const ports = usingDemo \? demoPorts\(\) : livePorts/)
    expect(source).toMatch(/No live port rows/)
    expect(source).toMatch(/if \(!demo\) return \[\]/)
  })

  it('keeps Insights Hub feed and visual examples behind explicit demo mode', () => {
    const source = readPage('InsightsHub.tsx')
    expect(source).toMatch(/ENABLE_DEMO_FALLBACK/)
    expect(source).toMatch(/const feed = usingDemoFeed \? DEMO_INSIGHTS : liveFeed/)
    expect(source).toMatch(/demo=\{useDemoCorrelations\}/)
    expect(source).toMatch(/demo=\{useDemoAnomalies\}/)
    expect(source).toMatch(/No live anomaly rows/)
  })

  it('uses live freshness rows for sidebar status instead of hardcoded sync text', () => {
    const source = readComponent('layout/Sidebar.tsx')

    expect(source).toMatch(/apiClient\.dataFreshness/)
    expect(source).toMatch(/queryKeys\.dataFreshness/)
    expect(source).toMatch(/freshRows/)
    expect(source).not.toMatch(/synced 2m ago/)
  })
})
