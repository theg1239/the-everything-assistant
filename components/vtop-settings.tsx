'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Eye,
  EyeOff,
  Shield,
  Link,
  Unlink,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { vtopCredentialInputSchema, VTOP_PASSWORD_MAX_LENGTH } from '@/lib/vtop-credential-schema'
import {
  linkVTOPCredentials,
  refreshVTOPCredentialStatus,
  unlinkVTOPCredentials,
  useVTOPCredentialStatus,
  VTOPCredentialsRequestError,
} from '@/lib/vtop-credentials'

interface VTOPSettingsProps {
  className?: string
}

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof VTOPCredentialsRequestError ? error.message : fallback

export function VTOPSettings({ className }: VTOPSettingsProps) {
  const linkStatus = useVTOPCredentialStatus()
  const isLinked = linkStatus?.linked === true
  const linkedUsername = linkStatus?.linked ? (linkStatus.username ?? '') : ''
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLinking, setIsLinking] = useState(false)
  const [isUnlinking, setIsUnlinking] = useState(false)
  const [showLinkForm, setShowLinkForm] = useState(false)

  useEffect(() => {
    // Settings may open long after the cached status was fetched (another tab may have changed it).
    refreshVTOPCredentialStatus().catch(() => undefined)
  }, [])

  const handleLinkCredentials = async () => {
    const parsed = vtopCredentialInputSchema.safeParse({ username, password })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Please enter both username and password')
      return
    }

    setIsLinking(true)

    try {
      const linked = await linkVTOPCredentials(parsed.data.username, parsed.data.password)
      setShowLinkForm(false)
      setPassword('')
      setUsername('')
      toast.success('VTOP credentials linked successfully!')

      window.dispatchEvent(
        new CustomEvent('vtopCredentialsLinked', {
          detail: { username: linked.username ?? parsed.data.username },
        })
      )
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to link VTOP credentials. Please try again.'))
    } finally {
      setIsLinking(false)
    }
  }

  const handleUnlinkCredentials = async () => {
    setIsUnlinking(true)
    try {
      await unlinkVTOPCredentials()
      setUsername('')
      setPassword('')
      setShowLinkForm(false)
      toast.success('VTOP credentials unlinked successfully')
      window.dispatchEvent(new CustomEvent('vtopCredentialsUnlinked'))
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to unlink VTOP credentials. Please try again.'))
    } finally {
      setIsUnlinking(false)
    }
  }

  const handleTestCredentials = async () => {
    if (!isLinked) return

    try {
      const current = await refreshVTOPCredentialStatus()
      if (current.linked) {
        toast.success(
          'Linked credentials are ready for use! They are validated on your next VTOP query.'
        )
      } else {
        toast.error('No linked credentials found. Please re-link your account.')
      }
    } catch (error) {
      toast.error(errorMessage(error, 'Could not check your linked credentials.'))
    }
  }

  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-medium">VTOP integration</h3>
          <p className="text-sm text-muted-foreground">
            link your VTOP account for seamless access to your academic data
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {isLinked ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
          )}
        </div>
      </div>

      {isLinked ? (
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">linked account</p>
                <p className="text-sm text-muted-foreground">{linkedUsername}</p>
              </div>
              <Shield className="h-5 w-5 text-green-500" />
            </div>
          </div>

          <div className="flex space-x-2">
            <Button variant="outline" size="sm" onClick={handleTestCredentials}>
              <CheckCircle className="h-4 w-4 mr-2" />
              test connection
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnlinkCredentials}
              disabled={isUnlinking}
              className="text-destructive hover:text-destructive"
            >
              {isUnlinking ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Unlink className="h-4 w-4 mr-2" />
              )}
              unlink account
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {!showLinkForm ? (
            <div className="text-center space-y-4">
              <div className="rounded-lg border border-dashed bg-muted/50 p-6">
                <Link className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium mb-2">VTOP not linked</p>
                <p className="text-xs text-muted-foreground mb-4">
                  link your VTOP account to avoid entering credentials repeatedly
                </p>
                <Button onClick={() => setShowLinkForm(true)} size="sm">
                  <Link className="h-4 w-4 mr-2" />
                  link VTOP account
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="link-username">VTOP username</Label>
                  <input
                    id="link-username"
                    type="text"
                    placeholder="registration number, e.g. 21BCE0001"
                    autoComplete="username"
                    autoCapitalize="characters"
                    spellCheck={false}
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="link-password">VTOP password</Label>
                  <div className="relative">
                    <input
                      id="link-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="enter your VTOP password"
                      autoComplete="current-password"
                      maxLength={VTOP_PASSWORD_MAX_LENGTH}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-10 bg-background border border-input rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-muted/50 p-3">
                <div className="flex items-start gap-2">
                  <Shield className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">security notice:</p>
                    <p>
                      your password is sent over HTTPS, stored encrypted on our server and never
                      shown again. you can unlink it at any time.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex space-x-2">
                <Button
                  onClick={handleLinkCredentials}
                  disabled={!username.trim() || !password.trim() || isLinking}
                  size="sm"
                  className="flex-1"
                >
                  {isLinking ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Link className="h-4 w-4 mr-2" />
                  )}
                  {isLinking ? 'linking...' : 'link account'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowLinkForm(false)
                    setPassword('')
                  }}
                  size="sm"
                >
                  cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
