'use client'

import React from 'react'
import { Key, Database } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export default function APIKeyManagement({ data, showSensitiveData, formatTimestamp }: any) {
  return (
    <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
      <div className="flex flex-col space-y-1.5 mb-6">
        <div className="flex items-center gap-2 text-lg md:text-xl font-semibold lowercase">
          <Key className="w-5 h-5" /> api key management
        </div>
        <div className="text-sm text-muted-foreground lowercase">
          configuration and usage status for api keys
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h4 className="font-medium text-sm md:text-base lowercase">configuration</h4>
          <div className="space-y-2 text-xs md:text-sm">
            <div className="flex justify-between">
              <span>Total Keys:</span>
              <Badge variant="outline">{data.configuration.apiKeys.keyCount}</Badge>
            </div>
            <div className="flex justify-between">
              <span>Rotation Enabled:</span>
              <Badge variant={data.configuration.apiKeys.enableRotation ? 'default' : 'secondary'}>
                {data.configuration.apiKeys.enableRotation ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span>Auto-rotate on Limit:</span>
              <Badge
                variant={data.configuration.apiKeys.rotateOnRateLimit ? 'default' : 'secondary'}
              >
                {data.configuration.apiKeys.rotateOnRateLimit ? 'Yes' : 'No'}
              </Badge>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <h4 className="font-medium text-sm md:text-base lowercase">rate limits</h4>
          <div className="space-y-2 text-xs md:text-sm">
            <div className="flex justify-between">
              <span>Per Minute:</span>
              <Badge variant="outline">
                {data.configuration.apiKeys.rateLimit.requestsPerMinute}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span>Per Hour:</span>
              <Badge variant="outline">
                {data.configuration.apiKeys.rateLimit.requestsPerHour}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {showSensitiveData && (
        <div className="mt-6 space-y-4">
          <h4 className="font-medium text-sm md:text-base lowercase">individual key status</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(data.keyUsage)
              .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
              .map(([key, usage]: any) => {
                const parts = key.split('_')
                const provider = parts[0] || 'Unknown'
                const keyIndex = parts.length > 2 ? parts.slice(2).join('_') : 'N/A'
                const displayName = `${provider.charAt(0).toUpperCase() + provider.slice(1)} Key ${keyIndex}`

                return (
                  <div
                    key={key}
                    className={cn(
                      'p-4 rounded-lg bg-black/20 border',
                      usage.isRateLimited && 'border-red-500/80'
                    )}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="font-semibold">{displayName}</h4>
                      <div className="flex gap-2">
                        {usage.isRateLimited && <Badge variant="destructive">Rate Limited</Badge>}
                      </div>
                    </div>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Requests</span>
                        <span className="font-mono">{usage.requests}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Failures</span>
                        <span className="font-mono">{usage.failures}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Last Used</span>
                        <span className="font-mono">{formatTimestamp(usage.lastUsed)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Last Failed</span>
                        <span className="font-mono">{formatTimestamp(usage.lastFailed)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
