/**
 * AES-256-GCM encryption of stored VTOP passwords, via WebCrypto only (`globalThis.crypto.subtle`)
 * so it runs unchanged on Node (Vercel) and Cloudflare Workers.
 *
 * Keys: `VTOP_CREDENTIALS_KEY` (current, 32 random bytes, base64 -- `openssl rand -base64 32`)
 * and optionally `VTOP_CREDENTIALS_KEY_PREVIOUS` (the key being rotated out). A row's
 * `keyVersion` is a fingerprint of the key that encrypted it, so rotation needs no extra
 * counter env var and a mis-set key is detected instead of silently failing GCM.
 *
 * AAD = `vtop:v1:${userId}:${username}`, so a ciphertext copied onto another user's row (or
 * relabelled with another username) fails authentication.
 */

const KEY_BYTES = 32
const IV_BYTES = 12
const AAD_PREFIX = 'vtop:v1'
const KEY_ID_DOMAIN = 'vtop-credentials-key-id:v1:'
const DEV_KEY_DOMAIN = 'the-everything-assistant:vtop-credentials:dev-key:v1:'

/** Server misconfiguration (missing or malformed key). Never carries secret material. */
export class VTOPCredentialsConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VTOPCredentialsConfigError'
  }
}

/** The stored ciphertext could not be decrypted (tampered, moved, or unknown key). */
export class VTOPCredentialDecryptError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VTOPCredentialDecryptError'
  }
}

export interface VTOPKey {
  /** Fingerprint of the raw key; stored as the row's `keyVersion`. Positive 31-bit int. */
  version: number
  key: CryptoKey
}

export interface VTOPKeyring {
  current: VTOPKey
  previous: VTOPKey | null
}

export interface EncryptedVTOPPassword {
  ciphertext: string
  iv: string
  keyVersion: number
}

const subtle = () => globalThis.crypto.subtle
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Strict standard-alphabet base64 decode; throws on anything else. */
export function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new TypeError('invalid base64')
  }
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function vtopCredentialAad(userId: string, username: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(`${AAD_PREFIX}:${userId}:${username}`)
}

async function keyFingerprint(raw: Uint8Array<ArrayBuffer>): Promise<number> {
  const domain = encoder.encode(KEY_ID_DOMAIN)
  const input = new Uint8Array(domain.length + raw.length)
  input.set(domain)
  input.set(raw, domain.length)
  const digest = new DataView(await subtle().digest('SHA-256', input))
  input.fill(0)
  // Positive, non-zero 31-bit int: fits Prisma `Int` (INT4) on every provider.
  return digest.getUint32(0) & 0x7fffffff || 1
}

/** Imports 32 raw key bytes and wipes the input buffer. */
export async function importVTOPKey(raw: Uint8Array<ArrayBuffer>): Promise<VTOPKey> {
  try {
    if (raw.length !== KEY_BYTES) {
      throw new VTOPCredentialsConfigError(`VTOP credentials key must be ${KEY_BYTES} bytes`)
    }
    const version = await keyFingerprint(raw)
    const key = await subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt',
    ])
    return { version, key }
  } finally {
    raw.fill(0)
  }
}

function decodeEnvKey(value: string, name: string): Uint8Array<ArrayBuffer> {
  let raw: Uint8Array<ArrayBuffer>
  try {
    raw = base64ToBytes(value.trim())
  } catch {
    throw new VTOPCredentialsConfigError(
      `${name} is not valid base64; generate one with \`openssl rand -base64 32\``
    )
  }
  if (raw.length !== KEY_BYTES) {
    raw.fill(0)
    throw new VTOPCredentialsConfigError(
      `${name} must decode to ${KEY_BYTES} bytes (got ${raw.length}); generate one with \`openssl rand -base64 32\``
    )
  }
  return raw
}

/** Builds a keyring from base64 key strings (as found in the env). */
export async function createVTOPKeyring(keys: {
  current: string
  previous?: string | undefined
}): Promise<VTOPKeyring> {
  const current = await importVTOPKey(decodeEnvKey(keys.current, 'VTOP_CREDENTIALS_KEY'))
  const previousValue = keys.previous?.trim()
  const previous = previousValue
    ? await importVTOPKey(decodeEnvKey(previousValue, 'VTOP_CREDENTIALS_KEY_PREVIOUS'))
    : null
  return { current, previous: previous && previous.version !== current.version ? previous : null }
}

async function deriveDevKey(seed: string): Promise<VTOPKey> {
  const digest = await subtle().digest('SHA-256', encoder.encode(`${DEV_KEY_DOMAIN}${seed}`))
  return importVTOPKey(new Uint8Array(digest))
}

export interface VTOPKeyEnv {
  VTOP_CREDENTIALS_KEY?: string | undefined
  VTOP_CREDENTIALS_KEY_PREVIOUS?: string | undefined
  NEXTAUTH_SECRET?: string | undefined
  NODE_ENV?: string | undefined
}

/**
 * Keyring from `VTOP_CREDENTIALS_KEY` / `VTOP_CREDENTIALS_KEY_PREVIOUS`.
 *
 * Production without a key fails closed with {@link VTOPCredentialsConfigError}. Outside
 * production a deterministic dev key (derived from `NEXTAUTH_SECRET`) is used with a loud
 * warning, so local dev works without setup and keeps its rows decryptable across restarts.
 */
