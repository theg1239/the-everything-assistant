import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Eye, EyeOff, Shield, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { VTOP_PASSWORD_MAX_LENGTH, vtopCredentialInputSchema } from '@/lib/vtop-credential-schema'
import {
  linkVTOPCredentials,
  useVTOPCredentialStatus,
  VTOPCredentialsRequestError,
} from '@/lib/vtop-credentials'

interface VTOPCredentialsDialogProps {
  isOpen: boolean
  onClose: () => void
  /**
   * Called after the credentials were stored server-side. `encryptedPassword` is always `''`:
   * the password never comes back to the browser, and an empty one makes the server use the
   * stored credentials. (Shape kept for existing consumers.)
   */
  onSubmit: (credentials: { username: string; encryptedPassword: string }) => void
  command: string
}

export function VTOPCredentialsDialog({ isOpen, onClose, onSubmit }: VTOPCredentialsDialogProps) {
  const linkStatus = useVTOPCredentialStatus(isOpen)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Prefill the linked username (never the password) each time the dialog opens.
  const linkedUsername = linkStatus?.linked ? linkStatus.username : undefined
  React.useEffect(() => {
    if (!isOpen) return
    setError(null)
    if (linkedUsername) setUsername(current => current || linkedUsername)
  }, [isOpen, linkedUsername])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    const parsed = vtopCredentialInputSchema.safeParse({ username, password })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your VTOP username and password.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const linked = await linkVTOPCredentials(parsed.data.username, parsed.data.password)
      const linkedAs = linked.username ?? parsed.data.username
      setPassword('')
      toast.success('VTOP credentials linked successfully!')
      window.dispatchEvent(
        new CustomEvent('vtopCredentialsLinked', { detail: { username: linkedAs } })
      )
      onClose()
      onSubmit({ username: linkedAs, encryptedPassword: '' })
    } catch (err) {
      const message =
        err instanceof VTOPCredentialsRequestError
          ? err.message
          : 'Failed to link credentials. Please try again.'
      setError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!mounted) return null

  if (!isOpen) return null
  const modalContent = (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black bg-opacity-70">
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

          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium text-slate-200">
                VTOP Username
              </label>
              <input
                id="username"
                type="text"
                placeholder="registration number, e.g. 21BCE0001"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoCapitalize="characters"
                spellCheck={false}
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
                  type={showPassword ? 'text' : 'password'}
                  placeholder="enter your VTOP password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  maxLength={VTOP_PASSWORD_MAX_LENGTH}
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-12 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-3 my-auto text-slate-400 hover:text-slate-200 transition-colors focus:outline-none h-8 w-8 flex items-center justify-center p-0 cursor-pointer select-none"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            )}

            <div className="bg-slate-800 p-3 rounded-xl border border-slate-600">
              <div className="flex items-start gap-2">
                <Lock className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-slate-300">
                  <p>
                    Your password is sent securely, stored encrypted on our server, and never shown
                    again. You can unlink it any time in settings.
                  </p>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={!username || !password || isSubmitting}
              className="w-full rounded-full bg-gradient-to-r from-slate-700 to-slate-800 px-6 py-3 font-medium text-white shadow-lg transition-colors hover:from-slate-600 hover:to-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Authenticating...' : 'Continue'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
  return createPortal(modalContent, document.body)
}
