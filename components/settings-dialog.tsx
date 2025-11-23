'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { motion } from 'framer-motion'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer } from 'vaul'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useSidebar } from '@/contexts/sidebar-context'
import {
  Settings,
  Bell,
  User,
  Palette,
  Globe,
  Archive,
  Trash2,
  LogOut,
  Shield,
  Zap,
  ChevronRight,
  Moon,
  Sun,
  Monitor,
  Loader2,
  Smartphone,
  Mail,
  Key,
  QrCode,
  Download,
  Copy,
  Eye,
  EyeOff,
  MessageSquarePlus,
  Brain,
  Fingerprint,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useCustomBackground } from '@/hooks/use-custom-background'
import type { BackgroundType } from '@/components/backgrounds/custom-background'
import dynamic from 'next/dynamic'
import { useMemo } from 'react'
import { FeedbackSection } from '@/components/feedback-section'
import { MemoryManagement } from '@/components/memory-management'
import { VTOPSettings } from '@/components/vtop-settings'
import { deleteAccountAction } from '@/app/actions/account'
import { readJson } from '@/lib/http'
import type { UserPreferences, UserPreferencesResponse } from '@/types/preferences'
import type { MemorySettings } from '@/hooks/use-memories'
import type {
  MfaAvailabilityResponse,
  MfaBackupCodesResponse,
  MfaSetupResponse,
  MfaStatusResponse,
} from '@/types/api/mfa'
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/server'

const Aurora = dynamic(() => import('@/components/backgrounds/aurora'), {
  ssr: false,
  loading: () => null,
})

const Beams = dynamic(() => import('@/components/backgrounds/beams'), {
  ssr: false,
  loading: () => null,
})

const Dither = dynamic(() => import('@/components/backgrounds/dither'), {
  ssr: false,
  loading: () => null,
})

const FloatingLines = dynamic(() => import('@/components/backgrounds/floating-lines'), {
  ssr: false,
  loading: () => null,
})

const ColorBands = dynamic(() => import('@/components/backgrounds/color-bands'), {
  ssr: false,
  loading: () => null,
})

const TerminalPreview = dynamic(() => import('@/components/backgrounds/terminal'), {
  ssr: false,
  loading: () => null,
})

const GridPreview = dynamic(() => import('@/components/backgrounds/grid'), {
  ssr: false,
  loading: () => null,
})

interface ChatSummary {
  id: string
  title: string
  path: string
  createdAt: string
  updatedAt: string
}

interface ChatActionResponse {
  success?: boolean
  message?: string
  count?: number
  error?: string
}

interface DailyBriefingTestResponse {
  ok?: boolean
  error?: string
}

interface PreferencesUpdateResponse {
  preferences: UserPreferences
  message?: string
  error?: string
}

type BasicApiResponse = {
  success?: boolean
  message?: string
  error?: string
}

interface MfaMethodChangeResponse extends BasicApiResponse {
  requiresRegistration?: boolean
}

type SelectableBackgroundType = Exclude<BackgroundType, 'null'>

const BACKGROUND_TYPE_VALUES = [
  'aurora',
  'beams',
  'dither',
  'floating-lines',
  'terminal',
  'grid',
  'color-bands',
  'gradient',
  'solid',
] as const satisfies readonly SelectableBackgroundType[]

const isSelectableBackgroundType = (
  value: BackgroundType | string | undefined | null
): value is SelectableBackgroundType => !!value && (BACKGROUND_TYPE_VALUES as readonly string[]).includes(value)

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

