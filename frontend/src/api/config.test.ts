import { describe, expect, it } from 'vitest'
import { parseBooleanEnv } from './config'

describe('frontend demo fallback config', () => {
  it('defaults demo fallback to disabled', () => {
    expect(parseBooleanEnv(undefined)).toBe(false)
    expect(parseBooleanEnv('')).toBe(false)
    expect(parseBooleanEnv('false')).toBe(false)
  })

  it('enables demo fallback only for explicit truthy values', () => {
    expect(parseBooleanEnv('true')).toBe(true)
    expect(parseBooleanEnv('1')).toBe(true)
    expect(parseBooleanEnv('yes')).toBe(true)
    expect(parseBooleanEnv('on')).toBe(true)
  })
})
