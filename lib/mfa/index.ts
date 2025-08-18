import { authenticator } from 'otplib'
import { createHash, randomBytes } from 'crypto'
import qrcode from 'qrcode'
import nodemailer from 'nodemailer'

authenticator.options = {
  window: 1,
  step: 30,
}

export function generateTOTPSecret(): string {
  return authenticator.generateSecret()
}

export async function generateQRCode(
  secret: string,
  userEmail: string,
  serviceName: string = 'The Everything Assistant'
): Promise<string> {
  const otpauth = authenticator.keyuri(userEmail, serviceName, secret)
  return await qrcode.toDataURL(otpauth)
}

export function verifyTOTP(token: string, secret: string): boolean {
  return authenticator.verify({ token, secret })
}

export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    const code = randomBytes(4).toString('hex').toUpperCase()
    codes.push(code)
  }
  return codes
}

export function hashBackupCodes(codes: string[]): string[] {
  return codes.map(code => createHash('sha256').update(code).digest('hex'))
}

export function verifyBackupCode(code: string, hashedCodes: string[]): boolean {
  const hashedCode = createHash('sha256').update(code.toUpperCase()).digest('hex')
  return hashedCodes.includes(hashedCode)
}

export function generateEmailCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function sendEmailCode(
  email: string,
  code: string,
  type: 'setup' | 'login' = 'setup'
): Promise<boolean> {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
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
      from: `"The Everything Assistant" <${process.env.SMTP_USER}>`,
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

const attemptCache = new Map<string, { count: number; lastAttempt: number }>()

export function checkRateLimit(
  identifier: string,
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000
): boolean {
  const now = Date.now()
  const attempts = attemptCache.get(identifier)

  if (!attempts) {
    attemptCache.set(identifier, { count: 1, lastAttempt: now })
    return true
  }

  if (now - attempts.lastAttempt > windowMs) {
    attemptCache.set(identifier, { count: 1, lastAttempt: now })
    return true
  }

  if (attempts.count >= maxAttempts) {
    return false
  }

  attempts.count++
  attempts.lastAttempt = now
  attemptCache.set(identifier, attempts)

  return true
}

export async function logSecurityEvent(
  userId: string,
  action: string,
  details: any = {},
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
