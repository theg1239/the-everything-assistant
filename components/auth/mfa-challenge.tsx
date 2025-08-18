'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useMFA } from '@/contexts/mfa-context'

interface MFAStatus {
  mfaEnabled: boolean
  mfaMethod?: string
  backupCodeCount: number
}

export function MFAChallenge() {
  const [code, setCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [mfaStatus, setMFAStatus] = useState<MFAStatus | null>(null)
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
      if (response.ok) {
        const data = await response.json()
        setMFAStatus(data)
      }
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

      const options = await optionsResponse.json()

      function base64urlToUint8Array(base64url: string): Uint8Array {
        const padding = '='.repeat((4 - (base64url.length % 4)) % 4)
        const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/')
        const rawData = window.atob(base64)
        const outputArray = new Uint8Array(rawData.length)
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i)
        }
        return outputArray
      }

      const authenticationOptions = {
        ...options,
        challenge:
          typeof options.challenge === 'string'
            ? base64urlToUint8Array(options.challenge)
            : new Uint8Array(options.challenge),
        allowCredentials:
          options.allowCredentials?.map((cred: any) => ({
            ...cred,
            id:
              typeof cred.id === 'string'
                ? base64urlToUint8Array(cred.id)
                : new Uint8Array(cred.id),
          })) || [],
      }

      console.log('WebAuthn authentication options:', {
        method: mfaStatus?.mfaMethod,
        hasAllowCredentials: !!authenticationOptions.allowCredentials?.length,
        userVerification: authenticationOptions.userVerification,
        timeout: authenticationOptions.timeout,
        rpId: authenticationOptions.rpId,
        challenge: authenticationOptions.challenge
          ? Array.from(authenticationOptions.challenge).slice(0, 10).join(',') + '...'
          : 'null',
        allowCredentials: authenticationOptions.allowCredentials?.map((cred: any) => ({
          id: cred.id ? Array.from(cred.id).slice(0, 10).join(',') + '...' : 'null',
          transports: cred.transports,
          type: cred.type,
        })),
      })

      console.log('About to call navigator.credentials.get with:', {
        publicKey: {
          ...authenticationOptions,
          challenge: '[Uint8Array]',
          allowCredentials: authenticationOptions.allowCredentials?.map((cred: any) => ({
            ...cred,
            id: '[Uint8Array]',
          })),
        },
      })

      let credential
      try {
        credential = (await navigator.credentials.get({
          publicKey: authenticationOptions,
        })) as PublicKeyCredential
      } catch (getError: any) {
        console.error('navigator.credentials.get failed:', getError)

        if (getError.name === 'NotAllowedError') {
          if (getError.message?.includes('cross-origin')) {
            throw new Error(
              "Cross-origin authentication not allowed. Please ensure you're on the correct domain."
            )
          } else if (getError.message?.includes('timeout')) {
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

      const response = credential.response as AuthenticatorAssertionResponse

      function uint8ArrayToBase64url(buffer: Uint8Array): string {
        const base64 = btoa(String.fromCharCode(...buffer))
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
      }

      const verifyResponse = await fetch('/api/user/mfa/webauthn/verify-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credential: {
            id: credential.id,
            rawId: uint8ArrayToBase64url(new Uint8Array(credential.rawId)),
            response: {
              authenticatorData: uint8ArrayToBase64url(new Uint8Array(response.authenticatorData)),
              clientDataJSON: uint8ArrayToBase64url(new Uint8Array(response.clientDataJSON)),
              signature: uint8ArrayToBase64url(new Uint8Array(response.signature)),
              userHandle: response.userHandle
                ? uint8ArrayToBase64url(new Uint8Array(response.userHandle))
                : null,
            },
            type: credential.type,
            clientExtensionResults: credential.getClientExtensionResults?.() || {},
          },
        }),
      })

      const data = await verifyResponse.json()

      if (verifyResponse.ok) {
        toast.success('Authentication successful!')
        setMFAVerified(true)
      } else {
        toast.error(data.error || 'Authentication failed')
      }
    } catch (error: any) {
      console.error('WebAuthn authentication error:', error)
      if (error.name === 'NotAllowedError') {
        toast.error(
          'Authentication was cancelled, timed out, or blocked. Please try again and ensure you approve any browser prompts.'
        )
      } else if (error.name === 'InvalidStateError') {
        toast.error(
          'No registered authenticator found. Please check your device settings or try registering again.'
        )
      } else if (error.name === 'SecurityError') {
        toast.error(
          'Security error - this may be due to an insecure connection or invalid configuration.'
        )
      } else if (error.name === 'AbortError') {
        toast.error('Authentication was aborted. Please try again.')
      } else if (error.name === 'ConstraintError') {
        toast.error(
          'Authentication constraints not satisfied. Please check your authenticator settings.'
        )
      } else {
        toast.error(error.message || 'Authentication failed')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return

    if (isBackupMode && mfaStatus && mfaStatus.backupCodeCount === 0) {
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

      const data = await response.json()

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
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="text-center">
          <div className="text-4xl font-light text-white drop-shadow-lg">
            the everything assistant
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
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
    </div>
  )
}
