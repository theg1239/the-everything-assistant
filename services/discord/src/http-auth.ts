// Shared-secret auth for the bot's /api/* routes. Callers send `Authorization: Bearer <secret>`.
// Uses structural request/response types (not express's) so it stays dependency-free and testable.
import { createHash, timingSafeEqual } from 'node:crypto'

type Env = Readonly<Record<string, string | undefined>>

export type ApiAuthConfig = { mode: 'secret'; secret: string } | { mode: 'insecure-dev' }

const sha256 = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest()

/** Constant-time comparison; hashing first gives equal-length buffers whatever the input lengths. */
export const secretsMatch = (expected: string, provided: string | null): boolean => {
  if (!expected || !provided) return false
  return timingSafeEqual(sha256(expected), sha256(provided))
}

export const extractBearerToken = (headerValue: string | undefined): string | null => {
  const match = /^Bearer\s+(.+)$/iu.exec(headerValue?.trim() ?? '')
  return match?.[1]?.trim() || null
}

/**
 * Fails closed: without the secret the service refuses to start. `<insecureVar>=1` opts out, and
 * only when NODE_ENV is not production.
 */
export const resolveApiAuthConfig = (
  env: Env,
  options: { secretVar: string; insecureVar: string; serviceName: string }
): ApiAuthConfig => {
  const { secretVar, insecureVar, serviceName } = options
  const secret = env[secretVar]?.trim() ?? ''
  if (secret) return { mode: 'secret', secret }
  if (env[insecureVar] === '1' && env.NODE_ENV !== 'production') {
    return { mode: 'insecure-dev' }
  }
  throw new Error(
    `${secretVar} is not set. Refusing to start ${serviceName}: its /api/* routes would be open to ` +
      `anyone who can reach the port. Set ${secretVar} (e.g. \`openssl rand -hex 32\`) and send it as ` +
      `\`Authorization: Bearer <secret>\`, or for local development only set ${insecureVar}=1 ` +
      'with NODE_ENV != production.'
  )
}

type AuthRequest = { get(name: string): string | undefined }
type AuthResponse = {
  setHeader(name: string, value: string): unknown
  status(code: number): { json(body: unknown): unknown }
}

export const createApiAuthMiddleware =
  (config: ApiAuthConfig) =>
  (req: AuthRequest, res: AuthResponse, next: () => void): void => {
    if (config.mode === 'insecure-dev') return next()
    if (secretsMatch(config.secret, extractBearerToken(req.get('authorization')))) return next()
    res.setHeader('WWW-Authenticate', 'Bearer')
    res.status(401).json({ error: 'Unauthorized' })
  }

/** Loopback unless HOST is configured (e.g. HOST=0.0.0.0 inside a container). */
export const resolveBindHost = (env: Env): string => env.HOST?.trim() || '127.0.0.1'
