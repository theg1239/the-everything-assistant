'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useMFA } from '@/contexts/mfa-context'
import { LoginFloatingBackground } from '@/components/login-floating-background'
import { readApiMessage, readJson } from '@/lib/http'
import { asRecord, errorMessage, readString } from '@/components/narrow'
import type { AuthenticatorTransport } from '@simplewebauthn/server'
import {
  mfaStatusResponseSchema,
  webAuthnRequestOptionsSchema,
  type MfaStatusResponse,
} from '@/types/api/mfa'

const SUPPORTED_AUTHENTICATOR_TRANSPORTS: AuthenticatorTransport[] = [
  'usb',
  'nfc',
  'ble',
  'internal',
]

const isAuthenticatorTransport = (value: string): value is AuthenticatorTransport =>
  SUPPORTED_AUTHENTICATOR_TRANSPORTS.some(transport => transport === value)

const normalizeTransports = (
  transports?: readonly string[]
): AuthenticatorTransport[] | undefined => {
  if (!transports) return undefined
  const filtered = transports.filter(isAuthenticatorTransport)
  return filtered.length ? filtered : undefined
}

const base64urlToArrayBuffer = (base64url: string): ArrayBuffer => {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray.buffer
}

const arrayBufferToBase64url = (buffer: ArrayBuffer | ArrayBufferView): string => {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  let binary = ''
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte)
  })
  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export function MFAChallenge() {
  const [code, setCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [mfaStatus, setMFAStatus] = useState<MfaStatusResponse | null>(null)
  const [isBackupMode, setIsBackupMode] = useState(false)
  const { data: session } = useSession()
  const { setMFAVerified } = useMFA()
  useEffect(() => {
    if (!session?.user) {
      return
    }

    fetchMFAStatus()
  }, [session])

  const fetchMFAStatus = async () => {
    try {
      const response = await fetch('/api/user/mfa')
      if (!response.ok) {
        throw new Error('Failed to fetch MFA status')
      }
      const data = await readJson(response, mfaStatusResponseSchema)
      setMFAStatus(data)
    } catch (error) {
      console.error('Failed to fetch MFA status:', error)
      toast.error('Failed to load MFA information')
    }
  }
  const handleWebAuthnAuth = async () => {
    if (!mfaStatus || mfaStatus.mfaMethod !== 'security_key') {
      return
    }

    setIsLoading(true)
    try {
      const optionsResponse = await fetch('/api/user/mfa/webauthn/authenticate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!optionsResponse.ok) {
        throw new Error('Failed to get authentication options')
      }

      const options = await readJson(optionsResponse, webAuthnRequestOptionsSchema)

      const allowCredentials: PublicKeyCredentialDescriptor[] | undefined =
        options.allowCredentials && options.allowCredentials.length
          ? options.allowCredentials.map(cred => ({
              type: 'public-key' as const,
              id: base64urlToArrayBuffer(cred.id),
              transports: normalizeTransports(cred.transports),
            }))
          : undefined

      const challengeBuffer = base64urlToArrayBuffer(options.challenge)
      const authenticationOptions: PublicKeyCredentialRequestOptions = {
        challenge: challengeBuffer,
        timeout: options.timeout,
        rpId: options.rpId,
        allowCredentials,
        userVerification: options.userVerification,
        // Server never requests extensions; JSON-form extensions (e.g. PRF)
        // would need BufferSource conversion before reaching the DOM API.
      }

      console.log('WebAuthn authentication options:', {
        method: mfaStatus?.mfaMethod,
        hasAllowCredentials: !!authenticationOptions.allowCredentials?.length,
        userVerification: authenticationOptions.userVerification,
        timeout: authenticationOptions.timeout,
        rpId: authenticationOptions.rpId,
        challenge: (() => {
          const buffer = challengeBuffer
          return (
            Array.from(new Uint8Array(buffer))
              .slice(0, 10)
              .join(',') + '...'
          )
        })(),
        allowCredentials: authenticationOptions.allowCredentials?.map(cred => ({
          transports: cred.transports,
          type: cred.type,
        })),
      })

      console.log('About to call navigator.credentials.get with:', {
        publicKey: {
          ...authenticationOptions,
          challenge: '[Uint8Array]',
          allowCredentials: authenticationOptions.allowCredentials,
        },
      })

      let credential: PublicKeyCredential | null
      try {
        const assertion = await navigator.credentials.get({
          publicKey: authenticationOptions,
        })
        credential = assertion instanceof PublicKeyCredential ? assertion : null
      } catch (getError) {
        console.error('navigator.credentials.get failed:', getError)
        const getErrorMessage = errorMessage(getError)

        if (readString(asRecord(getError)?.name) === 'NotAllowedError') {
          if (getErrorMessage?.includes('cross-origin')) {
            throw new Error(
              "Cross-origin authentication not allowed. Please ensure you're on the correct domain."
            )
          } else if (getErrorMessage?.includes('timeout')) {
            throw new Error(
              'Authentication timed out. Please try again and respond more quickly to the prompt.'
            )
          } else {
            throw new Error(
              'Authentication was blocked or cancelled. Please ensure Windows Hello/Touch ID is set up and you approve the prompt.'
            )
          }
        }
        throw getError
      }

      if (!credential) {
        throw new Error('No credential received')
      }

      const response = credential.response
      if (!(response instanceof AuthenticatorAssertionResponse)) {
        throw new Error('Unexpected credential response')
      }

      const verifyResponse = await fetch('/api/user/mfa/webauthn/verify-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credential: {
            id: credential.id,
            rawId: arrayBufferToBase64url(credential.rawId),
            response: {
              authenticatorData: arrayBufferToBase64url(response.authenticatorData),
              clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
              signature: arrayBufferToBase64url(response.signature),
              userHandle: response.userHandle
                ? arrayBufferToBase64url(response.userHandle)
                : null,
            },
            type: credential.type,
            clientExtensionResults: credential.getClientExtensionResults?.() || {},
          },
        }),
      })

      const data = await readApiMessage(verifyResponse)

      if (verifyResponse.ok) {
        toast.success('Authentication successful!')
        setMFAVerified(true)
      } else {
        toast.error(data.error || 'Authentication failed')
      }
    } catch (error) {
      console.error('WebAuthn authentication error:', error)
      const errorName = readString(asRecord(error)?.name)
      if (errorName === 'NotAllowedError') {
        toast.error(
          'Authentication was cancelled, timed out, or blocked. Please try again and ensure you approve any browser prompts.'
        )
      } else if (errorName === 'InvalidStateError') {
        toast.error(
          'No registered authenticator found. Please check your device settings or try registering again.'
        )
      } else if (errorName === 'SecurityError') {
        toast.error(
          'Security error - this may be due to an insecure connection or invalid configuration.'
        )
      } else if (errorName === 'AbortError') {
        toast.error('Authentication was aborted. Please try again.')
      } else if (errorName === 'ConstraintError') {
        toast.error(
          'Authentication constraints not satisfied. Please check your authenticator settings.'
        )
      } else {
        toast.error(errorMessage(error) || 'Authentication failed')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return

    if (isBackupMode && mfaStatus && mfaStatus.backupCodesCount === 0) {
      toast.error(
        'No backup codes available. Please use your authenticator app or contact support.'
      )
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/auth/mfa-verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(isBackupMode ? { backupCode: code.trim() } : { code: code.trim() }),
      })

      const data = await readApiMessage(response)

      if (response.ok) {
        toast.success('MFA verification successful!')
        if (data.message?.includes('remaining')) {
          toast.info(data.message)
        }
        setMFAVerified(true)
      } else {
        toast.error(data.error || `Invalid ${isBackupMode ? 'backup code' : 'verification code'}`)
        setCode('')
      }
    } catch (error) {
      console.error('MFA verification error:', error)
      toast.error('Verification failed. Please try again.')
      setCode('')
    } finally {
      setIsLoading(false)
    }
  }

  const toggleMode = () => {
    setIsBackupMode(!isBackupMode)
    setCode('')
  }

  if (!mfaStatus) {
    return (
      <LoginFloatingBackground>
        <div className="text-center text-white">
          <div className="text-4xl font-light drop-shadow-lg">the everything assistant</div>
        </div>
      </LoginFloatingBackground>
    )
  }

  return (
    <LoginFloatingBackground>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="bg-slate-900/80 backdrop-blur-xl border-slate-600/60 shadow-2xl shadow-purple-500/30 relative">
          <CardHeader className="text-center space-y-4">
            <CardTitle className="text-2xl font-light text-white drop-shadow-lg">
              verify your identity
            </CardTitle>{' '}
            <CardDescription className="text-slate-200">
              {isBackupMode
                ? 'enter your backup code'
                : mfaStatus.mfaMethod === 'email'
                  ? 'enter the verification code sent to your email'
                  : mfaStatus.mfaMethod === 'security_key'
                    ? 'use your authenticator (Windows Hello, Touch ID, external key, etc.)'
                    : 'enter the code from your authenticator app'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isBackupMode && mfaStatus.mfaMethod === 'security_key' ? (
              <div className="space-y-4">
                <div className="text-center">
                  <Button
                    onClick={handleWebAuthnAuth}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 shadow-lg hover:shadow-xl transition-all duration-200"
                    size="lg"
                    disabled={isLoading}
                  >
                    {isLoading ? `authenticating...` : 'authenticate with security key'}
                  </Button>
                </div>

                <div className="text-center">
                  <Button
                    variant="ghost"
                    onClick={toggleMode}
                    className="text-slate-300 hover:text-white text-sm"
                    disabled={isLoading}
                  >
                    use backup code instead
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div>
                  <Input
                    type="text"
                    placeholder={isBackupMode ? 'Enter backup code' : 'Enter verification code'}
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    className="bg-slate-800/50 border-slate-600 text-white placeholder-slate-400 text-center text-lg tracking-widest"
                    maxLength={isBackupMode ? 20 : 6}
                    disabled={isLoading}
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 shadow-lg hover:shadow-xl transition-all duration-200"
                  size="lg"
                  disabled={isLoading || !code.trim()}
                >
                  {isLoading ? 'verifying...' : 'verify'}
                </Button>

                <div className="text-center">
                  <Button
                    variant="ghost"
                    onClick={toggleMode}
                    className="text-slate-300 hover:text-white text-sm"
                    disabled={isLoading}
                  >
                    {isBackupMode
                      ? mfaStatus.mfaMethod === 'security_key'
                        ? 'use security key instead'
                        : 'use authenticator app instead'
                      : 'use backup code instead'}
                  </Button>
                </div>
              </form>
            )}
            <div className="text-xs text-slate-400 text-center">
              {isBackupMode
                ? 'having trouble? try using your primary authentication method instead'
                : mfaStatus.mfaMethod === 'email'
                  ? 'having trouble? check your email for the latest code'
                  : mfaStatus.mfaMethod === 'security_key'
                    ? 'having trouble? ensure your authenticator is working or device security is set up'
                    : 'having trouble? check your authenticator app for the latest code'}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </LoginFloatingBackground>
  )
}
