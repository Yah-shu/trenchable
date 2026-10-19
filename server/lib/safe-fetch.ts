/**
 * Fetching a URL without ever reaching a private host: the host name is resolved first and loopback, private,
 * link-local (cloud metadata), CGNAT, multicast and other special addresses are refused, and redirects are
 * followed by hand (at most 5), checking every hop the same way. Shared by the reference-page reader
 * (site/fetch-safe.ts) and the Studio's library (studio/library.ts: elements and uploads from a link).
 * Known limit: fetch() resolves the name again, so a DNS answer that changes between the check and the request
 * (rebinding) is not caught; acceptable for a local tool.
 */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const MAX_HOPS = 5
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const REDIRECT = new Set([301, 302, 303, 307, 308])

/** How names are resolved and requests sent (swapped in tests). */
export interface SafeDeps {
  resolve: (host: string) => Promise<string[]>
  fetch: (url: string, init: RequestInit) => Promise<Response>
}

export const DEFAULT_DEPS: SafeDeps = {
  resolve: async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address),
  fetch: (url, init) => fetch(url, init),
}

/** A reference URL (or a hop it redirects to) that points at a non-public host. */
export class UnsafeUrl extends Error {}

function privateV4([a, b, c]: number[]): boolean {
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 || // this network, private, loopback, multicast/reserved/broadcast
    (a === 100 && b >= 64 && b <= 127) || // CGNAT (also Alibaba's metadata 100.100.100.200)
    (a === 169 && b === 254) || // link-local (cloud metadata 169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF protocol assignments, TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // 6to4 relay anycast
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) // TEST-NET-3
  )
}

/** The eight 16-bit words of an IPv6 address (an embedded dotted IPv4 tail allowed), or null. */
function v6Words(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0]
  const tail = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s)
  if (tail) {
    const q = tail.slice(2).map(Number)
    if (q.some((n) => n > 255)) return null
    s = `${tail[1]}${((q[0] << 8) | q[1]).toString(16)}:${((q[2] << 8) | q[3]).toString(16)}`
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0
  if (fill < 0) return null
  const parts = [...head, ...Array<string>(fill).fill('0'), ...rest]
  if (parts.length !== 8 || parts.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null
  return parts.map((h) => parseInt(h, 16))
}

const v4Of = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255]

function privateV6(w: number[]): boolean {
  const zero = (from: number, to: number) => w.slice(from, to).every((x) => x === 0)
  if (zero(0, 8)) return true // ::
  if (zero(0, 7) && w[7] === 1) return true // ::1
  if (zero(0, 5) && w[5] === 0xffff) return privateV4(v4Of(w[6], w[7])) // ::ffff:a.b.c.d
  if (zero(0, 6)) return privateV4(v4Of(w[6], w[7])) // ::a.b.c.d (IPv4-compatible)
  if (w[0] === 0x64 && w[1] === 0xff9b && zero(2, 6)) return privateV4(v4Of(w[6], w[7])) // NAT64
  if (w[0] === 0x64 && w[1] === 0xff9b && w[2] === 1) return true // local-use NAT64
  if (w[0] === 0x2002) return privateV4(v4Of(w[1], w[2])) // 6to4
  if (w[0] === 0x2001 && w[1] === 0) return true // Teredo (hides an IPv4 address)
  if (w[0] === 0x2001 && w[1] === 0xdb8) return true // documentation
  if (w[0] === 0x100 && zero(1, 4)) return true // discard-only
  if ((w[0] & 0xfe00) === 0xfc00) return true // unique local (fd00:ec2::254 metadata)
  if ((w[0] & 0xffc0) === 0xfe80 || (w[0] & 0xffc0) === 0xfec0) return true // link-local, site-local
  if ((w[0] & 0xff00) === 0xff00) return true // multicast
  return false
}

/** True for any address that isn't a public unicast one (anything that isn't an IP counts as not public). */
export function isPrivateAddress(ip: string): boolean {
  const host = ip.replace(/^\[|\]$/g, '')
  const v = isIP(host)
  if (v === 4) return privateV4(host.split('.').map(Number))
  if (v === 6) {
    const w = v6Words(host)
    return !w || privateV6(w)
  }
  return true
}

const LOCAL_NAME = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|home\.arpa)$/

/**
 * Refuse a URL whose host isn't public: http(s) only, no local names, and every address the name resolves to
 * must be a public one. IP literals are checked as they are.
 */
export async function checkHost(u: URL, deps: Pick<SafeDeps, 'resolve'> = DEFAULT_DEPS): Promise<void> {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new UnsafeUrl('Reference URL must be http(s)')
  if (u.username || u.password) throw new UnsafeUrl('Reference URL must not contain a user name or password')
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '')
  if (!host || LOCAL_NAME.test(host) || (!host.includes('.') && !isIP(host))) throw new UnsafeUrl(`Reference URL must be a public site (${host || 'no host'})`)
  let addrs: string[]
  if (isIP(host)) addrs = [host]
  else {
    try {
      addrs = await deps.resolve(host)
    } catch (e) {
      throw new UnsafeUrl(`${host} could not be resolved (${(e as Error).message})`)
    }
  }
  if (!addrs.length) throw new UnsafeUrl(`${host} could not be resolved`)
  const bad = addrs.find(isPrivateAddress)
  if (bad) throw new UnsafeUrl(`Reference URL must be a public site (${host} is ${bad})`)
}

/**
 * GET with every hop checked (checkHost) and redirects followed by hand. Null when the answer isn't usable
 * (HTTP error, too big, too many redirects, network error); throws UnsafeUrl when a hop is not public.
 */
export async function safeGet(raw: string, limit: number, deps: SafeDeps = DEFAULT_DEPS): Promise<{ bytes: Buffer; type: string; url: string } | null> {
  let url = raw
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const u = new URL(url)
    await checkHost(u, deps)
    let res: Response
    try {
      res = await deps.fetch(u.toString(), { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'manual', signal: AbortSignal.timeout(25_000) })
    } catch {
      return null
    }
    if (REDIRECT.has(res.status)) {
      const loc = res.headers.get('location')
      await res.body?.cancel().catch(() => undefined)
      if (!loc) return null
      try {
        url = new URL(loc, u).toString()
      } catch {
        return null
      }
      continue
    }
    try {
      if (!res.ok) return null
      const len = Number(res.headers.get('content-length') ?? 0)
      if (len > limit) return null
      const bytes = Buffer.from(await res.arrayBuffer())
      return bytes.length > limit ? null : { bytes, type: res.headers.get('content-type') ?? '', url: u.toString() }
    } catch {
      return null
    }
  }
  return null
}
