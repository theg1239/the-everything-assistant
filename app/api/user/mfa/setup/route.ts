import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { PrismaClient } from '@prisma/client'
import { isSMTPConfigured } from '@/lib/env-config'
import speakeasy from 'speakeasy'
import QRCode from 'qrcode'
import crypto from 'crypto'
import nodemailer from 'nodemailer'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const createEmailTransporter = () => {
  console.log('SMTP_EMAIL exists:', !!process.env.SMTP_EMAIL)
  console.log('SMTP_APP_PASSWORD exists:', !!process.env.SMTP_APP_PASSWORD)

  if (!process.env.SMTP_EMAIL || !process.env.SMTP_APP_PASSWORD) {
    throw new Error('Missing SMTP credentials in environment variables')
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_APP_PASSWORD,
    },
    debug: true,
    logger: true,
  })
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { method } = await request.json()

    if (!method || !['email', 'authenticator', 'security_key'].includes(method)) {
      return NextResponse.json({ error: 'Invalid method' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.mfaEnabled) {
      return NextResponse.json({ error: 'MFA already enabled' }, { status: 400 })
    }
    if (method === 'email') {
      // Check if SMTP is configured
      if (!isSMTPConfigured()) {
        return NextResponse.json(
          {
            error: 'Email MFA is not available. SMTP configuration is required.',
          },
          { status: 400 }
        )
      }

      if (!user.email) {
        return NextResponse.json({ error: 'User email not found' }, { status: 400 })
      }

      const verificationCode = crypto.randomInt(100000, 999999).toString()
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

      const hashedCode = await bcrypt.hash(verificationCode, 12)

      await prisma.user.update({
        where: { id: user.id },
        data: {
          tempMfaSecret: hashedCode,
          tempMfaMethod: method,
          tempMfaExpires: expiresAt,
        },
      })

      try {
        const transporter = createEmailTransporter()

        await transporter.verify()
        console.log('SMTP connection verified successfully')

        const mailOptions = {
          from: `"The Everything Assistant" <${process.env.SMTP_EMAIL}>`,
          to: user.email,
          subject: 'The Everything Assistant- MFA Setup Code',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Two-Factor Authentication Setup</h2>
              <p>Hi ${user.name || 'there'},</p>
              <p>You're setting up two-factor authentication for your The Everything Assistant account.</p>
              <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                <h3 style="margin: 0; color: #333;">Your verification code:</h3>
                <div style="font-size: 32px; font-weight: bold; color: #007bff; letter-spacing: 5px; margin: 10px 0;">
                  ${verificationCode}
                </div>
                <p style="color: #666; margin: 0;">This code expires in 10 minutes</p>
              </div>
              <p><strong>Security Notice:</strong></p>
              <ul style="color: #666;">
                <li>Never share this code with anyone</li>
                <li>The Everything Assistant staff will never ask for this code</li>
                <li>If you didn't request this, please secure your account immediately</li>
              </ul>
              <p style="color: #666; font-size: 12px; margin-top: 30px;">
                This email was sent from The Everything Assistant. If you have any concerns, please contact support.
              </p>
            </div>
          `,
        }

        const result = await transporter.sendMail(mailOptions)
        console.log('Email sent successfully:', result.messageId)

        return NextResponse.json({
          success: true,
          message: 'Verification code sent to your email',
        })
      } catch (emailError) {
        console.error('Email sending error:', emailError)

        await prisma.user.update({
          where: { id: user.id },
          data: {
            tempMfaSecret: null,
            tempMfaMethod: null,
            tempMfaExpires: null,
          },
        })

        return NextResponse.json(
          { error: 'Failed to send verification email. Please check your email configuration.' },
          { status: 500 }
        )
      }
    } else if (method === 'authenticator') {
      const secret = speakeasy.generateSecret({
        name: `everything assistant (${user.email})`,
        issuer: 'the everything assistant',
        length: 32,
      })

      await prisma.user.update({
        where: { id: user.id },
        data: {
          tempMfaSecret: secret.base32,
          tempMfaMethod: method,
          tempMfaExpires: new Date(Date.now() + 15 * 60 * 1000),
        },
      })

      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!)

      return NextResponse.json({
        success: true,
        qrCode: qrCodeUrl,
        secret: secret.base32,
        manualEntryKey: secret.base32,
      })
    } else if (method === 'security_key') {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          tempMfaSecret: null,
          tempMfaMethod: method,
          tempMfaExpires: new Date(Date.now() + 15 * 60 * 1000),
        },
      })

      return NextResponse.json({
        success: true,
        message: 'Security key setup initiated (supports both platform authenticators and external keys)',
        requiresWebAuthn: true,
      })
    }
  } catch (error) {
    console.error('MFA setup error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
