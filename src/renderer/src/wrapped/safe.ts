export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null
  const v = value[key]
  return isRecord(v) ? v : null
}

export function getArray(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) return []
  const v = value[key]
  return Array.isArray(v) ? v : []
}

export function getString(value: unknown, key: string, fallback = ''): string {
  if (!isRecord(value)) return fallback
  const v = value[key]
  return typeof v === 'string' ? v : fallback
}

export function getNumber(value: unknown, key: string, fallback = 0): number {
  if (!isRecord(value)) return fallback
  const v = value[key]
  return typeof v === 'number' && !Number.isNaN(v) ? v : fallback
}

export function getBoolean(value: unknown, key: string, fallback = false): boolean {
  if (!isRecord(value)) return fallback
  const v = value[key]
  return typeof v === 'boolean' ? v : fallback
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && !Number.isNaN(value) ? value : fallback
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}
