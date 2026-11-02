/**
 * SSRF policy for user-supplied MCP server URLs and headers. Pure functions (no
 * DNS, no Node APIs) so they run anywhere and are unit-testable; the DNS
 * re-check of resolved addresses lives in `lib/mcp-server.ts`.
 */

/** Upper bound of MCP servers connected for a single chat request. */
export const MAX_MCP_SERVERS_PER_REQUEST = 5

// ---------------------------------------------------------------------------
// IP classification
// ---------------------------------------------------------------------------

function parseIPv4(value: string): number[] | null {
  const parts = value.split('.')
  if (parts.length !== 4) return null
  const octets: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    octets.push(octet)
  }
  return octets
}

/** 8 hextets for an IPv6 literal (brackets allowed, zone ids rejected), or null. */
function parseIPv6(value: string): number[] | null {
  let text = value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value
  if (text.includes('%') || !text.includes(':')) return null

  // Trailing dotted IPv4 (e.g. ::ffff:127.0.0.1) becomes two hextets.
  const lastColon = text.lastIndexOf(':')
  const tail = text.slice(lastColon + 1)
  if (tail.includes('.')) {
    const v4 = parseIPv4(tail)
    if (!v4) return null
    const [a = 0, b = 0, c = 0, d = 0] = v4
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }

  const halves = text.split('::')
  if (halves.length > 2) return null
  const parseGroups = (part: string | undefined) => (part ? part.split(':') : [])
  const head = parseGroups(halves[0])
  const rest = parseGroups(halves[1])
  const groups =
    halves.length === 2
      ? [...head, ...Array<string>(Math.max(0, 8 - head.length - rest.length)).fill('0'), ...rest]
      : head
  if (groups.length !== 8) return null
  const hextets: number[] = []
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null
    hextets.push(Number.parseInt(group, 16))
  }
  return hextets
}

const inV4Range = (ip: number[], base: [number, number, number, number], bits: number) => {
  let remaining = bits
  for (let i = 0; i < 4 && remaining > 0; i++) {
    const take = Math.min(8, remaining)
    const mask = (0xff << (8 - take)) & 0xff
    if (((ip[i] ?? 0) & mask) !== ((base[i] ?? 0) & mask)) return false
    remaining -= take
  }
  return true
}

const BLOCKED_V4: Array<[[number, number, number, number], number]> = [
  [[0, 0, 0, 0], 8], // "this network"
  [[10, 0, 0, 0], 8], // private
  [[100, 64, 0, 0], 10], // CGNAT
  [[127, 0, 0, 0], 8], // loopback
  [[169, 254, 0, 0], 16], // link-local, incl. 169.254.169.254 cloud metadata
  [[172, 16, 0, 0], 12], // private
  [[192, 0, 0, 0], 24], // IETF protocol assignments
  [[192, 0, 2, 0], 24], // TEST-NET-1
  [[192, 88, 99, 0], 24], // 6to4 relay anycast
  [[192, 168, 0, 0], 16], // private
  [[198, 18, 0, 0], 15], // benchmarking
  [[198, 51, 100, 0], 24], // TEST-NET-2
  [[203, 0, 113, 0], 24], // TEST-NET-3
  [[224, 0, 0, 0], 4], // multicast
  [[240, 0, 0, 0], 4], // reserved + broadcast
]

function isBlockedIPv4(octets: number[]): boolean {
  return BLOCKED_V4.some(([base, bits]) => inV4Range(octets, base, bits))
}

const embeddedV4 = (h: number[], hiIndex: number) => {
  const hi = h[hiIndex] ?? 0
  const lo = h[hiIndex + 1] ?? 0
  return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff]
}

