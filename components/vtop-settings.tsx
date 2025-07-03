'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { 
  Eye, 
  EyeOff, 
  Shield, 
  Link, 
  Unlink, 
  AlertTriangle,
  CheckCircle,
  Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  hasVTOPCredentials,
  saveVTOPCredentials,
  clearSavedVTOPCredentials,
  getSavedVTOPCredentials,
  validateSavedCredentials
} from '@/lib/vtop-credentials'

interface VTOPSettingsProps {
  className?: string
}

export function VTOPSettings({ className }: VTOPSettingsProps) {
  const [isLinked, setIsLinked] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLinking, setIsLinking] = useState(false)
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [autoLogin, setAutoLogin] = useState(true)

  useEffect(() => {
    checkLinkStatus()
  }, [])

  const checkLinkStatus = () => {
    const linked = hasVTOPCredentials()
    setIsLinked(linked)
    
    if (linked) {
      const saved = getSavedVTOPCredentials()
      if (saved) {
        setUsername(saved.username)
      }
    }
  }

  const handleLinkCredentials = async () => {
    if (!username.trim() || !password.trim()) {
      toast.error('Please enter both username and password')
      return
    }

    setIsLinking(true)
    
    try {
      // Save credentials directly - validation will happen on first use
      saveVTOPCredentials(username.trim(), password.trim())
      setIsLinked(true)
      setShowLinkForm(false)
      setPassword('')
      toast.success('VTOP credentials linked successfully!')
      
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('vtopCredentialsLinked', {
        detail: { username: username.trim() }
      }))
    } catch (error) {
      console.error('Error linking VTOP credentials:', error)
      toast.error('Failed to link VTOP credentials. Please try again.')
    } finally {
      setIsLinking(false)
    }
  }

  const handleUnlinkCredentials = () => {
    clearSavedVTOPCredentials()
    setIsLinked(false)
    setUsername('')
    setPassword('')
    setShowLinkForm(false)
    toast.success('VTOP credentials unlinked successfully')
    
    // Dispatch event to notify other components
    window.dispatchEvent(new CustomEvent('vtopCredentialsUnlinked'))
  }

  const handleTestCredentials = async () => {
    if (!isLinked) return
    
    toast.info('Testing credentials... This will be validated on your next VTOP query.')
    
    // We don't have a separate API, so just validate the stored credentials exist
    const valid = validateSavedCredentials()
    if (valid) {
      toast.success('Linked credentials are ready for use!')
    } else {
      toast.error('Linked credentials appear invalid. Please re-link your account.')
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
                <p className="text-sm text-muted-foreground">{username}</p>
              </div>
              <Shield className="h-5 w-5 text-green-500" />
            </div>
          </div>

          {/* <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-login">automatic VTOP login</Label>
              <Switch
                id="auto-login"
                checked={autoLogin}
                onCheckedChange={setAutoLogin}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              when enabled, VTOP queries will use your saved credentials automatically
            </p>
          </div> */}

          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestCredentials}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              test connection
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnlinkCredentials}
              className="text-destructive hover:text-destructive"
            >
              <Unlink className="h-4 w-4 mr-2" />
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
                <Button
                  onClick={() => setShowLinkForm(true)}
                  size="sm"
                >
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
                    placeholder="not your reg number"
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
                      your credentials are encrypted and stored in secure cookies. they never leave your device
                      in plain text and can be unlinked at any time.
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
