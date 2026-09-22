//! Runtime shape validation for trust-boundary responses.
//!
//! `graphResponse.ts` established the pattern: validate the load-bearing
//! fields of a network/desktop response once at the boundary, so a malformed
//! payload fails loudly ("response was malformed") instead of surfacing as
//! `undefined.x` crashes deep in the render tree. These helpers keep that
//! cheap for the remaining surfaces: check the envelope plus the fields the
//! render path branches on, and pass the rest through typed.

export class ResponseShapeError extends Error {
  constructor(label: string, detail: string) {
    super(`${label} response was malformed: ${detail}`)
  }
}

export function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ResponseShapeError(label, 'expected an object')
  }
  return value as Record<string, unknown>
}

export function assertArray(value: unknown, label: string, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ResponseShapeError(label, `${field} must be an array`)
  }
  if (value.length > 10_000) {
    throw new ResponseShapeError(label, `${field} exceeded the bounded length`)
  }
  return value
}

export function requireString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new ResponseShapeError(label, `${key} must be a non-empty string`)
  }
  return value
}

export function optionalString(
  record: Record<string, unknown>,
  key: string,
  label: string
): string | null {
  const value = record[key]
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') {
    throw new ResponseShapeError(label, `${key} must be a string when present`)
  }
  return value
}

export function requireNumber(record: Record<string, unknown>, key: string, label: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ResponseShapeError(label, `${key} must be a finite number`)
  }
  return value
}

export function optionalNumber(
  record: Record<string, unknown>,
  key: string,
  label: string
): number | null {
  const value = record[key]
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ResponseShapeError(label, `${key} must be a finite number when present`)
  }
  return value
}

export function requireBoolean(
  record: Record<string, unknown>,
  key: string,
  label: string
): boolean {
  const value = record[key]
  if (typeof value !== 'boolean') {
    throw new ResponseShapeError(label, `${key} must be a boolean`)
  }
  return value
}

export function requireLiteral<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  label: string
): T {
  const value = record[key]
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ResponseShapeError(label, `${key} must be one of: ${allowed.join(', ')}`)
  }
  return value as T
}
