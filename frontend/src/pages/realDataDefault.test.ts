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
    expect(source).toMatch(/displayedRiskPorts = liveRiskPorts\.length \? liveRiskPorts : useDemoRiskPorts \? demoDashboardRiskRows\(\) : \[\]/)
    expect(source).toMatch(/No live ranked PortWatch risk row is available yet/)
  })

  it('keeps Ports demo rows behind explicit demo mode', () => {
    const source = readPage('Ports.tsx')
    expect(source).toMatch(/ENABLE_DEMO_FALLBACK/)
    expect(source).toMatch(/const ports = usingDemo \? demoPorts\(\) : livePorts/)
    expect(source).toMatch(/No live port rows/)
    expect(source).toMatch(/if \(!demo\) return \[\]/)
  })

  it('keeps Exploratory Analysis feed examples behind explicit demo mode', () => {
    const source = readPage('Analytics.tsx')
    expect(source).toMatch(/ENABLE_DEMO_FALLBACK/)
    expect(source).toMatch(/No real PortWatch time series data available/)
    expect(source).toMatch(/No PortWatch port anomalies detected/)
    expect(source).toMatch(/Port Anomaly Detection Log/)
    expect(source).toMatch(/AIS vessel anomalies are excluded/)
    expect(source).not.toMatch(/AI Risk Workbench/)
  })

  it('removes the AI Risk Workbench route from primary navigation', () => {
    const sidebar = readComponent('layout/Sidebar.tsx')
    const header = readComponent('layout/Header.tsx')

    expect(sidebar).toMatch(/Exploratory Analysis/)
    expect(header).toMatch(/Exploratory Analysis/)
    expect(sidebar).not.toMatch(/AI Risk Workbench/)
    expect(header).not.toMatch(/AI Risk Workbench/)
  })

  it('uses live freshness rows for sidebar status instead of hardcoded sync text', () => {
    const source = readComponent('layout/Sidebar.tsx')

    expect(source).toMatch(/apiClient\.dataFreshness/)
    expect(source).toMatch(/queryKeys\.dataFreshness/)
    expect(source).toMatch(/freshRows/)
    expect(source).not.toMatch(/synced 2m ago/)
  })

  it('polls force sync task status instead of blind timeout refresh', () => {
    const header = readComponent('layout/Header.tsx')
    const client = readFileSync(join(root, '..', 'api', 'client.ts'), 'utf8')

    expect(client).toMatch(/syncTaskStatus/)
    expect(header).toMatch(/apiClient\.syncTaskStatus/)
    expect(header).toMatch(/Queue failed/)
    expect(header).toMatch(/Worker still running/)
    expect(header).toMatch(/ACTIVE_SYNC_TASK_KEY/)
    expect(header).toMatch(/localStorage\.setItem\(ACTIVE_SYNC_TASK_KEY/)
    expect(header).toMatch(/localStorage\.getItem\(ACTIVE_SYNC_TASK_KEY/)
    expect(header).toMatch(/localStorage\.removeItem\(ACTIVE_SYNC_TASK_KEY/)
    expect(header).not.toMatch(/setTimeout\(\(\) => \{\s*queryClient\.invalidateQueries\(\)\s*setIsSyncing\(false\)/)
  })

  it('uses the GlobalSupplyWatch browser favicon instead of the Vite default', () => {
    const html = readFileSync(join(root, '..', '..', 'index.html'), 'utf8')
    const icon = readFileSync(join(root, '..', '..', 'public', 'favicon.svg'), 'utf8')

    expect(html).toMatch(/href="\/favicon\.svg"/)
    expect(html).not.toMatch(/vite\.svg/)
    expect(icon).toMatch(/GlobalSupplyWatch/)
  })
})
