import { describe, expect, it } from 'vitest'
import { rowDataMode, shouldUseDemoRows } from './viewModels'

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
