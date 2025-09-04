'use client'

import React from 'react'
import { Database, Key, Server, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function SystemHealth({ data }: any) {
  return (
    <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
      <div className="flex flex-col space-y-1.5 mb-6">
        <div className="flex items-center gap-2 text-lg md:text-xl font-semibold lowercase">
          <Settings className="w-5 h-5" /> system health
        </div>
        <div className="text-sm text-muted-foreground lowercase">
          overall system status and configuration validation
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
          <Database
            className={cn(
              'w-5 h-5 flex-shrink-0',
              data.healthCheck.redis === 'Connected' ? 'text-green-500' : 'text-yellow-500'
            )}
          />
          <div className="min-w-0">
            <p className="font-medium text-sm md:text-base">Redis</p>
            <p className="text-xs md:text-sm text-muted-foreground">{data.healthCheck.redis}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
          <Key
            className={cn(
              'w-5 h-5 flex-shrink-0',
              data.healthCheck.apiKeys === 'Available' ? 'text-green-500' : 'text-red-500'
            )}
          />
          <div className="min-w-0">
            <p className="font-medium text-sm md:text-base">API Keys</p>
            <p className="text-xs md:text-sm text-muted-foreground">
              {data.environment.summary.apiKeys.totalAvailable}/
              {data.configuration.apiKeys.keyCount} available
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
          <Server
            className={cn(
              'w-5 h-5 flex-shrink-0',
              data.environment.validation.isValid ? 'text-green-500' : 'text-yellow-500'
            )}
          />
          <div className="min-w-0">
            <p className="font-medium text-sm md:text-base">Environment</p>
            <p className="text-xs md:text-sm text-muted-foreground">
              {data.environment.validation.isValid ? 'Valid' : 'Issues Found'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
          <Settings className="w-5 h-5 flex-shrink-0 text-blue-500" />
          <div className="min-w-0">
            <p className="font-medium text-sm md:text-base">Status</p>
            <p className="text-xs md:text-sm text-muted-foreground">{data.status}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