export async function loadVTOPKeyringFromEnv(env: VTOPKeyEnv): Promise<VTOPKeyring> {
  const current = env.VTOP_CREDENTIALS_KEY?.trim()
  if (current) {
    return createVTOPKeyring({ current, previous: env.VTOP_CREDENTIALS_KEY_PREVIOUS })
  }
  if (env.NODE_ENV === 'production') {
    throw new VTOPCredentialsConfigError(
      'VTOP_CREDENTIALS_KEY is not set: refusing to store or read VTOP credentials. ' +
        'Generate one with `openssl rand -base64 32` and add it to the deployment environment.'
    )
  }
  console.warn(
    '\n[vtop-credentials] WARNING: VTOP_CREDENTIALS_KEY is not set. Using an INSECURE derived ' +
      'development key. Never run like this in production; set VTOP_CREDENTIALS_KEY ' +
      '(`openssl rand -base64 32`).\n'
  )
  return { current: await deriveDevKey(env.NEXTAUTH_SECRET ?? ''), previous: null }
}

let cachedKeyring: { signature: string; keyring: Promise<VTOPKeyring> } | null = null

/** {@link loadVTOPKeyringFromEnv} on `process.env`, memoised per process until the env changes. */
export function getVTOPKeyring(): Promise<VTOPKeyring> {
  const env: VTOPKeyEnv = {
    VTOP_CREDENTIALS_KEY: process.env.VTOP_CREDENTIALS_KEY,
    VTOP_CREDENTIALS_KEY_PREVIOUS: process.env.VTOP_CREDENTIALS_KEY_PREVIOUS,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  }
  const signature = [
    env.VTOP_CREDENTIALS_KEY,
    env.VTOP_CREDENTIALS_KEY_PREVIOUS,
    env.NEXTAUTH_SECRET,
    env.NODE_ENV,
  ].join('\u0000')
  if (cachedKeyring?.signature !== signature) {
    const keyring = loadVTOPKeyringFromEnv(env)
    // A failed load (misconfiguration) is retried on the next call rather than cached.
    keyring.catch(() => {
      if (cachedKeyring?.keyring === keyring) cachedKeyring = null
    })
    cachedKeyring = { signature, keyring }
  }
  return cachedKeyring.keyring
}

export function keyForVersion(keyring: VTOPKeyring, version: number): CryptoKey | null {
  if (keyring.current.version === version) return keyring.current.key
  if (keyring.previous?.version === version) return keyring.previous.key
  return null
}

/** Encrypts with the current key. The UTF-8 plaintext buffer is wiped afterwards. */
export async function encryptVTOPPassword(
  keyring: VTOPKeyring,
  { userId, username, password }: { userId: string; username: string; password: string }
): Promise<EncryptedVTOPPassword> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const plaintext = encoder.encode(password)
  try {
    const ciphertext = await subtle().encrypt(
      { name: 'AES-GCM', iv, additionalData: vtopCredentialAad(userId, username) },
      keyring.current.key,
      plaintext
    )
    return {
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      iv: bytesToBase64(iv),
      keyVersion: keyring.current.version,
    }
  } finally {
    plaintext.fill(0)
  }
}

/**
 * Decrypts a stored row. Throws {@link VTOPCredentialDecryptError} if the row was encrypted
 * with a key not in the keyring, or fails authentication (tampered ciphertext/iv, or a row
 * moved to another user / username).
 */
export async function decryptVTOPPassword(
  keyring: VTOPKeyring,
  record: { userId: string; username: string; ciphertext: string; iv: string; keyVersion: number }
): Promise<string> {
  const key = keyForVersion(keyring, record.keyVersion)
  if (!key) {
    throw new VTOPCredentialDecryptError(
      `no VTOP credentials key with version ${record.keyVersion} is configured ` +
        '(was VTOP_CREDENTIALS_KEY_PREVIOUS removed too early?)'
    )
  }
  let iv: Uint8Array<ArrayBuffer>
  let ciphertext: Uint8Array<ArrayBuffer>
  try {
    iv = base64ToBytes(record.iv)
    ciphertext = base64ToBytes(record.ciphertext)
  } catch {
    throw new VTOPCredentialDecryptError('stored VTOP credential is not valid base64')
  }
  if (iv.length !== IV_BYTES) {
    throw new VTOPCredentialDecryptError('stored VTOP credential has an invalid IV')
  }
  let plaintext: Uint8Array<ArrayBuffer>
  try {
    plaintext = new Uint8Array(
      await subtle().decrypt(
        { name: 'AES-GCM', iv, additionalData: vtopCredentialAad(record.userId, record.username) },
        key,
        ciphertext
      )
    )
  } catch {
    throw new VTOPCredentialDecryptError('stored VTOP credential failed authentication')
  }
  try {
    return decoder.decode(plaintext)
  } catch {
    throw new VTOPCredentialDecryptError('stored VTOP credential is not valid UTF-8')
  } finally {
    plaintext.fill(0)
  }
}
