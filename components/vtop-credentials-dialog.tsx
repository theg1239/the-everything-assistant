import React, { useState } from "react"
import { createPortal } from "react-dom"
import { X, Eye, EyeOff, Shield, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import CryptoJS from "crypto-js"

interface VTOPCredentialsDialogProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (credentials: { username: string; encryptedPassword: string }) => void
  command: string
}

const getEncryptionKey = () => {
  let sessionKey = sessionStorage.getItem('vtop_session_key')
  if (!sessionKey) {
    sessionKey = CryptoJS.lib.WordArray.random(256/8).toString()
    sessionStorage.setItem('vtop_session_key', sessionKey)
  }
  return sessionKey
}

export function VTOPCredentialsDialog({ 
  isOpen, 
  onClose, 
  onSubmit, 
  command 
}: VTOPCredentialsDialogProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [rememberCredentials, setRememberCredentials] = useState(false)
  const [mounted, setMounted] = useState(false)

  React.useEffect(() => {
    setMounted(true)
    loadSavedCredentials()
  }, [])

  const loadSavedCredentials = () => {
    try {
      const saved = localStorage.getItem('vtop_credentials')
      if (saved) {
        const parsed = JSON.parse(saved)
        setUsername(parsed.username || "")
        setRememberCredentials(true)
      }
    } catch (error) {
      console.error('Error loading saved credentials:', error)
    }
  }
  const saveCredentials = () => {
    if (rememberCredentials && username) {
      localStorage.setItem('vtop_credentials', JSON.stringify({ username }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Form submitted with:', { username, password: '***' })
    
    if (!username || !password) {
      console.log('Missing credentials')
      return
    }

    setIsSubmitting(true)
    console.log('Setting isSubmitting to true')
    
    try {
      const encryptionKey = getEncryptionKey()
      const encryptedPassword = CryptoJS.AES.encrypt(password, encryptionKey).toString()
      console.log('Password encrypted')
      
      if (rememberCredentials) {
        saveCredentials()
        console.log('Credentials saved')
      }
      
      // Format: encryptedPassword:::sessionKey
      const credentialsPayload = {
        username,
        encryptedPassword: `${encryptedPassword}:::${encryptionKey}`
      }
      
      console.log('Calling onSubmit with credentials...')
      
      setPassword("")
      
      onClose()
      
      onSubmit(credentialsPayload)
      
      //console.log('Credentials submitted successfully')
      
    } catch (error) {
      //console.error('Error submitting credentials:', error)
    } finally {
      setIsSubmitting(false)
      //console.log('Setting isSubmitting to false')
    }
  }

  React.useEffect(() => {
    if (isOpen) {
      loadSavedCredentials()
    }
  }, [isOpen])

  if (!mounted) return null
  
  if (!isOpen) return null
  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="mx-4 w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-xl border border-slate-700">
        <div className="flex justify-end px-4 pt-4">
          <Button
            onClick={onClose}
            variant="ghost"
            size="sm"
            className="rounded-full p-1 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="px-8 pb-8 pt-2 text-center">
          <div className="mb-5 flex justify-center">
            <div className="rounded-full border-2 border-slate-700 bg-gradient-to-br from-slate-800 to-slate-700 p-4 shadow-inner">
              <Shield className="h-9 w-9 text-slate-200" />
            </div>
          </div>

          <h4 className="mb-2 text-2xl font-medium text-white">VTOP Authentication</h4>
          <p className="mb-6 text-slate-300">
            To execute the <code className="bg-slate-700 px-2 py-1 rounded text-sm">{command}</code> command, 
            please enter your VTOP credentials.
          </p>
          
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium text-slate-200">
                VTOP Username
              </label>
              <input
                id="username"
                type="text"
                placeholder="e.g., 21BCE1234"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-slate-200">
                VTOP Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your VTOP password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-12 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="remember"
                checked={rememberCredentials}
                onChange={(e) => setRememberCredentials(e.target.checked)}
                className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 h-4 w-4"
              />
              <label htmlFor="remember" className="text-sm text-slate-300">
                Remember username
              </label>
            </div>

            <div className="bg-slate-800 p-3 rounded-xl border border-slate-600">
              <div className="flex items-start gap-2">
                <Lock className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-slate-300">
                  {/* <p className="font-medium text-slate-200 mb-1">Security Notice:</p> */}
                  <p>Your password is encrypted and never stored. Only your username can be remembered.</p>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={!username || !password || isSubmitting}
              className="w-full rounded-full bg-gradient-to-r from-slate-700 to-slate-800 px-6 py-3 font-medium text-white shadow-lg transition-colors hover:from-slate-600 hover:to-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Authenticating..." : "Continue"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
  return createPortal(modalContent, document.body)
}
