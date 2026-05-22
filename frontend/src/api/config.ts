export function parseBooleanEnv(value: boolean | string | undefined): boolean {
  if (typeof value === 'boolean') return value
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export const ENABLE_DEMO_FALLBACK = parseBooleanEnv(import.meta.env.VITE_ENABLE_DEMO_FALLBACK)
