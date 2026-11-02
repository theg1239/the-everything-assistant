import type { PrismaClient } from '@/prisma/generated/client'
import {
  decryptVTOPPassword,
  encryptVTOPPassword,
  getVTOPKeyring,
  VTOPCredentialDecryptError,
  type VTOPKeyring,
} from './vtop-credential-crypto'
import {
  LEGACY_VTOP_COOKIE_MAX_AGE_MS,
  vtopCredentialInputSchema,
  type VTOPCredentialStatus,
} from './vtop-credential-schema'
import { decryptLegacyVTOPCookies } from './vtop-legacy-credentials'

/**
 * Server-side VTOP credential store. Server-only: import it from route handlers, server
 * actions and server libraries, never from client components. (`server-only` is not installed;
 * the crypto-js/Prisma imports would fail a client build anyway.)
 *
 * The password is AES-256-GCM encrypted at rest (see vtop-credential-crypto.ts) and only ever
 * decrypted on the server, to be forwarded to the VTOP proxy. It is never returned to clients.
 */

export interface VTOPCredentials {
  username: string
  password: string
}

export interface VTOPCredentialRow {
  userId: string
  username: string
  ciphertext: string
  iv: string
  keyVersion: number
}

/** The persistence the store needs; Prisma in production, an in-memory map in tests. */
export interface VTOPCredentialRepository {
  find(userId: string): Promise<VTOPCredentialRow | null>
  upsert(row: VTOPCredentialRow): Promise<void>
  /** Inserts only if the user has no row. Returns false (and writes nothing) otherwise. */
  insertIfAbsent(row: VTOPCredentialRow): Promise<boolean>
  /** Replaces the row only if it still holds `expectedCiphertext` (optimistic re-encryption). */
  replaceIfUnchanged(expectedCiphertext: string, row: VTOPCredentialRow): Promise<boolean>
  delete(userId: string): Promise<void>
}

/** Invalid `{ username, password }`. `message` is safe to show to the user. */
export class VTOPCredentialValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VTOPCredentialValidationError'
  }
}

export interface LegacyVTOPCookies {
  credentialsCookie: string | null | undefined
  masterKeyCookie: string | null | undefined
}

export type LegacyImportResult =
  | { status: 'imported'; username: string }
  | {
      status: 'skipped'
      reason: 'absent' | 'existing' | 'undecryptable' | 'implausible' | 'invalid'
    }

/** Tolerated clock skew between the old client's `Date.now()` and the server. */
const LEGACY_CLOCK_SKEW_MS = 5 * 60 * 1000
const LEGACY_COOKIE_MAX_AGE_WITH_SKEW = LEGACY_VTOP_COOKIE_MAX_AGE_MS + LEGACY_CLOCK_SKEW_MS

/**
 * Whether a legacy cookie could plausibly have been written by this account: the cookies were
 * not bound to any user, so on a shared PC they may belong to whoever linked VTOP there before.
 * A cookie saved before the account existed cannot be its own, and one older than the cookie's
 * 90-day expiry (or in the future) is forged or corrupt. Callers must additionally never import
 * into an account that already has credentials.
 */
export function isPlausibleLegacyImport({
  savedAt,
  userCreatedAt,
  now,
}: {
  savedAt: number
  userCreatedAt: Date
  now: number
}): boolean {
  if (!Number.isFinite(savedAt)) return false
  if (savedAt > now + LEGACY_CLOCK_SKEW_MS) return false
  if (now - savedAt > LEGACY_COOKIE_MAX_AGE_WITH_SKEW) return false
  return savedAt >= userCreatedAt.getTime() - LEGACY_CLOCK_SKEW_MS
}

export interface VTOPCredentialStoreDeps {
  repository: VTOPCredentialRepository
  keyring: () => Promise<VTOPKeyring>
  now?: () => number
  logger?: Pick<Console, 'warn' | 'error'>
}

function errorName(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error'
}