function isBlockedIPv6(h: number[]): boolean {
  const [h0 = 0, h1 = 0, h2 = 0, h3 = 0, h4 = 0, h5 = 0, h6 = 0] = h
  const first4Zero = h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0
  // ::, ::1 and the deprecated IPv4-compatible ::a.b.c.d
  if (first4Zero && h4 === 0 && h5 === 0) return h6 === 0 || isBlockedIPv4(embeddedV4(h, 6))
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-translated ::ffff:0:a.b.c.d
  if (first4Zero && ((h4 === 0 && h5 === 0xffff) || (h4 === 0xffff && h5 === 0))) {
    return isBlockedIPv4(embeddedV4(h, 6))
  }
  // NAT64 64:ff9b::/96 embeds an IPv4 address; 64:ff9b:1::/48 is local-use.
  if (h0 === 0x64 && h1 === 0xff9b) return h2 === 1 || isBlockedIPv4(embeddedV4(h, 6))
  if (h0 === 0x2002) return isBlockedIPv4(embeddedV4(h, 1)) // 6to4
  if (h0 === 0x2001 && h1 === 0) return true // Teredo (embeds an obfuscated IPv4)
  if (h0 === 0x2001 && h1 === 0xdb8) return true // documentation
  if (h0 === 0x100 && h1 === 0 && h2 === 0 && h3 === 0) return true // discard-only
  if ((h0 & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local (incl. fd00::/8)
  if ((h0 & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((h0 & 0xffc0) === 0xfec0) return true // fec0::/10 site-local (deprecated)
  if ((h0 & 0xff00) === 0xff00) return true // multicast
  return false
}

/** True for an IP literal (v4 or v6) that is not a public unicast address. */
export function isBlockedIpAddress(address: string): boolean {
  const v4 = parseIPv4(address)
  if (v4) return isBlockedIPv4(v4)
  const v6 = parseIPv6(address)
  if (v6) return isBlockedIPv6(v6)
  return false
}

export function isIpLiteral(host: string): boolean {
  return parseIPv4(host) !== null || parseIPv6(host) !== null
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'metadata.azure.internal',
  'instance-data',
  'instance-data.ec2.internal',
  'kubernetes.default',
  'kubernetes.default.svc',
])

const BLOCKED_SUFFIXES = [
  '.localhost',
  '.local',
  '.localdomain',
  '.internal',
  '.intranet',
  '.lan',
  '.home.arpa',
  '.svc',
  '.cluster.local',
]

const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export type MCPUrlCheck = { ok: true; url: URL } | { ok: false; reason: string }

export interface MCPUrlPolicyOptions {
  /** Permit http://localhost / 127.0.0.1 / [::1] (local development only). */
  allowLocalhost?: boolean
}

/**
 * Accepts only https URLs to public hostnames or public IP literals. Rejects
 * credentials in the URL, private/loopback/link-local/CGNAT/metadata addresses in
 * any encoding the WHATWG URL parser normalises (decimal, hex, octal, IPv4-mapped
 * IPv6, ...), internal TLDs and single-label hostnames.
 */
export function checkMCPServerUrl(raw: string, options: MCPUrlPolicyOptions = {}): MCPUrlCheck {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'invalid URL' }
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')

  if (options.allowLocalhost && LOCAL_DEV_HOSTS.has(hostname)) {
    if (url.protocol === 'http:' || url.protocol === 'https:') return { ok: true, url }
  }

  if (url.protocol !== 'https:') return { ok: false, reason: 'only https URLs are allowed' }
  if (url.username || url.password) return { ok: false, reason: 'credentials in URL' }
  if (!hostname) return { ok: false, reason: 'missing host' }

  if (isIpLiteral(hostname)) {
    return isBlockedIpAddress(hostname)
      ? { ok: false, reason: 'private or reserved address' }
      : { ok: true, url }
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    BLOCKED_SUFFIXES.some(suffix => hostname.endsWith(suffix)) ||
    !hostname.includes('.')
  ) {
    return { ok: false, reason: 'internal hostname' }
  }

  return { ok: true, url }
}

// ---------------------------------------------------------------------------
// Header filtering
// ---------------------------------------------------------------------------

const DROPPED_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-connection',
  'proxy-authorization',
  'proxy-authenticate',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'expect',
  'cookie',
  'forwarded',
  'via',
  'x-real-ip',
])

const DROPPED_PREFIXES = ['x-forwarded-', 'cf-', 'x-vercel-', 'x-middleware-', 'sec-']

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9a-z-]{1,64}$/i
const MAX_HEADERS = 20
const MAX_HEADER_VALUE = 4096

/**
 * User-supplied headers minus hop-by-hop, routing/identity and cookie headers,
 * invalid names and CR/LF-carrying values.
 */
export function sanitizeMCPHeaders(
  headers: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!headers) return undefined
  const safe: Record<string, string> = {}
  let count = 0
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase()
    if (!HEADER_NAME.test(name)) continue
    if (DROPPED_HEADERS.has(lower) || DROPPED_PREFIXES.some(prefix => lower.startsWith(prefix))) {
      continue
    }
    if (/[\r\n\0]/.test(value) || value.length > MAX_HEADER_VALUE) continue
    safe[name] = value
    if (++count >= MAX_HEADERS) break
  }
  return Object.keys(safe).length > 0 ? safe : undefined
}
