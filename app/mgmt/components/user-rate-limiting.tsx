"use client"

import React from 'react'
import { Clock, Users } from 'lucide-react'

export default function UserRateLimiting({ data }: any) {
  return (
    <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
      <div className="flex flex-col space-y-1.5 mb-6">
        <div className="flex items-center gap-2 text-lg md:text-xl font-semibold lowercase">
          <Users className="w-5 h-5" /> user rate limiting
        </div>
        <div className="text-sm text-muted-foreground lowercase">per-user request rate limiting configuration</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
          <Clock className="w-5 h-5 text-blue-500" />
          <div>
            <p className="font-medium text-sm md:text-base">Per Minute</p>
            <p className="text-xs md:text-sm text-muted-foreground">{data.configuration.userRateLimit.requestsPerMinute} requests</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
          <Clock className="w-5 h-5 text-green-500" />
          <div>
            <p className="font-medium text-sm md:text-base">Per Hour</p>
            <p className="text-xs md:text-sm text-muted-foreground">{data.configuration.userRateLimit.requestsPerHour} requests</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
          <Clock className="w-5 h-5 text-orange-500" />
          <div>
            <p className="font-medium text-sm md:text-base">Per Day</p>
            <p className="text-xs md:text-sm text-muted-foreground">{data.configuration.userRateLimit.requestsPerDay} requests</p>
          </div>
        </div>
      </div>
    </div>
  )
}