export function createVTOPCredentialStore({
  repository,
  keyring,
  now = Date.now,
  logger = console,
}: VTOPCredentialStoreDeps) {
  async function encryptRow(userId: string, credentials: VTOPCredentials) {
    const encrypted = await encryptVTOPPassword(await keyring(), { userId, ...credentials })
    return { userId, username: credentials.username, ...encrypted }
  }

  /** Validates, encrypts with the current key, and upserts. Throws on invalid input. */
  async function save(userId: string, input: unknown): Promise<{ username: string }> {
    const parsed = vtopCredentialInputSchema.safeParse(input)
    if (!parsed.success) {
      throw new VTOPCredentialValidationError(
        parsed.error.issues[0]?.message ?? 'Invalid VTOP credentials.'
      )
    }
    await repository.upsert(await encryptRow(userId, parsed.data))
    return { username: parsed.data.username }
  }

  /**
   * Decrypted credentials, or null if none are stored or the row cannot be decrypted
   * (logged; the row is kept so a key misconfiguration is recoverable). Rows written with
   * the previous key are re-encrypted with the current one on read. Throws only on server
   * misconfiguration (`VTOPCredentialsConfigError`).
   */
  async function get(userId: string): Promise<VTOPCredentials | null> {
    const row = await repository.find(userId)
    if (!row) return null
    const ring = await keyring()
    let password: string
    try {
      password = await decryptVTOPPassword(ring, row)
    } catch (error) {
      if (!(error instanceof VTOPCredentialDecryptError)) throw error
      logger.error(
        `[vtop-credentials] cannot decrypt credentials for user ${userId}: ${error.message}`
      )
      return null
    }
    const credentials = { username: row.username, password }
    if (row.keyVersion !== ring.current.version) {
      try {
        await repository.replaceIfUnchanged(row.ciphertext, await encryptRow(userId, credentials))
      } catch (error) {
        logger.warn(
          `[vtop-credentials] re-encryption after key rotation failed: ${errorName(error)}`
        )
      }
    }
    return credentials
  }

  async function status(userId: string): Promise<VTOPCredentialStatus> {
    const row = await repository.find(userId)
    return row ? { linked: true, username: row.username } : { linked: false }
  }

  async function remove(userId: string): Promise<void> {
    await repository.delete(userId)
  }

  /**
   * One-time import of the legacy cookie pair into this user's server record. Never imports
   * into an account that already has credentials (checked atomically via `insertIfAbsent`),
   * and only when {@link isPlausibleLegacyImport} holds. The caller must expire the cookies
   * whatever the result.
   */
  async function importLegacy(
    userId: string,
    cookies: LegacyVTOPCookies,
    user: { createdAt: Date }
  ): Promise<LegacyImportResult> {
    if (!cookies.credentialsCookie || !cookies.masterKeyCookie) {
      return { status: 'skipped', reason: 'absent' }
    }
    if (await repository.find(userId)) return { status: 'skipped', reason: 'existing' }
    const legacy = decryptLegacyVTOPCookies(cookies.credentialsCookie, cookies.masterKeyCookie)
    if (!legacy) return { status: 'skipped', reason: 'undecryptable' }
    if (
      !isPlausibleLegacyImport({
        savedAt: legacy.savedAt,
        userCreatedAt: user.createdAt,
        now: now(),
      })
    ) {
      return { status: 'skipped', reason: 'implausible' }
    }
    const parsed = vtopCredentialInputSchema.safeParse({
      username: legacy.username,
      password: legacy.password,
    })
    if (!parsed.success) return { status: 'skipped', reason: 'invalid' }
    const inserted = await repository.insertIfAbsent(await encryptRow(userId, parsed.data))
    return inserted
      ? { status: 'imported', username: parsed.data.username }
      : { status: 'skipped', reason: 'existing' }
  }

  return { save, get, status, remove, importLegacy }
}

export type VTOPCredentialStore = ReturnType<typeof createVTOPCredentialStore>

export function createPrismaVTOPCredentialRepository(
  prisma: Pick<PrismaClient, 'vTOPCredential'>
): VTOPCredentialRepository {
  const select = { userId: true, username: true, ciphertext: true, iv: true, keyVersion: true }
  return {
    find: userId => prisma.vTOPCredential.findUnique({ where: { userId }, select }),
    async upsert(row) {
      const { userId, ...data } = row
      await prisma.vTOPCredential.upsert({
        where: { userId },
        create: row,
        update: data,
        select: { userId: true },
      })
    },
    async insertIfAbsent(row) {
      const { count } = await prisma.vTOPCredential.createMany({
        data: [row],
        skipDuplicates: true,
      })
      return count === 1
    },
    async replaceIfUnchanged(expectedCiphertext, row) {
      const { userId, ...data } = row
      const { count } = await prisma.vTOPCredential.updateMany({
        where: { userId, ciphertext: expectedCiphertext },
        data,
      })
      return count === 1
    },
    async delete(userId) {
      await prisma.vTOPCredential.deleteMany({ where: { userId } })
    },
  }
}

let defaultStore: VTOPCredentialStore | null = null

/** The Prisma-backed store. Prisma is imported lazily so tests never load a DB client. */
export function getVTOPCredentialStore(): VTOPCredentialStore {
  if (!defaultStore) {
    let repository: Promise<VTOPCredentialRepository> | null = null
    const repo = () =>
      (repository ??= import('./prisma').then(({ prisma }) =>
        createPrismaVTOPCredentialRepository(prisma)
      ))
    defaultStore = createVTOPCredentialStore({
      keyring: getVTOPKeyring,
      repository: {
        find: async userId => (await repo()).find(userId),
        upsert: async row => (await repo()).upsert(row),
        insertIfAbsent: async row => (await repo()).insertIfAbsent(row),
        replaceIfUnchanged: async (expected, row) =>
          (await repo()).replaceIfUnchanged(expected, row),
        delete: async userId => (await repo()).delete(userId),
      },
    })
  }
  return defaultStore
}

/** Validates (VIT registration number, bounded non-empty password), encrypts, stores. */
export function saveVTOPCredentials(
  userId: string,
  credentials: { username: string; password: string }
): Promise<{ username: string }> {
  return getVTOPCredentialStore().save(userId, credentials)
}

/** Decrypted credentials for `userId`, or null. Server-side use only; never send to a client. */
export function getVTOPCredentialsForUser(userId: string): Promise<VTOPCredentials | null> {
  return getVTOPCredentialStore().get(userId)
}

export function deleteVTOPCredentials(userId: string): Promise<void> {
  return getVTOPCredentialStore().remove(userId)
}

/** Link status without decrypting. */
export function hasVTOPCredentials(userId: string): Promise<VTOPCredentialStatus> {
  return getVTOPCredentialStore().status(userId)
}
