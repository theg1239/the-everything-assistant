'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { motion } from 'framer-motion'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function SettingsDialog({ open, onOpenChange }: any) {
  const { data: session } = useSession()
  const [activeSection, setActiveSection] = useState('general')
  const [followUpSuggestions, setFollowUpSuggestions] = useState(true)
  const [auroraBackground, setAuroraBackground] = useState(true)
  const [theme, setTheme] = useState('system')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [showArchivedChats, setShowArchivedChats] = useState(false)
  const [archivedChats, setArchivedChats] = useState<any[]>([])
  const [loadingArchived, setLoadingArchived] = useState(false)
  const [restoringChats, setRestoringChats] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [loadingPreferences, setLoadingPreferences] = useState(false)

  useEffect(() => {
    const loadPreferences = async () => {
      if (!session?.user?.email) return

      setLoadingPreferences(true)
      try {
        const response = await fetch('/api/user/preferences')
        if (response.ok) {
          const data = await response.json()
          const prefs = data.preferences
          setFollowUpSuggestions(prefs.followUpSuggestions ?? true)
          setAuroraBackground(prefs.auroraBackground ?? true)
        }
      } catch (error) {
        console.error('Error loading preferences:', error)
      } finally {
        setLoadingPreferences(false)
      }
    }

    if (open && session?.user?.email) {
      loadPreferences()
    }
  }, [open, session?.user?.email])

  const savePreferences = async (newPreferences: any) => {
    if (!session?.user?.email) return

    try {
      const response = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferences: newPreferences,
        }),
      })

      if (response.ok) {
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
    await savePreferences({
      followUpSuggestions: checked,
      auroraBackground,
    })
  }

  const handleAuroraBackgroundChange = async (checked: boolean) => {
    setAuroraBackground(checked)
    await savePreferences({
      followUpSuggestions,
      auroraBackground: checked,
    })
    
    window.dispatchEvent(new CustomEvent('auroraToggle', { detail: { enabled: checked } }))
  }

  const menuItems = [
    { id: 'general', label: 'general', icon: Settings },
    { id: 'notifications', label: 'notifications', icon: Bell },
    { id: 'personalization', label: 'personalization', icon: User },
    // { id: 'appearance', label: 'appearance', icon: Palette },
    // { id: 'language', label: 'language', icon: Globe },
    { id: 'data', label: 'data controls', icon: Archive },
    { id: 'security', label: 'security', icon: Shield },
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
        const result = await response.json()
        window.dispatchEvent(new CustomEvent('chatsDeleted', { detail: result }))
        toast.success(`${result.count} chats deleted successfully`)
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
        const result = await response.json()
        window.dispatchEvent(new CustomEvent('chatsArchived', { detail: result }))
        toast.success(`${result.count} chats archived successfully`)
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
        const chats = await response.json()
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

  const renderContent = () => {
    switch (activeSection) {
      case 'general':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg md:text-xl font-semibold mb-4">general settings</h3>

              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border border-border">
                  <div className="space-y-0.5">
                    <Label htmlFor="follow-up" className="text-sm md:text-base">
                      show follow up suggestions in chats
                    </Label>
                    <p className="text-xs md:text-sm text-muted-foreground">
                      display suggested follow-up questions after AI responses
                    </p>
                  </div>
                  <Switch
                    id="follow-up"
                    checked={followUpSuggestions}
                    onCheckedChange={handleFollowUpSuggestionsChange}
                    disabled={loadingPreferences}
                    className="flex-shrink-0"
                  />
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
          <div className="space-y-6">
            <div>
              <h3 className="text-lg md:text-xl font-semibold mb-4">data controls</h3>
              <div className="space-y-4">
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
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <h4 className="font-medium text-sm md:text-base">archived chats</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowArchivedChats(false)}
                        className="w-full sm:w-auto"
                      >
                        back
                      </Button>
                    </div>

                    {loadingArchived ? (
                      <div className="flex items-center justify-center p-8">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    ) : archivedChats.length === 0 ? (
                      <div className="text-center p-8 text-muted-foreground">
                        <Archive className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p className="font-medium mb-1 text-sm md:text-base">
                          no archived chats found
                        </p>
                        <p className="text-xs md:text-sm">
                          archived conversations will appear here
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {archivedChats.map(chat => (
                          <div
                            key={chat.id}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border border-border"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate text-sm md:text-base">
                                {chat.title}
                              </p>
                              <p className="text-xs md:text-sm text-muted-foreground">
                                {new Date(chat.createdAt).toLocaleDateString()}
                              </p>
                            </div>{' '}
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
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )

      case 'personalization':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg md:text-xl font-semibold mb-4">personalization</h3>

              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border border-border">
                  <div className="space-y-0.5">
                    <Label htmlFor="aurora-bg" className="text-sm md:text-base">
                      aurora background effect
                    </Label>
                    <p className="text-xs md:text-sm text-muted-foreground">
                      display animated aurora background throughout the app
                    </p>
                  </div>
                  <Switch
                    id="aurora-bg"
                    checked={auroraBackground}
                    onCheckedChange={handleAuroraBackgroundChange}
                    disabled={loadingPreferences}
                    className="flex-shrink-0"
                  />
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

  useEffect(() => {
    setConfirmDelete(false)
    setConfirmArchive(false)
  }, [activeSection])
  useEffect(() => {
    if (!open) {
      setConfirmDelete(false)
      setConfirmArchive(false)
      setShowArchivedChats(false)
      setRestoringChats(new Set())
    } else {
      setActiveSection('general')
    }
  }, [open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] max-h-[800px] p-0 gap-0 bg-background border border-border overflow-hidden rounded-xl">
        <div className="flex flex-col md:flex-row h-full rounded-xl overflow-hidden">
          <div className="block md:hidden border-b border-border bg-muted/20 p-4 flex-shrink-0">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">settings</DialogTitle>
            </DialogHeader>
          </div>
          <div className="w-full md:w-72 border-r-0 md:border-r border-border bg-muted/20 p-4 md:p-6 transition-all duration-300 rounded-tl-xl md:rounded-bl-xl md:rounded-tl-xl rounded-tr-xl md:rounded-tr-none">
            <div className="hidden md:block">
              <DialogHeader className="mb-6">
                <DialogTitle className="text-xl font-semibold">settings</DialogTitle>
              </DialogHeader>
            </div>
            <nav className="space-y-1">
              <div className="grid grid-cols-2 gap-1 md:grid-cols-1 md:gap-1">
                {menuItems.map(item => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className={cn(
                        'w-full flex flex-col md:flex-row items-center md:gap-3 gap-1 px-2 md:px-3 py-3 md:py-2 rounded-lg text-xs md:text-sm transition-colors text-center md:text-left',
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
            </nav>{' '}
          </div>

          <div className="flex-1 p-4 md:p-6 overflow-y-auto rounded-br-xl md:rounded-tr-xl rounded-bl-xl md:rounded-bl-none">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
            >
              {renderContent()}
            </motion.div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
