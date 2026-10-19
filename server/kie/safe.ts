import { KieApiError } from './client.ts'

/** Reject non-https and private/loopback hosts (SSRF guard). */
export function assertSafeHttpsUrl(raw: string, label = 'url'): URL {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new KieApiError(`Invalid ${label}`, 400)
  }

  if (parsed.protocol !== 'https:') {
    throw new KieApiError(`${label} must use https`, 400)
  }

  const host = parsed.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) {
    throw new KieApiError(`${label} must not target localhost`, 400)
  }

  // IPv4 private / link-local / CGNAT
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number)
    const [a, b] = parts
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      throw new KieApiError(`${label} must not target a private IP`, 400)
    }
  }

  // IPv6 unique local / link-local (simplified)
  if (host.startsWith('[') || host.includes(':')) {
    const h = host.replace(/^\[|\]$/g, '')
    if (
      h.startsWith('fc') ||
      h.startsWith('fd') ||
      h.startsWith('fe80') ||
      h === '::1'
    ) {
      throw new KieApiError(`${label} must not target a private IP`, 400)
    }
  }

  return parsed
}

const SAFE_PATH_RE = /^[a-zA-Z0-9._-]{1,128}$/

export function sanitizeUploadPath(raw: string | undefined): string {
  const value = (raw || 'kie-studio').trim()
  if (!SAFE_PATH_RE.test(value)) {
    throw new KieApiError(
      'uploadPath must be 1–128 chars of [a-zA-Z0-9._-]',
      400,
    )
  }
  return value
}

export function sanitizeFileName(raw: string | undefined, fallback: string): string {
  const base = (raw || fallback).trim().slice(0, 200)
  const cleaned = base.replace(/[^\w.\-()+ ]+/g, '_').replace(/\.\./g, '_')
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw new KieApiError('Invalid fileName', 400)
  }
  return cleaned
}

export function assertPlainObject(
  value: unknown,
  label = 'input',
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new KieApiError(`${label} must be a plain object`, 400)
  }
}
