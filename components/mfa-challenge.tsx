'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useMFA } from '@/components/mfa-context'

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
      <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
        <div className="text-4xl font-light text-white drop-shadow-lg">
          the everything assistant
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
                  : 'enter the code from your authenticator app'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div>
                {' '}
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
              </Button>{' '}
            </form>{' '}
            <div className="text-center">
              <Button
                variant="ghost"
                onClick={toggleMode}
                className="text-slate-300 hover:text-white text-sm"
                disabled={isLoading}
              >
                {isBackupMode ? 'use authenticator instead' : 'use backup code instead'}
              </Button>
            </div>{' '}
            <div className="text-xs text-slate-400 text-center">
              {isBackupMode
                ? 'having trouble? try using your authenticator app instead'
                : `having trouble? check your ${mfaStatus.mfaMethod === 'email' ? 'email' : 'authenticator app'} for the latest code`}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
