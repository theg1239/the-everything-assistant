'use client'

import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { Drawer } from 'vaul'
import { useMediaQuery } from '@/hooks/use-media-query'
import { Plus, Trash2, Settings2, Globe, Zap, ExternalLink, ChevronDown, ChevronUp, Edit2, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  type MCPClientConfig,
  type MCPTransportType,
  getMCPConfigs,
  addMCPConfig,
  updateMCPConfig,
  removeMCPConfig,
  toggleMCPConfig,
} from '@/lib/mcp-config'

interface MCPConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfigsChange?: (configs: MCPClientConfig[]) => void
}

interface HeaderEntry {
  key: string
  value: string
}

export function MCPConfigDialog({ open, onOpenChange, onConfigsChange }: MCPConfigDialogProps) {
  const [configs, setConfigs] = useState<MCPClientConfig[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const inputStyles = 'h-10 rounded-lg border border-border/60 bg-background/70 text-sm focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/30'
  const headerInputStyles = 'h-9 rounded-lg border border-border/60 bg-background/60 text-xs focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/30'
  const selectTriggerStyles = 'h-10 rounded-lg border border-border/60 bg-background/70 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary/40'
  const cardStyles = 'rounded-2xl border border-border/60 bg-card/70 shadow-sm'
  
  // Form state
  const [name, setName] = useState('')
  const [transportType, setTransportType] = useState<MCPTransportType>('http')
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState<HeaderEntry[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  
  // Load configs on mount
  useEffect(() => {
    if (open) {
      setConfigs(getMCPConfigs())
    }
  }, [open])
  
  const resetForm = useCallback(() => {
    setName('')
    setTransportType('http')
    setUrl('')
    setHeaders([])
    setFormError(null)
    setIsAdding(false)
    setEditingId(null)
  }, [])
  
  const validateForm = (): boolean => {
    if (!name.trim()) {
      setFormError('name is required')
      return false
    }
    if (!url.trim()) {
      setFormError('url is required')
      return false
    }
    try {
      new URL(url)
    } catch {
      setFormError('invalid url format')
      return false
    }
    setFormError(null)
    return true
  }
  
  const handleAddConfig = () => {
    if (!validateForm()) return
    
    const headersObj: Record<string, string> = {}
    headers.forEach(h => {
      if (h.key.trim() && h.value.trim()) {
        headersObj[h.key.trim()] = h.value.trim()
      }
    })
    
    const newConfig = addMCPConfig({
      name: name.trim(),
      transportType,
      url: url.trim(),
      headers: Object.keys(headersObj).length > 0 ? headersObj : undefined,
      enabled: true,
    })
    
    const updatedConfigs = [...configs, newConfig]
    setConfigs(updatedConfigs)
    onConfigsChange?.(updatedConfigs)
    resetForm()
  }
  
  const handleUpdateConfig = (id: string) => {
    if (!validateForm()) return
    
    const headersObj: Record<string, string> = {}
    headers.forEach(h => {
      if (h.key.trim() && h.value.trim()) {
        headersObj[h.key.trim()] = h.value.trim()
      }
    })
    
    const updated = updateMCPConfig(id, {
      name: name.trim(),
      transportType,
      url: url.trim(),
      headers: Object.keys(headersObj).length > 0 ? headersObj : undefined,
    })
    
    if (updated) {
      const updatedConfigs = configs.map(c => c.id === id ? updated : c)
      setConfigs(updatedConfigs)
      onConfigsChange?.(updatedConfigs)
    }
    resetForm()
  }
  
  const handleDeleteConfig = (id: string) => {
    if (removeMCPConfig(id)) {
      const updatedConfigs = configs.filter(c => c.id !== id)
      setConfigs(updatedConfigs)
      onConfigsChange?.(updatedConfigs)
    }
  }
  
  const handleToggleConfig = (id: string) => {
    const updated = toggleMCPConfig(id)
    if (updated) {
      const updatedConfigs = configs.map(c => c.id === id ? updated : c)
      setConfigs(updatedConfigs)
      onConfigsChange?.(updatedConfigs)
    }
  }
  
  const startEditing = (config: MCPClientConfig) => {
    setEditingId(config.id)
    setName(config.name)
    setTransportType(config.transportType)
    setUrl(config.url)
    setHeaders(
      config.headers
        ? Object.entries(config.headers).map(([key, value]) => ({ key, value }))
        : []
    )
    setFormError(null)
  }
  
  const addHeaderEntry = () => {
    setHeaders([...headers, { key: '', value: '' }])
  }
  
  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const newHeaders = [...headers]
    newHeaders[index][field] = value
    setHeaders(newHeaders)
  }
  
  const removeHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index))
  }
  
  const renderForm = (isEdit: boolean = false, configId?: string) => (
    <div className={cn('space-y-4 p-4', cardStyles)}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium tracking-tight">{isEdit ? 'edit mcp server' : 'add new mcp server'}</h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetForm}
          className="h-8 w-8 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor="mcp-name" className="text-xs">server name</Label>
          <Input
            id="mcp-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my mcp server"
            className={inputStyles}
          />
        </div>
        
        <div className="grid gap-2">
          <Label htmlFor="mcp-transport" className="text-xs">transport type</Label>
          <Select value={transportType} onValueChange={(v) => setTransportType(v as MCPTransportType)}>
            <SelectTrigger id="mcp-transport" className={selectTriggerStyles}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="http">
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5" />
                  <span>http (recommended)</span>
                </div>
              </SelectItem>
              <SelectItem value="sse">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5" />
                  <span>sse (server-sent events)</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="grid gap-2">
          <Label htmlFor="mcp-url" className="text-xs">server url</Label>
          <Input
            id="mcp-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-server.com/mcp"
            className={inputStyles}
          />
        </div>
        
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">headers (optional)</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addHeaderEntry}
              className="h-6 text-xs px-2"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
          {headers.length > 0 && (
            <div className="space-y-2">
              {headers.map((header, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={header.key}
                    onChange={(e) => updateHeader(index, 'key', e.target.value)}
                    placeholder="header name"
                    className={cn(headerInputStyles, 'flex-1')}
                  />
                  <Input
                    value={header.value}
                    onChange={(e) => updateHeader(index, 'value', e.target.value)}
                    placeholder="value"
                    className={cn(headerInputStyles, 'flex-1')}
                    type={header.key.toLowerCase().includes('auth') || header.key.toLowerCase().includes('key') ? 'password' : 'text'}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeHeader(index)}
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            add custom headers like authorization tokens
          </p>
        </div>
      </div>
      
      {formError && (
        <p className="text-xs text-destructive">{formError}</p>
      )}
      
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={resetForm}>
          cancel
        </Button>
        <Button
          size="sm"
          onClick={() => isEdit && configId ? handleUpdateConfig(configId) : handleAddConfig()}
        >
          {isEdit ? 'save changes' : 'add server'}
        </Button>
      </div>
    </div>
  )
  
  const enabledCount = configs.filter(c => c.enabled).length
  const bodyContent = (
    <div className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-base font-semibold">
          <Settings2 className="h-5 w-5" />
          <span>mcp server configuration</span>
        </div>
        <p className="text-sm text-muted-foreground">
          connect model context protocol servers to extend the assistant with custom tools and capabilities.
        </p>
      </div>
      
      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-900 dark:text-blue-100">
        <div className="flex items-start gap-3">
          <ExternalLink className="h-4 w-4 mt-0.5 text-blue-600 dark:text-blue-300" />
          <div className="space-y-1 text-blue-900/80 dark:text-blue-100/80">
            <p className="font-semibold text-blue-900 dark:text-blue-100">what is mcp?</p>
            <p>
              mcp servers expose tools, resources, and prompts that extend what the assistant can do.
              {' '}
              <a
                href="https://modelcontextprotocol.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:underline"
              >
                learn more →
              </a>
            </p>
          </div>
        </div>
      </div>
      
      {configs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-muted-foreground">your mcp servers</h4>
            <span className="text-xs text-muted-foreground">
              {enabledCount} active
            </span>
          </div>
          <div className="space-y-3">
            {configs.map((config) => (
              <div
                key={config.id}
                className={cn(
                  cardStyles,
                  'transition-colors',
                  config.enabled ? 'bg-card/80' : 'bg-muted/50'
                )}
              >
                {editingId === config.id ? (
                  renderForm(true, config.id)
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3 p-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Switch
                          checked={config.enabled}
                          onCheckedChange={() => handleToggleConfig(config.id)}
                          className="shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className={cn(
                              'text-sm font-medium truncate',
                              !config.enabled && 'text-muted-foreground'
                            )}>
                              {config.name}
                            </p>
                            <span className={cn(
                              'text-[10px] px-2 py-0.5 rounded-full uppercase font-semibold tracking-wide',
                              config.transportType === 'http'
                                ? 'bg-green-500/10 text-green-600 dark:text-green-300'
                                : 'bg-purple-500/10 text-purple-600 dark:text-purple-300'
                            )}>
                              {config.transportType}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {config.url}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedId(expandedId === config.id ? null : config.id)}
                          className="h-8 w-8 p-0"
                        >
                          {expandedId === config.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditing(config)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteConfig(config.id)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {expandedId === config.id && (
                      <div className="px-4 pb-4 pt-0 text-xs text-muted-foreground space-y-1">
                        {config.headers && Object.keys(config.headers).length > 0 && (
                          <div>
                            <span className="font-medium">headers:</span>{' '}
                            {Object.keys(config.headers).join(', ')}
                          </div>
                        )}
                        <div>
                          <span className="font-medium">added:</span>{' '}
                          {new Date(config.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {isAdding ? (
        renderForm()
      ) : (
        <Button
          variant="outline"
          onClick={() => setIsAdding(true)}
          className="w-full rounded-xl border-dashed border-border/60 bg-transparent hover:bg-muted/40"
        >
          <Plus className="h-4 w-4 mr-2" />
          add mcp server
        </Button>
      )}
      
      <div className="text-xs text-muted-foreground">
        {enabledCount} of {configs.length} server(s) enabled
      </div>
    </div>
  )
  
  if (isMobile) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] rounded-t-3xl border border-border/50 bg-background/95 shadow-2xl flex flex-col overflow-hidden">
            <div className="mx-auto flex h-full w-full max-w-2xl flex-col pt-3">
              <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-border/60" />
              <div className="flex-1 overflow-y-auto pb-4" data-vaul-no-drag data-allow-touch-scroll>
                {bodyContent}
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    )
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden border border-border/50 bg-background/95 p-0 shadow-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>mcp server configuration</DialogTitle>
          <DialogDescription>connect model context protocol servers to extend the assistant with custom tools.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[90vh] overflow-y-auto">
          {bodyContent}
        </div>
      </DialogContent>
    </Dialog>
  )
}
