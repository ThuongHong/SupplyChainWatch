import { describe, expect, it } from 'vitest'
import { latestOperationalPortAnomalyById, latestPortAnomalyById, rowDataMode, shouldUseDemoRows } from './viewModels'

describe('latestPortAnomalyById', () => {
  it('uses the newest anomaly row for each port instead of any older high severity row', () => {
    const byPort = latestPortAnomalyById([
      { port_id: 1, severity: 'high', detected_at: '2026-05-20T00:00:00Z' },
      { port_id: 1, severity: 'low', detected_at: '2026-05-21T00:00:00Z' },
      { port_id: 2, severity: 'medium', time: '2026-05-22T00:00:00Z' },
    ])

    expect(byPort.get(1)?.severity).toBe('low')
    expect(byPort.get(2)?.severity).toBe('medium')
  })
})

describe('latestOperationalPortAnomalyById', () => {
  it('ignores trade-flow anomalies when coloring Vessel Map port markers', () => {
    const byPort = latestOperationalPortAnomalyById([
      { entity_type: 'port', port_id: 32, severity: 'high', metric: 'import', detected_at: '2026-05-15T00:00:00Z' },
      { entity_type: 'port', port_id: 32, severity: 'low', metric: 'portcalls', detected_at: '2026-05-14T00:00:00Z' },
      { entity_type: 'port', port_id: 1, severity: 'medium', metric: 'portcalls', detected_at: '2026-05-15T00:00:00Z' },
    ])

    expect(byPort.has(32)).toBe(false)
    expect(byPort.get(1)?.severity).toBe('medium')
  })
})

describe('frontend row data state', () => {
  it('renders empty state for empty normal-mode API rows', () => {
    expect(rowDataMode({ rowCount: 0, demoEnabled: false })).toBe('empty')
    expect(shouldUseDemoRows({ rowCount: 0, demoEnabled: false })).toBe(false)
  })

  it('uses demo rows only when explicit demo mode is enabled', () => {
    expect(rowDataMode({ rowCount: 0, demoEnabled: true })).toBe('demo')
    expect(shouldUseDemoRows({ rowCount: 0, demoEnabled: true })).toBe(true)
  })

  it('preserves live, stale, disabled, loading, and error states', () => {
    expect(rowDataMode({ rowCount: 2 })).toBe('live')
    expect(rowDataMode({ rowCount: 2, stale: true })).toBe('stale')
    expect(rowDataMode({ rowCount: 0, disabled: true, demoEnabled: true })).toBe('disabled')
    expect(rowDataMode({ rowCount: 0, loading: true, demoEnabled: true })).toBe('loading')
    expect(rowDataMode({ rowCount: 0, error: new Error('offline'), demoEnabled: false })).toBe('error')
  })
})
