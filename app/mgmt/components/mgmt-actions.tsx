"use client"

import React from 'react'
import { Activity, RotateCcw, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ManagementActions({ handleAction, loading }: any) {
  return (
    <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
      <div className="flex flex-col space-y-1.5 mb-6">
        <div className="flex items-center gap-2 text-lg md:text-xl font-semibold lowercase">
          <Activity className="w-5 h-5" /> management actions
        </div>
        <div className="text-sm text-muted-foreground lowercase">perform maintenance and administrative actions</div>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button onClick={() => handleAction('rotate')} disabled={loading} variant="outline" className="gap-2 w-full sm:w-auto">
          <RotateCcw className="w-4 h-4" /> <span className="lowercase">rotate api key</span>
        </Button>
        <Button onClick={() => handleAction('reset')} disabled={loading} variant="outline" className="gap-2 w-full sm:w-auto">
          <RefreshCw className="w-4 h-4" /> <span className="lowercase">reset rate limits</span>
        </Button>
      </div>
    </div>
  )
}
