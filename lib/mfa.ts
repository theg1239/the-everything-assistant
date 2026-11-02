import { createGuardrails, generateSecret, generateURI, verifySync } from 'otplib'
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import qrcode from 'qrcode'
import nodemailer from 'nodemailer'

export const TOTP_PERIOD_SECONDS = 30

// otplib v12 generated 10-byte secrets by default; v13 rejects anything under
// 16 bytes. Relax the floor for verification so already-enrolled users keep
// working. New secrets are always generated at the RFC-recommended 20 bytes.
const LEGACY_SECRET_GUARDRAILS = createGuardrails({ MIN_SECRET_BYTES: 10 })

export function generateTOTPSecret(): string {
  return generateSecret({ length: 20 })
}

export function generateTOTPUri(secret: string, label: string, issuer: string): string {
  return generateURI({ issuer, label, secret, period: TOTP_PERIOD_SECONDS })
}

export async function generateQRCode(
  secret: string,
  userEmail: string,
  serviceName: string = 'The Everything Assistant'
): Promise<string> {
  return await qrcode.toDataURL(generateTOTPUri(secret, userEmail, serviceName))
}

/**
 * Verifies a TOTP code (±1 step of drift) and returns the time step it matched, so the caller
 * can reject replays of an already-accepted step (see `claimTotpTimeStep` in `lib/mfa-state`).
 */
export function matchTOTP(token: string, secret: string): { timeStep: number } | null {
  try {
    const result = verifySync({
      token,
      secret,
      period: TOTP_PERIOD_SECONDS,
      // ±1 step, matching the previous `window: 1` behaviour.
      epochTolerance: TOTP_PERIOD_SECONDS,
      guardrails: LEGACY_SECRET_GUARDRAILS,
    })
    // TOTP results always carry `timeStep` (the step counter that matched); the HOTP arm of
    // otplib's union never applies here, and is rejected rather than trusted.
    return result.valid && 'timeStep' in result ? { timeStep: result.timeStep } : null
  } catch {
    // Malformed tokens/secrets throw in v13; treat them as a failed check.
    return null
  }
}

/** Stateless TOTP check. Login/step-up paths must use {@link matchTOTP} plus replay protection. */
export function verifyTOTP(token: string, secret: string): boolean {
  return matchTOTP(token, secret) !== null
}

export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    const code = randomBytes(4).toString('hex').toUpperCase()
    codes.push(code)
  }
  return codes
}

/** Prefix of peppered (HMAC-SHA256) backup-code hashes; unprefixed hex is legacy plain SHA-256. */
const PEPPERED_BACKUP_CODE_PREFIX = 'hmac1$'

/**
 * Server-side secret mixed into backup-code and email-code hashes, so a database leak alone
 * doesn't let an attacker brute-force the (low-entropy) codes offline.
 */
export function getMfaPepper(): string {
  const pepper = process.env.MFA_BACKUP_CODE_PEPPER?.trim() || process.env.NEXTAUTH_SECRET?.trim()
  if (!pepper) {
    throw new Error('MFA_BACKUP_CODE_PEPPER (or NEXTAUTH_SECRET) must be set to hash MFA codes')
  }
  return pepper
}

/** Users may type backup codes in lower case or with spaces/dashes. */
export function normalizeBackupCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase()
}

function hmacHex(pepper: string, purpose: string, value: string): string {
  return createHmac('sha256', pepper).update(`${purpose}:${value}`).digest('hex')
}

function legacyBackupCodeHash(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

function hexEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right)
}

export function hashBackupCode(code: string, pepper: string): string {
  return PEPPERED_BACKUP_CODE_PREFIX + hmacHex(pepper, 'backup-code', normalizeBackupCode(code))
}

export function hashBackupCodes(codes: string[], pepper: string): string[] {
  return codes.map(code => hashBackupCode(code, pepper))
}

/**
 * Finds `code` among the stored hashes: peppered `hmac1$…` entries and legacy plain SHA-256
 * entries (written before peppering) are both accepted. Returns the matching index, or `null`.
 * The caller removes that entry (codes are single-use), which retires a legacy hash on use;
 * regenerating the codes replaces any remaining legacy hashes with peppered ones.
 */
export function findBackupCode(
  code: string,
  hashedCodes: readonly string[],
  pepper: string
): { index: number; legacy: boolean } | null {
  const normalized = normalizeBackupCode(code)
  if (!normalized) return null
  const peppered = hmacHex(pepper, 'backup-code', normalized)
  const legacy = legacyBackupCodeHash(normalized)
  for (const [index, stored] of hashedCodes.entries()) {
    if (stored.startsWith(PEPPERED_BACKUP_CODE_PREFIX)) {
      if (hexEquals(stored.slice(PEPPERED_BACKUP_CODE_PREFIX.length), peppered)) {
        return { index, legacy: false }
      }
    } else if (hexEquals(stored, legacy)) {
      return { index, legacy: true }
    }
  }
  return null
}

export function isLegacyBackupCodeHash(hash: string): boolean {
  return !hash.startsWith(PEPPERED_BACKUP_CODE_PREFIX)
}

/** A uniformly random 6-digit code from the CSPRNG. */
export function generateEmailCode(): string {
  return randomInt(100000, 1000000).toString()
}

/** Peppered hash of an emailed login code (what gets stored in Redis). */
export function hashEmailCode(code: string, pepper: string): string {
  return hmacHex(pepper, 'email-code', code.trim())
}

export function emailCodeHashesEqual(a: string, b: string): boolean {
  return hexEquals(a, b)
}

export async function sendEmailCode(
  email: string,
  code: string,
  type: 'setup' | 'login' = 'setup'
): Promise<boolean> {
  try {
    // `SMTP_EMAIL` is what `isSMTPConfigured()` checks; `SMTP_USER` is the legacy name.
    const smtpUser = process.env.SMTP_EMAIL || process.env.SMTP_USER
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: smtpUser,
        pass: process.env.SMTP_APP_PASSWORD,
      },
    })

    const subject =
      type === 'setup'
        ? 'The Everything Assistant - MFA Setup Verification'
        : 'The Everything Assistant - Login Verification'

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1f2937;">The Everything Assistant</h2>
        <h3 style="color: #374151;">${type === 'setup' ? 'MFA Setup' : 'Login'} Verification</h3>
        
        <p>Your verification code is:</p>
        
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1f2937;">${code}</span>
        </div>
        
        <p style="color: #6b7280; font-size: 14px;">
          This code will expire in 10 minutes. If you didn't request this, please ignore this email.
        </p>
        
        <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
          This is an automated message. Please do not reply to this email.
        </p>
      </div>
    `

    await transporter.sendMail({
      from: `"The Everything Assistant" <${smtpUser}>`,
      to: email,
      subject,
      html,
    })

    return true
  } catch (error) {
    console.error('Error sending email:', error)
    return false
  }
}

export async function logSecurityEvent(
  userId: string,
  action: string,
  details: Record<string, unknown> = {},
  request?: Request
) {
  try {
    const { prisma } = await import('./prisma')

    const ipAddress =
      request?.headers.get('x-forwarded-for') || request?.headers.get('x-real-ip') || 'unknown'

    const userAgent = request?.headers.get('user-agent') || 'unknown'

    await prisma.securityLog.create({
      data: {
        userId,
        event: action,
        method: typeof details.method === 'string' ? details.method : null,
        ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
        userAgent,
      },
    })
  } catch (error) {
    console.error('Error logging security event:', error)
  }
}