const cloneBufferSource = (value: ArrayBufferLike | ArrayBuffer | Uint8Array): ArrayBuffer => {
  const source = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBufferLike)
  const copy = new Uint8Array(source.length)
  copy.set(source)
  return copy.buffer
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
export function SettingsDialog({ open, onOpenChange, onTriggerOnboarding }: any) {
  const { data: session } = useSession()
  const { setBackgroundType, toggleBackground } = useCustomBackground()
  const { setIsOpen: setSidebarOpen } = useSidebar()
  const [activeSection, setActiveSection] = useState('general')
  const [pendingSection, setPendingSection] = useState<string | null>(null)
  const [followUpSuggestions, setFollowUpSuggestions] = useState(true)
  const [backgroundConfig, setBackgroundConfig] = useState<{
    type: SelectableBackgroundType
    enabled: boolean
  }>({
    type: 'aurora',
    enabled: false,
  })
  const [theme, setTheme] = useState('system')
  const [dailyBriefingSettings, setDailyBriefingSettings] = useState({
    dismissTime: '07:30',
    emailEnabled: false,
    emailTime: '07:30',
  })
  const [updatingBriefing, setUpdatingBriefing] = useState(false)
  const [currentPreferences, setCurrentPreferences] = useState<UserPreferences | null>(null)
  const [sendingTestBriefing, setSendingTestBriefing] = useState(false)

  const [touchStartY, setTouchStartY] = useState(0)
  const [touchStartScrollTop, setTouchStartScrollTop] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const BackgroundPreview = ({ type }: { type: BackgroundType }) => {
    const beamsComponent = useMemo(
      () => (
        <Beams
          beamWidth={3}
          beamHeight={150}
          beamNumber={6}
          lightColor="#60a5fa"
          speed={0.3}
          noiseIntensity={0.4}
          scale={1.2}
          rotation={30}
        />
      ),
      []
    )
    const floatingLinesComponent = useMemo(
      () => (
        <FloatingLines
          lineCount={[10, 8, 6]}
          lineDistance={[6, 5, 4]}
          animationSpeed={0.45}
          interactive={false}
          parallax={false}
          bendStrength={0}
        />
      ),
      []
    )
    const colorBandsComponent = useMemo(
      () => (
        <ColorBands
          colors={['#22d3ee', '#3b82f6', '#a855f7', '#f97316']}
          transparent
          rotation={28}
          speed={0.3}
          autoRotate={10}
          scale={1.1}
          frequency={1}
          warpStrength={1.2}
          mouseInfluence={0}
          parallax={0}
          noise={0.05}
        />
      ),
      []
    )
    const terminalComponent = useMemo(
      () => (
        <TerminalPreview
          scale={1}
          gridMul={[2, 1]}
          digitSize={1.4}
          timeScale={0.3}
          scanlineIntensity={0.25}
          glitchAmount={0.85}
          flickerAmount={0.35}
          noiseAmp={0.45}
          chromaticAberration={0.001}
          dither={0.35}
          curvature={0.1}
          tint="#2fd4c8"
          mouseReact={false}
          brightness={0.9}
          backgroundColor="#030712"
          overlayOpacity={0.45}
        />
      ),
      []
    )
    const gridComponent = useMemo(
      () => (
        <GridPreview
          className="absolute inset-0"
          lineThickness={1.1}
          linesColor="#2dd4ff"
          scanColor="#f472b6"
          scanOpacity={0.45}
          gridScale={0.12}
          lineStyle="dashed"
          lineJitter={0.08}
          scanDirection="pingpong"
          noiseIntensity={0.02}
          scanGlow={0.6}
          scanSoftness={2}
          scanPhaseTaper={0.85}
          scanDuration={2.5}
          scanDelay={2.5}
          enablePost={false}
        />
      ),
      []
    )

    switch (type) {
      case 'aurora':
        return (
          <div className="relative w-full h-16 rounded-md overflow-hidden bg-black">
            <Aurora
              colorStops={['#5227FF', '#7cff67', '#5227FF']}
              amplitude={1.2}
              blend={0.6}
              speed={0.8}
            />
          </div>
        )
      case 'beams':
        return (
          <div className="relative w-full h-16 rounded-md overflow-hidden bg-black">
            {beamsComponent}
          </div>
        )
      case 'floating-lines':
        return (
          <div className="relative w-full h-16 rounded-md overflow-hidden bg-black">
            {floatingLinesComponent}
          </div>
        )
      case 'dither':
        return (
          <div className="relative w-full h-16 rounded-md overflow-hidden bg-black">
            <Dither
              waveSpeed={0.05}
              waveFrequency={3}
              waveAmplitude={0.3}
              waveColor={[0.4, 0.6, 0.8]}
              colorNum={4}
              pixelSize={2}
              disableAnimation={false}
              enableMouseInteraction={false}
              mouseRadius={1}
            />
          </div>
        )
      case 'color-bands':
        return (
          <div className="relative w-full h-16 rounded-md overflow-hidden bg-black">
            {colorBandsComponent}
          </div>
        )
      case 'grid':
        return (
          <div className="relative w-full h-16 rounded-md overflow-hidden bg-black">
            {gridComponent}
          </div>
        )
      case 'terminal':
        return (
          <div className="relative w-full h-16 rounded-md overflow-hidden bg-black">
            {terminalComponent}
          </div>
        )
      case 'gradient':
        return (
          <div className="relative w-full h-16 rounded-md overflow-hidden">
            <div className="w-full h-full bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460]" />
          </div>
        )
      case 'solid':
        return (
          <div className="relative w-full h-16 rounded-md overflow-hidden">
            <div className="w-full h-full bg-[#0a0a0a]" />
          </div>
        )
      default:
        return <div className="w-full h-16 rounded-md bg-muted/50" />
    }
  }
  const [isDeleting, setIsDeleting] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [showArchivedChats, setShowArchivedChats] = useState(false)
  const [archivedChats, setArchivedChats] = useState<ChatSummary[]>([])
  const [loadingArchived, setLoadingArchived] = useState(false)
  const [restoringChats, setRestoringChats] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [confirmDeleteArchived, setConfirmDeleteArchived] = useState(false)
  const [isDeletingArchived, setIsDeletingArchived] = useState(false)
  const [loadingPreferences, setLoadingPreferences] = useState(false)
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaMethod, setMfaMethod] = useState<'email' | 'authenticator' | 'security_key'>('email')
  const [memoryEnabled, setMemoryEnabled] = useState(true)
  const [loadingMfa, setLoadingMfa] = useState(false)
  const [showMfaSetup, setShowMfaSetup] = useState(false)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [showBackupCodes, setShowBackupCodes] = useState(false)
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [manualEntryKey, setManualEntryKey] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [setupStep, setSetupStep] = useState<'method' | 'verify' | 'backup'>('method')
  const [showBackupCodesReveal, setShowBackupCodesReveal] = useState(false)
  const [mfaAvailability, setMfaAvailability] = useState<{
    email: boolean
    authenticator: boolean
    security_key: boolean
  }>({
    email: true,
    authenticator: true,
    security_key: true,
  })
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return true
    }
    return window.matchMedia('(min-width: 768px)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const updateViewportHeight = () => {
      document.documentElement.style.setProperty('--app-viewport-height', `${window.innerHeight}px`)
    }

    updateViewportHeight()
    window.addEventListener('resize', updateViewportHeight)
    window.addEventListener('orientationchange', updateViewportHeight)

    return () => {
      window.removeEventListener('resize', updateViewportHeight)
      window.removeEventListener('orientationchange', updateViewportHeight)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia('(min-width: 768px)')
    const handler = (event: MediaQueryListEvent) => setIsDesktop(event.matches)
    setIsDesktop(mediaQuery.matches)
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    }
    mediaQuery.addListener(handler)
    return () => mediaQuery.removeListener(handler)
  }, [])

  useEffect(() => {
    if (!(open && session?.user?.id)) return

    const controller = new AbortController()

    const loadPreferences = async () => {
      let loadedMfaMethod: 'email' | 'authenticator' | 'security_key' = 'email'
      setLoadingPreferences(true)
      try {
        const memorySettingsResponse = await fetch('/api/memories/settings', {
          signal: controller.signal,
        })
        if (memorySettingsResponse.ok) {
          const memorySettings = await readJson<MemorySettings>(memorySettingsResponse)
          setMemoryEnabled(memorySettings.isEnabled)
        } else {
          setMemoryEnabled(true)
        }

        const response = await fetch('/api/user/preferences', { signal: controller.signal })
        if (response.ok) {
          const data = await readJson<UserPreferencesResponse>(response)
          const prefs = data.preferences
          setCurrentPreferences(prefs)
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('userPreferencesUpdated', { detail: prefs }))
          }
          setFollowUpSuggestions(prefs.followUpSuggestions ?? true)

          if (prefs.backgroundConfig) {
            const bgType = isSelectableBackgroundType(prefs.backgroundConfig.type)
              ? prefs.backgroundConfig.type
              : 'aurora'
            setBackgroundConfig({
              type: bgType,
              enabled: prefs.backgroundConfig.enabled ?? true,
            })
          } else if (prefs.auroraBackground !== undefined) {
            setBackgroundConfig({
              type: 'aurora',
              enabled: prefs.auroraBackground,
            })
          }

          if (prefs.dailyBriefing) {
            setDailyBriefingSettings({
              dismissTime: prefs.dailyBriefing.dismissTime || '07:30',
              emailEnabled: prefs.dailyBriefing.emailEnabled ?? false,
              emailTime:
                prefs.dailyBriefing.emailTime || prefs.dailyBriefing.dismissTime || '07:30',
            })
          }
        }

        const mfaResponse = await fetch('/api/user/mfa', { signal: controller.signal })
        if (mfaResponse.ok) {
          const mfaData = await readJson<MfaStatusResponse>(mfaResponse)
          setMfaEnabled(mfaData.mfaEnabled ?? false)
          loadedMfaMethod =
            mfaData.mfaMethod === 'security_key'
              ? 'security_key'
              : mfaData.mfaMethod === 'authenticator'
                ? 'authenticator'
                : 'email'
          setMfaMethod(loadedMfaMethod)
          setBackupCodes(new Array(mfaData.backupCodesCount || 0).fill('ΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇó'))
        }

        const availabilityResponse = await fetch('/api/user/mfa/availability', {
          signal: controller.signal,
        })
        if (availabilityResponse.ok) {
          const availabilityData = await readJson<MfaAvailabilityResponse>(availabilityResponse)

          const hasWebAuthnSupport = !!(
            window.navigator.credentials &&
            typeof window.navigator.credentials.create === 'function' &&
            window.PublicKeyCredential
          )

          const updatedAvailability = {
            ...availabilityData.availability,
            security_key: availabilityData.availability.security_key && hasWebAuthnSupport,
          }

          setMfaAvailability(updatedAvailability)

          if (!updatedAvailability.email && loadedMfaMethod === 'email') {
            if (updatedAvailability.security_key) {
              setMfaMethod('security_key')
            } else {
              setMfaMethod('authenticator')
            }
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Error loading preferences:', error)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingPreferences(false)
        }
      }
    }

    void loadPreferences()

    return () => controller.abort()
  }, [open, session?.user?.id])

  const savePreferences = async (newPreferences: Partial<UserPreferences>) => {
    if (!session?.user?.id) return

    try {
      const basePrefs: UserPreferences = currentPreferences ?? {}
      const payload: UserPreferences = { ...basePrefs, ...newPreferences }
      const response = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferences: payload,
        }),
      })

      if (response.ok) {
        setCurrentPreferences(payload)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('userPreferencesUpdated', { detail: payload }))
        }
        toast.success('Preferences saved successfully')
      } else {
        throw new Error('Failed to save preferences')
      }
    } catch (error) {
      console.error('Error saving preferences:', error)
      toast.error('Failed to save preferences')
    }
  }

  const handleFollowUpSuggestionsChange = async (checked: boolean) => {
    setFollowUpSuggestions(checked)
    await savePreferences({ followUpSuggestions: checked })
  }

  const handleBriefingSettingsUpdate = async (updates: Partial<typeof dailyBriefingSettings>) => {
    const previous = dailyBriefingSettings
    const next = { ...dailyBriefingSettings, ...updates }
    setDailyBriefingSettings(next)
    setUpdatingBriefing(true)
    try {
      const response = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dailyBriefing: {
            dismissTime: next.dismissTime,
            emailEnabled: next.emailEnabled,
            emailTime: next.emailTime,
          },
        }),
      })
      if (!response.ok) throw new Error('Failed to update daily briefing preferences')

      const basePrefs: UserPreferences = currentPreferences ?? {}
      const updatedPrefs: UserPreferences = {
        ...basePrefs,
        dailyBriefing: {
          ...(basePrefs.dailyBriefing || {}),
          dismissTime: next.dismissTime,
          emailEnabled: next.emailEnabled,
          emailTime: next.emailTime,
        },
      }
      setCurrentPreferences(updatedPrefs)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('userPreferencesUpdated', { detail: updatedPrefs }))
      }
      toast.success('daily briefing updated')
    } catch (error) {
      console.error('Error updating daily briefing preferences:', error)
      toast.error('failed to update daily briefing')
      setDailyBriefingSettings(previous)
    } finally {
      setUpdatingBriefing(false)
    }
  }

  const handleSendTestBriefing = async () => {
    setSendingTestBriefing(true)
    try {
      const response = await fetch('/api/hub/daily-briefing-email/test', {
        method: 'POST',
      })
      let payload: DailyBriefingTestResponse | null = null
      try {
        payload = await readJson<DailyBriefingTestResponse>(response)
      } catch {
        payload = null
      }
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to send test briefing')
      }
      toast.success('daily briefing sent to your inbox')
    } catch (error: any) {
      console.error('Error sending test briefing:', error)
      toast.error(error?.message || 'failed to send daily briefing email')
    } finally {
      setSendingTestBriefing(false)
    }
  }

  const handleMemoryToggle = async (checked: boolean) => {
    try {
      setMemoryEnabled(checked)
      await fetch('/api/memories/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: checked }),
      })
    } catch (error) {
      console.error('Failed to update memory settings:', error)
      toast.error('Failed to update memory settings')
      setMemoryEnabled(!checked) // Revert on error
    }
  }

  const handleBackgroundTypeChange = async (type: SelectableBackgroundType) => {
    const newConfig = { ...backgroundConfig, type }
    setBackgroundConfig(newConfig)

    const success = await setBackgroundType(type, backgroundConfig.enabled)
    if (!success) {
      setBackgroundConfig(backgroundConfig)
      toast.error('Failed to update background preference')
    }
  }

  const handleBackgroundToggle = async (enabled: boolean) => {
    const newConfig = { ...backgroundConfig, enabled }
    setBackgroundConfig(newConfig)

    const success = await toggleBackground(enabled)
    if (!success) {
      setBackgroundConfig(backgroundConfig)
      toast.error('Failed to update background preference')
    }
  }

  const handleMfaToggle = async (enabled: boolean) => {
    if (enabled && !mfaEnabled) {
      setShowMfaSetup(true)
      setSetupStep('method')
      return
    }

    setLoadingMfa(true)
    try {
      const response = await fetch('/api/user/mfa', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        setMfaEnabled(false)
        setBackupCodes([])
        setShowMfaSetup(false)
        toast.success('MFA disabled successfully')
      } else {
        throw new Error('Failed to disable MFA')
      }
    } catch (error) {
      console.error('Error disabling MFA:', error)
      toast.error('Failed to disable MFA')
    } finally {
      setLoadingMfa(false)
    }
  }

  const initiateMfaSetup = async () => {
    setLoadingMfa(true)
    try {
      const response = await fetch('/api/user/mfa/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method: mfaMethod,
        }),
      })

      if (response.ok) {
        const data = await readJson<MfaSetupResponse>(response)

        if (mfaMethod === 'authenticator') {
          setQrCodeUrl(data.qrCode || '')
          setManualEntryKey(data.secret || '')
        }

        setSetupStep('verify')

        if (mfaMethod === 'email') {
          toast.success(data.message || 'Verification code sent to your email')
        }
      } else {
        throw new Error('Failed to initiate MFA setup')
      }
    } catch (error) {
      console.error('Error initiating MFA setup:', error)
      toast.error('Failed to initiate MFA setup')
    } finally {
      setLoadingMfa(false)
    }
  }

  const verifyMfaSetup = async () => {
    if (mfaMethod !== 'security_key' && !verificationCode.trim()) {
      toast.error('Please enter the verification code')
      return
    }

    setLoadingMfa(true)
    try {
      if (mfaMethod === 'security_key') {
        if (!window.navigator.credentials) {
          throw new Error('WebAuthn is not supported in this browser')
        }

        if (!window.PublicKeyCredential) {
          throw new Error('PublicKeyCredential is not supported in this browser')
        }

        console.log('Starting WebAuthn registration for:', mfaMethod)
        console.log('Current origin:', window.location.origin)
        console.log('Is HTTPS:', window.location.protocol === 'https:')
        console.log('Is localhost:', window.location.hostname === 'localhost')

        let isPlatformAvailable = false
        try {
          isPlatformAvailable =
            await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
          console.log('Platform authenticator available:', isPlatformAvailable)
        } catch (checkError) {
          console.warn('Could not check platform authenticator availability:', checkError)
        }

        const optionsResponse = await fetch('/api/user/mfa/webauthn/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!optionsResponse.ok) {
          throw new Error('Failed to get registration options')
        }

        const options = await readJson<PublicKeyCredentialCreationOptionsJSON>(optionsResponse)
        console.log('Received WebAuthn options:', options)
        console.log(
          'Challenge type:',
          typeof options.challenge,
          'Length:',
          options.challenge?.length
        )
        console.log('User ID type:', typeof options.user.id, 'Length:', options.user.id?.length)

        const userIdBuffer: BufferSource =
          typeof options.user.id === 'string'
            ? base64urlToArrayBuffer(options.user.id)
            : cloneBufferSource(options.user.id as ArrayBufferLike | Uint8Array)
        const challengeBuffer: BufferSource =
          typeof options.challenge === 'string'
            ? base64urlToArrayBuffer(options.challenge)
            : cloneBufferSource(options.challenge as ArrayBufferLike | Uint8Array)

        const credentialCreationOptions: PublicKeyCredentialCreationOptions = {
          rp: options.rp,
          user: {
            ...options.user,
            id: userIdBuffer,
          },
          challenge: challengeBuffer,
          pubKeyCredParams: options.pubKeyCredParams,
          timeout: Math.min(options.timeout || 60000, 60000), // Cap at 60 seconds
          attestation: 'none', // Use 'none' for better compatibility
          authenticatorSelection: {
            userVerification: 'discouraged', // Most compatible setting
            requireResidentKey: false,
            residentKey: 'discouraged',
          },
        }

        console.log('Final credential creation options:', credentialCreationOptions)

        const methodName = 'security key'
        const instructionText =
          "Please use Windows Hello, Touch ID, external key, or your device's built-in authenticator when prompted"

        toast.info(`Setting up ${methodName}. ${instructionText}`, { duration: 5000 })

        let credential: PublicKeyCredential | null = null

        try {
          console.log('Attempting WebAuthn credential creation...')
          credential = (await navigator.credentials.create({
            publicKey: credentialCreationOptions,
          })) as PublicKeyCredential

          console.log('WebAuthn credential created successfully:', credential?.id)
        } catch (webauthnError: any) {
          console.error('WebAuthn credential creation failed:', webauthnError)

          if (webauthnError.name === 'NotAllowedError') {
            throw new Error(
              'Security key registration was cancelled, timed out, or blocked. This could be due to Windows Hello setup issues, an unconnected security key, or browser restrictions. Please ensure your authenticator is ready and try again.'
            )
          } else if (webauthnError.name === 'InvalidStateError') {
            throw new Error(`This ${methodName} is already registered for your account.`)
          } else if (webauthnError.name === 'NotSupportedError') {
            throw new Error(`Your ${methodName} is not supported by this browser.`)
          } else if (webauthnError.name === 'ConstraintError') {
            throw new Error(`The ${methodName} does not meet the security requirements.`)
          } else {
            throw new Error(
              `Failed to create ${methodName}: ${webauthnError.message || 'Unknown error occurred'}`
            )
          }
        }

        if (!credential) {
          throw new Error('Failed to create credential - no credential returned')
        }

        const response = credential.response as AuthenticatorAttestationResponse

        console.log('Sending credential to server for verification...')
        const verifyResponse = await fetch('/api/user/mfa/webauthn/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            credential: {
              id: credential.id,
              rawId: arrayBufferToBase64url(cloneBufferSource(credential.rawId)),
              response: {
                attestationObject: arrayBufferToBase64url(
                  cloneBufferSource(response.attestationObject)
                ),
                clientDataJSON: arrayBufferToBase64url(cloneBufferSource(response.clientDataJSON)),
              },
              type: credential.type,
              clientExtensionResults: credential.getClientExtensionResults?.() || {},
            },
            method: mfaMethod,
          }),
        })

        if (verifyResponse.ok) {
          const data = await readJson<MfaBackupCodesResponse>(verifyResponse)
          setBackupCodes(data.backupCodes)
          setMfaEnabled(true)
          setSetupStep('backup')
          toast.success('Security key registered successfully!')
        } else {
          const errorData = await readJson<BasicApiResponse>(verifyResponse)
          throw new Error(errorData.error || 'Failed to register security key')
        }
      } else {
        const response = await fetch('/api/user/mfa/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: verificationCode,
            method: mfaMethod,
          }),
        })

        if (response.ok) {
          const data = await readJson<MfaBackupCodesResponse>(response)
          setBackupCodes(data.backupCodes)
          setMfaEnabled(true)
          setSetupStep('backup')
          toast.success('MFA setup completed successfully')
        } else {
          const errorData = await readJson<BasicApiResponse>(response)
          throw new Error(errorData.error || 'Invalid verification code')
        }
      }
    } catch (error: any) {
      console.error('Error verifying MFA setup:', error)

      toast.error(error.message || 'Failed to verify setup')
    } finally {
      setLoadingMfa(false)
    }
  }

  const completeMfaSetup = () => {
    setShowMfaSetup(false)
    setSetupStep('method')
    setVerificationCode('')
    setQrCodeUrl('')
    setManualEntryKey('')
    toast.success('MFA has been successfully enabled for your account')
  }

  const generateNewBackupCodes = async () => {
    setLoadingMfa(true)
    try {
      const response = await fetch('/api/user/mfa/backup-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await readJson<MfaBackupCodesResponse>(response)
        setBackupCodes(data.backupCodes)
        toast.success('New backup codes generated successfully')
      } else {
        throw new Error('Failed to generate backup codes')
      }
    } catch (error) {
      console.error('Error generating backup codes:', error)
      toast.error('Failed to generate backup codes')
    } finally {
      setLoadingMfa(false)
    }
  }

  const downloadBackupCodes = () => {
    const codesText = backupCodes.join('\n')
    const blob = new Blob(
      [
        `The Everything Assistant - MFA Backup Codes\nGenerated: ${new Date().toLocaleString()}\n\nKeep these codes safe and secure:\n\n${codesText}\n\nEach code can only be used once.`,
      ],
      {
        type: 'text/plain',
      }
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `the-everything-assistant-backup-codes-${Date.now()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Backup codes downloaded')
  }

  const copyBackupCodes = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'))
      toast.success('Backup codes copied to clipboard')
    } catch (error) {
      toast.error('Failed to copy backup codes')
    }
  }

  const handleMfaMethodChange = async (method: 'email' | 'authenticator' | 'security_key') => {
    if (!mfaEnabled && setupStep === 'method') {
      setMfaMethod(method)
      return
    }

    if (!mfaEnabled) {
      setMfaMethod(method)
      return
    }

    setLoadingMfa(true)
    try {
      const response = await fetch('/api/user/mfa/method', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newMethod: method,
        }),
      })

      if (response.ok) {
        const data = await readJson<MfaMethodChangeResponse>(response)

        if (data.requiresRegistration && method === 'security_key') {
          setMfaMethod(method)
          setShowMfaSetup(true)
          setSetupStep('verify')
          toast.success(data.message || 'Please register your security key')
        } else {
          setMfaMethod(method)
          toast.success(data.message || 'MFA method updated successfully')
        }
      } else {
        const errorData = await readJson<BasicApiResponse>(response)
        throw new Error(errorData.error || 'Failed to update MFA method')
      }
    } catch (error: any) {
      console.error('Error updating MFA method:', error)
      toast.error(error.message || 'Failed to update MFA method')
    } finally {
      setLoadingMfa(false)
    }
  }

  const menuItems = [
    { id: 'general', label: 'general', icon: Settings },
    { id: 'personalization', label: 'personalization', icon: User },
    { id: 'vtop', label: 'VTOP integration', icon: Key },
    { id: 'data', label: 'data controls', icon: Archive },
    { id: 'security', label: 'security', icon: Shield },
    { id: 'onboarding', label: 'view tutorial', icon: Zap },
    { id: 'memories', label: 'memories', icon: Brain },
    { id: 'feedback', label: 'feedback', icon: MessageSquarePlus },
  ]
  const themeOptions = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor },
  ]

  const handleDeleteAllChats = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }

    setIsDeleting(true)
    setConfirmDelete(false)
    try {
      const response = await fetch('/api/chats?action=delete-all', {
        method: 'DELETE',
      })
      if (response.ok) {
        const result = await readJson<ChatActionResponse>(response)
        window.dispatchEvent(new CustomEvent('chatsDeleted', { detail: result }))
        toast.success(`${result.count ?? 0} chats deleted successfully`)
        onOpenChange(false)
      } else {
        throw new Error('Failed to delete chats')
      }
    } catch (error) {
      console.error('Error deleting chats:', error)
      toast.error('Failed to delete chats. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }
  const handleArchiveAllChats = async () => {
    if (!confirmArchive) {
      setConfirmArchive(true)
      setTimeout(() => setConfirmArchive(false), 3000)
      return
    }

    setIsArchiving(true)
    setConfirmArchive(false)
    try {
      const response = await fetch('/api/chats?action=archive-all', {
        method: 'PATCH',
      })
      if (response.ok) {
        const result = await readJson<ChatActionResponse>(response)
        window.dispatchEvent(new CustomEvent('chatsArchived', { detail: result }))
        toast.success(`${result.count ?? 0} chats archived successfully`)
        onOpenChange(false)
      } else {
        throw new Error('Failed to archive chats')
      }
    } catch (error) {
      console.error('Error archiving chats:', error)
      toast.error('Failed to archive chats. Please try again.')
    } finally {
      setIsArchiving(false)
    }
  }

  const handleManageArchivedChats = async () => {
    setShowArchivedChats(true)
    setLoadingArchived(true)

    try {
      const response = await fetch('/api/chats?archived=true&limit=50')
      if (response.ok) {
        const chats = await readJson<ChatSummary[]>(response)
        setArchivedChats(chats)
      }
    } catch (error) {
      console.error('Error fetching archived chats:', error)
    } finally {
      setLoadingArchived(false)
    }
  }
  const handleRestoreChat = async (chatId: string) => {
    setRestoringChats(prev => new Set([...prev, chatId]))
    try {
      const response = await fetch(`/api/chats/${chatId}?action=restore`, {
        method: 'PATCH',
      })

      if (response.ok) {
        setArchivedChats(prev => prev.filter(chat => chat.id !== chatId))
        window.dispatchEvent(new CustomEvent('chatsArchived'))
        toast.success('Chat restored successfully')
      } else {
        throw new Error('Failed to restore chat')
      }
    } catch (error) {
      console.error('Error restoring chat:', error)
      toast.error('Failed to restore chat. Please try again.')
    } finally {
      setRestoringChats(prev => {
        const newSet = new Set(prev)
        newSet.delete(chatId)
        return newSet
      })
    }
  }

  const handleDeleteAllArchivedChats = async () => {
    if (!confirmDeleteArchived) {
      setConfirmDeleteArchived(true)
      setTimeout(() => setConfirmDeleteArchived(false), 3000)
      return
    }

    setIsDeletingArchived(true)
    setConfirmDeleteArchived(false)
    try {
      const response = await fetch('/api/chats?action=delete-archived', {
        method: 'DELETE',
      })
      if (response.ok) {
        const result = await readJson<ChatActionResponse>(response)
        setArchivedChats([])
        toast.success(`${result.count ?? 0} archived chats deleted successfully`)
      } else {
        throw new Error('Failed to delete archived chats')
      }
    } catch (error) {
      console.error('Error deleting archived chats:', error)
      toast.error('Failed to delete archived chats. Please try again.')
    } finally {
      setIsDeletingArchived(false)
    }
  }

  const [deletingAccount, setDeletingAccount] = useState(false)
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false)

  const handleDeleteAccount = async () => {
    if (!confirmDeleteAccount) {
      setConfirmDeleteAccount(true)
      setTimeout(() => setConfirmDeleteAccount(false), 3000)
      return
    }
    setDeletingAccount(true)
    setConfirmDeleteAccount(false)
    try {
      await deleteAccountAction()
      toast.success('account deleted ΓÇö signing you out')
      await signOut({ callbackUrl: '/login' })
    } catch (error: any) {
      console.error('failed to delete account', error)
      toast.error(error?.message || 'failed to delete account')
    } finally {
      setDeletingAccount(false)
    }
  }

  const renderContent = () => {
    switch (activeSection) {
      case 'general':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg md:text-xl font-semibold mb-4">general settings</h3>

              <div className="space-y-4">
                <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/10">
                  <h4 className="font-semibold text-base">chat features</h4>

                  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
                    <div className="space-y-0.5">
                      <Label htmlFor="follow-up-suggestions" className="text-sm md:text-base">
                        follow-up suggestions
                      </Label>
                      <p className="text-xs md:text-sm text-muted-foreground">
                        get AI-suggested follow-up questions
                      </p>
                    </div>
                    <Switch
                      id="follow-up-suggestions"
                      checked={followUpSuggestions}
                      onCheckedChange={handleFollowUpSuggestionsChange}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
                    <div className="space-y-0.5">
                      <Label htmlFor="memory-enabled" className="text-sm md:text-base">
                        memory & context
                      </Label>
                      <p className="text-xs md:text-sm text-muted-foreground">
                        remember conversation details for better context
                      </p>
                    </div>
                    <Switch
                      id="memory-enabled"
                      checked={memoryEnabled}
                      onCheckedChange={handleMemoryToggle}
                    />
                  </div>
                </div>

                <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/10">
                  <h4 className="font-semibold text-base">daily briefing</h4>
                  <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label htmlFor="briefing-time" className="text-sm md:text-base">
                          auto end time
                        </Label>
                        <p className="text-xs md:text-sm text-muted-foreground">
                          briefing closes automatically after this time every morning
                        </p>
                      </div>
                      <input
                        id="briefing-time"
                        type="time"
                        value={dailyBriefingSettings.dismissTime}
                        onChange={e =>
                          handleBriefingSettingsUpdate({ dismissTime: e.target.value })
                        }
                        disabled={updatingBriefing}
                        className="h-10 rounded-md border border-border bg-muted/40 px-3 text-sm text-foreground"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
                    <div className="space-y-0.5">
                      <Label htmlFor="briefing-email" className="text-sm md:text-base">
                        email summary
                      </Label>
                      <p className="text-xs md:text-sm text-muted-foreground">
                        send the briefing to your inbox when it ends
                      </p>
                    </div>
                    <Switch
                      id="briefing-email"
                      checked={dailyBriefingSettings.emailEnabled}
                      disabled={updatingBriefing}
                      onCheckedChange={checked =>
                        handleBriefingSettingsUpdate({ emailEnabled: checked })
                      }
                    />
                  </div>
                  {dailyBriefingSettings.emailEnabled && (
                    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
                      <div className="space-y-0.5">
                        <Label htmlFor="briefing-email-time" className="text-sm md:text-base">
                          email send time
                        </Label>
                        <p className="text-xs md:text-sm text-muted-foreground">
                          usually the same as dismiss time, customize if needed
                        </p>
                      </div>
                      <input
                        id="briefing-email-time"
                        type="time"
                        value={dailyBriefingSettings.emailTime}
                        onChange={e => handleBriefingSettingsUpdate({ emailTime: e.target.value })}
                        disabled={updatingBriefing}
                        className="h-10 rounded-md border border-border bg-muted/40 px-3 text-sm text-foreground"
                      />
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!dailyBriefingSettings.emailEnabled || sendingTestBriefing}
                      onClick={handleSendTestBriefing}
                      className="rounded-full"
                    >
                      {sendingTestBriefing && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
                      send test briefing
                    </Button>
                  </div>
                </div>
                <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/10">
                  <h4 className="font-semibold text-base">account</h4>
                  <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-destructive/10 text-destructive p-3">
                        <Trash2 className="h-4 w-4" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-semibold text-sm md:text-base">delete account</p>
                        <p className="text-xs md:text-sm text-muted-foreground">
                          permanently delete your account and all data
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deletingAccount}
                      onClick={handleDeleteAccount}
                      className={cn(
                        'w-full sm:w-auto',
                        confirmDeleteAccount ? 'bg-red-600 hover:bg-red-700' : ''
                      )}
                    >
                      {deletingAccount ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> deletingΓÇª
                        </>
                      ) : confirmDeleteAccount ? (
                        'confirm delete?'
                      ) : (
                        'delete my account'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>{' '}
          </div>
        )

      case 'appearance':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg md:text-xl font-semibold mb-4">theme</h3>

              <div className="space-y-3">
                {themeOptions.map(option => {
                  const Icon = option.icon
                  return (
                    <button
                      key={option.id}
                      onClick={() => setTheme(option.id)}
                      className={cn(
                        'w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-sm md:text-base',
                        theme === option.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/50'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span>{option.label}</span>
                      </div>
                      {theme === option.id && (
                        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )

      case 'language':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg md:text-xl font-semibold mb-4">language</h3>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                <span className="text-sm md:text-base">auto-detect</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </div>
            </div>
          </div>
        )

      case 'data':
        return (
          <div className={cn('space-y-6', showArchivedChats && 'h-full flex flex-col')}>
            <div className={showArchivedChats ? 'flex-1 flex flex-col' : ''}>
              <h3 className="text-lg md:text-xl font-semibold mb-4">data controls</h3>
              <div className={cn('space-y-4', showArchivedChats && 'flex-1 flex flex-col')}>
                {!showArchivedChats ? (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border border-border">
                      <div className="flex items-start sm:items-center gap-3">
                        <Archive className="w-4 h-4 flex-shrink-0 mt-0.5 sm:mt-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm md:text-base">archived chats</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            manage your archived conversations
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleManageArchivedChats}
                        className="w-full sm:w-auto flex-shrink-0"
                      >
                        manage
                      </Button>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border border-border">
                      <div className="flex items-start sm:items-center gap-3">
                        <Archive className="w-4 h-4 flex-shrink-0 mt-0.5 sm:mt-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm md:text-base">archive all chats</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            move all conversations to archive
                          </p>
                        </div>
                      </div>{' '}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleArchiveAllChats}
                        disabled={isArchiving}
                        className={cn(
                          'w-full sm:w-auto flex-shrink-0',
                          confirmArchive
                            ? 'bg-orange-500/10 border-orange-500/30 text-orange-600'
                            : ''
                        )}
                      >
                        {isArchiving ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            archiving...
                          </>
                        ) : confirmArchive ? (
                          'confirm?'
                        ) : (
                          'archive all'
                        )}
                      </Button>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border border-destructive/20">
                      <div className="flex items-start sm:items-center gap-3">
                        <Trash2 className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5 sm:mt-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm md:text-base">delete all chats</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            permanently delete all conversations
                          </p>
                        </div>
                      </div>{' '}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDeleteAllChats}
                        disabled={isDeleting}
                        className={cn(
                          'w-full sm:w-auto flex-shrink-0',
                          confirmDelete ? 'bg-red-600 hover:bg-red-700' : ''
                        )}
                      >
                        {isDeleting ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            deleting...
                          </>
                        ) : confirmDelete ? (
                          'confirm?'
                        ) : (
                          'delete all'
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col h-full space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-border">
                      <h4 className="font-medium text-lg">archived chats</h4>
                      <div className="flex gap-2">
                        {archivedChats.length > 0 && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleDeleteAllArchivedChats}
                            disabled={isDeletingArchived}
                            className={cn(
                              'flex-shrink-0',
                              confirmDeleteArchived ? 'bg-red-600 hover:bg-red-700' : ''
                            )}
                          >
                            {isDeletingArchived ? (
                              <>
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                deleting...
                              </>
                            ) : confirmDeleteArchived ? (
                              'confirm delete all?'
                            ) : (
                              <>
                                <Trash2 className="w-3 h-3 mr-1" />
                                delete all
                              </>
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowArchivedChats(false)}
                          className="flex-shrink-0"
                        >
                          back
                        </Button>
                      </div>
                    </div>

                    {loadingArchived ? (
                      <div className="flex items-center justify-center flex-1 min-h-[200px]">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    ) : archivedChats.length === 0 ? (
                      <div className="flex items-center justify-center flex-1 min-h-[200px] text-muted-foreground">
                        <div className="text-center">
                          <Archive className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p className="font-medium mb-1 text-sm md:text-base">
                            no archived chats found
                          </p>
                          <p className="text-xs md:text-sm">
                            archived conversations will appear here
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                        <div className="grid gap-2">
                          {archivedChats.map(chat => (
                            <div
                              key={chat.id}
                              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate text-sm md:text-base mb-1">
                                  {chat.title}
                                </p>
                                <div className="flex items-center gap-4 text-xs md:text-sm text-muted-foreground">
                                  <span>
                                    Created: {new Date(chat.createdAt).toLocaleDateString()}
                                  </span>
                                  <span>
                                    Archived: {new Date(chat.updatedAt).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRestoreChat(chat.id)}
                                disabled={restoringChats.has(chat.id)}
                                className="w-full sm:w-auto flex-shrink-0"
                              >
                                {restoringChats.has(chat.id) ? (
                                  <>
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                    restoring...
                                  </>
                                ) : (
                                  'restore'
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )

      case 'personalization':
        const backgroundOptions: Array<{
          type: SelectableBackgroundType
          name: string
          description: string
        }> = [
          {
            type: 'aurora',
            name: 'aurora',
            description: 'animated aurora borealis effect with flowing colors',
          },
          {
            type: 'beams',
            name: 'light beams',
            description: 'dynamic light beams with subtle animations',
          },
          {
            type: 'dither',
            name: 'dither',
            description: 'retro dithered waves with pixel art aesthetics',
          },
          {
            type: 'floating-lines',
            name: 'floating lines',
            description: 'high-energy neon lines with parallax and bend effects',
          },
          {
            type: 'terminal',
            name: 'faulty terminal',
            description: 'retro CRT matrix with scanlines and glitches',
          },
          {
            type: 'grid',
            name: 'reactive grid',
            description: '3D neon scanning grid with motion parallax',
          },
          {
            type: 'color-bands',
            name: 'color bands',
            description: 'shimmering ribbon gradients with warp and parallax',
          },
          {
            type: 'gradient',
            name: 'gradient',
            description: 'smooth color gradient background',
          },
          {
            type: 'solid',
            name: 'lights out',
            description: 'what it says',
          },
        ]

        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg md:text-xl font-semibold mb-4">personalization</h3>

              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-4">
                    <Palette className="w-5 h-5 text-primary" />
                    <h4 className="font-semibold text-base">custom backgrounds</h4>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border border-border">
                    <div className="space-y-0.5">
                      <Label htmlFor="background-enabled" className="text-sm md:text-base">
                        enable custom backgrounds
                      </Label>
                      <p className="text-xs md:text-sm text-muted-foreground">
                        show animated background effects throughout the app
                      </p>
                    </div>
                    <Switch
                      id="background-enabled"
                      checked={backgroundConfig.enabled}
                      onCheckedChange={handleBackgroundToggle}
                      disabled={loadingPreferences}
                      className="flex-shrink-0"
                    />
                  </div>

                  {backgroundConfig.enabled && (
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">background style</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {backgroundOptions.map(option => (
                          <button
                            key={option.type}
                            onClick={() => handleBackgroundTypeChange(option.type)}
                            disabled={loadingPreferences}
                            className={cn(
                              'relative p-4 rounded-lg border-2 text-left transition-all duration-200',
                              'hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20',
                              backgroundConfig.type === option.type
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:bg-muted/50'
                            )}
                          >
                            <div className="mb-3 border border-border/50 rounded-md overflow-hidden">
                              <BackgroundPreview type={option.type} />
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h5 className="font-medium text-sm">{option.name}</h5>
                                {backgroundConfig.type === option.type && (
                                  <div className="w-2 h-2 rounded-full bg-primary" />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {option.description}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )

      case 'security':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg md:text-xl font-semibold mb-4">security</h3>

              <div className="space-y-4">
                <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/10">
                  <div className="flex items-center gap-3">
                    <Key className="w-5 h-5 text-primary" />
                    <h4 className="font-semibold text-base">multi-factor authentication</h4>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border border-border bg-background">
                    <div className="space-y-0.5">
                      <Label htmlFor="mfa-enabled" className="text-sm md:text-base">
                        enable two-factor authentication
                      </Label>
                      <p className="text-xs md:text-sm text-muted-foreground">
                        add an extra layer of security to your account
                      </p>
                    </div>
                    <Switch
                      id="mfa-enabled"
                      checked={mfaEnabled}
                      onCheckedChange={handleMfaToggle}
                      disabled={loadingMfa}
                      className="flex-shrink-0"
                    />
                  </div>

                  {(mfaEnabled || showMfaSetup) && (
                    <div className="space-y-4">
                      {!showMfaSetup ? (
                        <>
                          <div className="space-y-3">
                            <Label className="text-sm font-medium">
                              current method:{' '}
                              {mfaMethod === 'email'
                                ? 'email verification'
                                : mfaMethod === 'authenticator'
                                  ? 'authenticator app'
                                  : 'security key'}
                            </Label>

                            <div className="space-y-2">
                              {mfaAvailability.email && (
                                <button
                                  onClick={() => handleMfaMethodChange('email')}
                                  disabled={loadingMfa}
                                  className={cn(
                                    'w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-sm md:text-base',
                                    mfaMethod === 'email'
                                      ? 'border-primary bg-primary/5'
                                      : 'border-border hover:bg-muted/50'
                                  )}
                                >
                                  <div className="flex items-center gap-3">
                                    <Mail className="w-4 h-4 flex-shrink-0" />
                                    <div className="text-left">
                                      <div className="font-medium">email verification</div>
                                      <div className="text-xs text-muted-foreground">
                                        receive codes via email
                                      </div>
                                    </div>
                                  </div>
                                  {mfaMethod === 'email' && (
                                    <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                                  )}
                                </button>
                              )}

                              <button
                                onClick={() => handleMfaMethodChange('authenticator')}
                                disabled={loadingMfa}
                                className={cn(
                                  'w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-sm md:text-base',
                                  mfaMethod === 'authenticator'
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:bg-muted/50'
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <Smartphone className="w-4 h-4 flex-shrink-0" />
                                  <div className="text-left">
                                    <div className="font-medium">authenticator app</div>
                                    <div className="text-xs text-muted-foreground">
                                      use google authenticator or similar
                                    </div>
                                  </div>
                                </div>
                                {mfaMethod === 'authenticator' && (
                                  <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                                )}
                              </button>

                              {mfaAvailability.security_key && (
                                <button
                                  onClick={() => handleMfaMethodChange('security_key')}
                                  disabled={loadingMfa}
                                  className={cn(
                                    'w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-sm md:text-base',
                                    mfaMethod === 'security_key'
                                      ? 'border-primary bg-primary/5'
                                      : 'border-border hover:bg-muted/50'
                                  )}
                                >
                                  <div className="flex items-center gap-3">
                                    <Fingerprint className="w-4 h-4 flex-shrink-0" />
                                    <div className="text-left">
                                      <div className="font-medium">security key</div>
                                      <div className="text-xs text-muted-foreground">
                                        use FIDO2/WebAuthn hardware key
                                      </div>
                                    </div>
                                  </div>
                                  {mfaMethod === 'security_key' && (
                                    <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>


                          <div className="space-y-3 p-3 rounded-lg border border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-950/20">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-sm font-medium">backup codes</Label>
                                <p className="text-xs text-muted-foreground">
                                  {backupCodes.length} codes available
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowBackupCodes(!showBackupCodes)}
                              >
                                {showBackupCodes ? 'hide' : 'manage'}
                              </Button>
                            </div>

                            {showBackupCodes && (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400">
                                  <Key className="w-3 h-3" />
                                  <span>keep these codes safe - each can only be used once</span>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">your backup codes</span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        setShowBackupCodesReveal(!showBackupCodesReveal)
                                      }
                                      className="h-6 px-2"
                                    >
                                      {showBackupCodesReveal ? (
                                        <EyeOff className="w-3 h-3" />
                                      ) : (
                                        <Eye className="w-3 h-3" />
                                      )}
                                    </Button>
                                  </div>

                                  {showBackupCodesReveal && (
                                    <div className="grid grid-cols-2 gap-2 p-3 bg-background rounded border font-mono text-xs">
                                      {backupCodes.map((code, index) => (
                                        <div key={index} className="text-center py-1">
                                          {code}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={downloadBackupCodes}
                                    className="flex-1"
                                  >
                                    <Download className="w-3 h-3 mr-1" />
                                    download
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={copyBackupCodes}
                                    className="flex-1"
                                  >
                                    <Copy className="w-3 h-3 mr-1" />
                                    copy
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={generateNewBackupCodes}
                                    disabled={loadingMfa}
                                    className="flex-1"
                                  >
                                    {loadingMfa ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      'regenerate'
                                    )}
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="space-y-4">
                          {setupStep === 'method' && (
                            <>
                              <Label className="text-sm font-medium">
                                choose authentication method
                              </Label>
                              <div className="space-y-2">
                                {mfaAvailability.email && (
                                  <button
                                    onClick={() => handleMfaMethodChange('email')}
                                    disabled={loadingMfa}
                                    className={cn(
                                      'w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-sm md:text-base',
                                      mfaMethod === 'email'
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border hover:bg-muted/50'
                                    )}
                                  >
                                    <div className="flex items-center gap-3">
                                      <Mail className="w-4 h-4 flex-shrink-0" />
                                      <div className="text-left">
                                        <div className="font-medium">email verification</div>
                                        <div className="text-xs text-muted-foreground">
                                          receive codes via email
                                        </div>
                                      </div>
                                    </div>
                                    {mfaMethod === 'email' && (
                                      <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                                    )}
                                  </button>
                                )}

                                {!mfaAvailability.email && (
                                  <div className="p-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20">
                                    <div className="flex items-center gap-3">
                                      <Mail className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                                      <div className="text-left">
                                        <div className="font-medium text-muted-foreground">
                                          email verification
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          unavailable
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                <button
                                  onClick={() => handleMfaMethodChange('authenticator')}
                                  disabled={loadingMfa}
                                  className={cn(
                                    'w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-sm md:text-base',
                                    mfaMethod === 'authenticator'
                                      ? 'border-primary bg-primary/5'
                                      : 'border-border hover:bg-muted/50'
                                  )}
                                >
                                  <div className="flex items-center gap-3">
                                    <Smartphone className="w-4 h-4 flex-shrink-0" />
                                    <div className="text-left">
                                      <div className="font-medium">authenticator app</div>
                                      <div className="text-xs text-muted-foreground">
                                        use google authenticator or similar
                                      </div>
                                    </div>
                                  </div>
                                  {mfaMethod === 'authenticator' && (
                                    <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                                  )}
                                </button>

                                {mfaAvailability.security_key && (
                                  <button
                                    onClick={() => handleMfaMethodChange('security_key')}
                                    disabled={loadingMfa}
                                    className={cn(
                                      'w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-sm md:text-base',
                                      mfaMethod === 'security_key'
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border hover:bg-muted/50'
                                    )}
                                  >
                                    <div className="flex items-center gap-3">
                                      <Fingerprint className="w-4 h-4 flex-shrink-0" />
                                      <div className="text-left">
                                        <div className="font-medium">security key</div>
                                        <div className="text-xs text-muted-foreground">
                                          use FIDO2/WebAuthn hardware key
                                        </div>
                                      </div>
                                    </div>
                                    {mfaMethod === 'security_key' && (
                                      <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                                    )}
                                  </button>
                                )}
                              </div>

                              <div className="flex gap-2 pt-2">
                                <Button
                                  onClick={initiateMfaSetup}
                                  disabled={loadingMfa}
                                  size="sm"
                                  className="flex-1"
                                >
                                  {loadingMfa ? (
                                    <>
                                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                      setting up...
                                    </>
                                  ) : (
                                    'continue'
                                  )}
                                </Button>
                                <Button
                                  onClick={() => setShowMfaSetup(false)}
                                  variant="outline"
                                  size="sm"
                                  className="flex-1"
                                >
                                  cancel
                                </Button>
                              </div>
                            </>
                          )}

                          {setupStep === 'verify' && (
                            <>
                              {mfaMethod === 'authenticator' && (
                                <div className="space-y-4">
                                  <div className="text-center space-y-3">
                                    <h4 className="font-medium">scan qr code</h4>
                                    <p className="text-sm text-muted-foreground">
                                      scan this qr code with your authenticator app
                                    </p>

                                    {qrCodeUrl && (
                                      <div className="flex justify-center">
                                        <div className="p-4 bg-white rounded-lg">
                                          <img
                                            src={qrCodeUrl}
                                            alt="QR Code"
                                            className="w-48 h-48"
                                          />
                                        </div>
                                      </div>
                                    )}

                                    <details className="text-left">
                                      <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                                        can't scan? enter manually
                                      </summary>
                                      <div className="mt-2 p-3 bg-muted rounded text-xs font-mono break-all">
                                        {manualEntryKey}
                                      </div>
                                    </details>
                                  </div>
                                </div>
                              )}

                              {mfaMethod === 'email' && (
                                <div className="space-y-3 text-center">
                                  <h4 className="font-medium">check your email</h4>
                                  <p className="text-sm text-muted-foreground">
                                    we've sent a verification code to your email address
                                  </p>
                                </div>
                              )}

                              {mfaMethod === 'security_key' && (
                                <div className="space-y-3 text-center">
                                  <div className="flex justify-center mb-3">
                                    <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-full">
                                      <Fingerprint className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                                    </div>
                                  </div>
                                  <h4 className="font-medium">register your security key</h4>
                                  <p className="text-sm text-muted-foreground">
                                    click the button below and follow your browser's prompts to
                                    register your security key
                                  </p>
                                  <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
                                    make sure your security key is connected and ready
                                  </div>
                                </div>
                              )}

                              {mfaMethod !== 'security_key' && (
                                <div className="space-y-3">
                                  <Label className="text-sm font-medium">
                                    enter verification code
                                  </Label>
                                  <input
                                    type="text"
                                    value={verificationCode}
                                    onChange={e => setVerificationCode(e.target.value)}
                                    placeholder="000000"
                                    className="w-full px-3 py-2 text-center text-lg font-mono tracking-widest border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                    maxLength={6}
                                  />
                                </div>
                              )}

                              <div className="flex gap-2">
                                <Button
                                  onClick={verifyMfaSetup}
                                  disabled={
                                    loadingMfa ||
                                    (mfaMethod !== 'security_key' && !verificationCode.trim())
                                  }
                                  size="sm"
                                  className="flex-1"
                                >
                                  {loadingMfa ? (
                                    <>
                                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                      {mfaMethod === 'security_key'
                                        ? 'registering...'
                                        : 'verifying...'}
                                    </>
                                  ) : mfaMethod === 'security_key' ? (
                                    'register security key'
                                  ) : (
                                    'verify'
                                  )}
                                </Button>
                                <Button
                                  onClick={() => {
                                    setSetupStep('method')
                                    setVerificationCode('')
                                  }}
                                  variant="outline"
                                  size="sm"
                                  className="flex-1"
                                >
                                  back
                                </Button>
                              </div>
                            </>
                          )}

                          {setupStep === 'backup' && (
                            <div className="space-y-4">
                              <div className="text-center space-y-2">
                                <h4 className="font-medium text-green-600">
                                  mfa enabled successfully!
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  save these backup codes in a secure location
                                </p>
                              </div>

                              <div className="space-y-3 p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800">
                                <div className="flex items-center gap-2 text-sm font-medium text-orange-600 dark:text-orange-400">
                                  <Key className="w-4 h-4" />
                                  backup codes
                                </div>
                                <p className="text-xs text-orange-600 dark:text-orange-400">
                                  each code can only be used once. store them safely!
                                </p>

                                <div className="grid grid-cols-2 gap-2 p-3 bg-background rounded border font-mono text-xs">
                                  {backupCodes.map((code, index) => (
                                    <div key={index} className="text-center py-1">
                                      {code}
                                    </div>
                                  ))}
                                </div>

                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={downloadBackupCodes}
                                    className="flex-1"
                                  >
                                    <Download className="w-3 h-3 mr-1" />
                                    download
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={copyBackupCodes}
                                    className="flex-1"
                                  >
                                    <Copy className="w-3 h-3 mr-1" />
                                    copy
                                  </Button>
                                </div>
                              </div>

                              <Button onClick={completeMfaSetup} size="sm" className="w-full">
                                finish setup
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>


                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border border-border">
                  <div className="flex items-start sm:items-center gap-3">
                    <LogOut className="w-4 h-4 flex-shrink-0 mt-0.5 sm:mt-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm md:text-base">log out on this device</p>
                      <p className="text-xs md:text-sm text-muted-foreground">
                        sign out of your account
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => signOut()}
                    className="w-full sm:w-auto flex-shrink-0"
                  >
                    log out
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )

      case 'feedback':
        return <FeedbackSection />

      case 'onboarding':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg md:text-xl font-semibold mb-4">tutorial</h3>
              <p className="text-muted-foreground text-sm md:text-base mb-6">
                take a tour of all the features and learn how to get the most out of your assistant.
              </p>{' '}
              <Button
                onClick={() => {
                  onTriggerOnboarding?.()
                  window.dispatchEvent(new CustomEvent('triggerOnboarding'))
                  onOpenChange(false)
                }}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
              >
                <Zap className="w-4 h-4 mr-2" />
                start tutorial
              </Button>
            </div>
          </div>
        )

      case 'memories':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg md:text-xl font-semibold mb-4">memory management</h3>
              <div className="border border-border/60 rounded-lg p-4 bg-background">
                <MemoryManagement />
              </div>
            </div>
          </div>
        )

      case 'vtop':
        return (
          <div className="space-y-6">
            <div>
              <VTOPSettings />
            </div>
          </div>
        )

      default:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg md:text-xl font-semibold mb-4">{activeSection}</h3>
              <p className="text-muted-foreground text-sm md:text-base">
                this section is coming soon.
              </p>
            </div>
          </div>
        )
    }
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0]
    const scrollContainer = e.currentTarget
    setTouchStartY(touch.clientY)
    setTouchStartScrollTop(scrollContainer.scrollTop)
    setIsDragging(true)
  }
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging) return
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    setIsDragging(false)
  }

  useEffect(() => {
    setConfirmDelete(false)
    setConfirmArchive(false)
  }, [activeSection])
  useEffect(() => {
    const handleOpenSettings = (event: CustomEvent) => {
      const { section } = event.detail || {}
      if (section === 'feedback') {
        onOpenChange(true)
        setTimeout(() => setActiveSection('feedback'), 50)
      }
    }

    window.addEventListener('openSettings', handleOpenSettings as EventListener)

    return () => {
      window.removeEventListener('openSettings', handleOpenSettings as EventListener)
    }
  }, [onOpenChange])

  useEffect(() => {
    if (!open) {
      setConfirmDelete(false)
      setConfirmArchive(false)
      setConfirmDeleteArchived(false)
      setShowArchivedChats(false)
      setRestoringChats(new Set())
      setShowMfaSetup(false)
      setSetupStep('method')
      setVerificationCode('')
      setShowBackupCodes(false)
      setShowBackupCodesReveal(false)
    } else if (activeSection !== 'general') {
      setActiveSection('general')
    }
  }, [open])

  useEffect(() => {
    if (open) {
      setSidebarOpen(false)
    }
  }, [open, setSidebarOpen])

  const renderNavigation = (variant: 'desktop' | 'mobile') => (
    <nav className={variant === 'desktop' ? 'space-y-1' : 'space-y-3'}>
      <div
        className={cn(
          'grid grid-cols-2',
          variant === 'desktop' ? 'gap-1 md:grid-cols-1 md:gap-1' : 'gap-2'
        )}
      >
        {menuItems.map((item: { id: string; label: string; icon: any }) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={cn(
                'w-full flex flex-col md:flex-row items-center md:gap-3 gap-1 px-2 md:px-3 py-3 md:py-2 rounded-lg text-xs md:text-sm transition-colors text-center md:text-left',
                variant === 'mobile' && 'flex-row gap-2 px-3 text-sm',
                activeSection === item.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )

  const renderMainContent = (className?: string) => (
    <div className={cn('p-4 md:p-6', className)}>
      <motion.div
        key={activeSection}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
      >
        {renderContent()}
      </motion.div>
    </div>
  )

  return (
    <>
      <Dialog open={isDesktop && open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl w-[95vw] h-[calc(var(--vh,1vh)*90)] md:h-[90vh] max-h-[800px] p-0 gap-0 bg-background border border-border overflow-hidden rounded-xl">
          <VisuallyHidden>
            <DialogTitle>settings</DialogTitle>
          </VisuallyHidden>
          <div className="flex flex-col md:flex-row h-full rounded-xl overflow-hidden">
            <div className="block md:hidden border-b border-border bg-muted/20 p-4 flex-shrink-0">
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold">settings</DialogTitle>
              </DialogHeader>
            </div>
            <div className="w-full md:w-72 border-r-0 md:border-r border-border bg-muted/20 p-4 md:p-6 transition-all duration-300 rounded-tl-xl md:rounded-bl-xl md:rounded-tl-xl rounded-tr-xl md:rounded-tr-none flex-shrink-0">
              <div className="hidden md:block">
                <DialogHeader className="mb-6">
                  <DialogTitle className="text-xl font-semibold">settings</DialogTitle>
                </DialogHeader>
              </div>
              {renderNavigation('desktop')}
            </div>
            <div
              className="flex-1 min-h-0 overflow-y-auto rounded-br-xl md:rounded-tr-xl rounded-bl-xl md:rounded-bl-none"
              data-allow-touch-scroll
              style={{
                overflow: 'auto',
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                position: 'relative',
                touchAction: 'pan-y',
                transform: 'translate3d(0, 0, 0)',
              }}
            >
              {renderMainContent()}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Drawer.Root open={!isDesktop && open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md sm:max-w-lg h-[min(calc(var(--app-viewport-height,100vh)*0.995),780px)] flex flex-col rounded-t-3xl border border-border/50 bg-background/95 shadow-2xl overflow-hidden">
            <Drawer.Handle className="mx-auto mt-3 mb-4 h-1.5 w-12 rounded-full bg-border/60" />
            <div className="px-4 pb-6 flex flex-1 flex-col gap-4 overflow-hidden" data-allow-touch-scroll>
              <div className="text-center">
                <p className="text-base font-semibold">settings</p>
                <p className="text-xs text-muted-foreground">personalize your assistant</p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-muted/20 p-3 max-h-48 overflow-y-auto" data-allow-touch-scroll>
                {renderNavigation('mobile')}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-border/50 bg-background" data-allow-touch-scroll>
                {renderMainContent('p-4')}
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
}
