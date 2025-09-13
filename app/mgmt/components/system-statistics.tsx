'use client'

import React from 'react'
import { Database, Users, Clock } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'

// Detailed stats (optional) may be provided under stats.detailedStats

export default function SystemStatistics({ stats }: any) {
  return (
    <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
      <div className="flex flex-col space-y-1.5 mb-6">
        <div className="flex items-center gap-2 text-lg md:text-xl font-semibold lowercase">
          <Database className="w-5 h-5" /> system statistics
        </div>
        <div className="text-sm text-muted-foreground lowercase">
          high-level overview of system activity
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
          <Users className="w-5 h-5 text-blue-500" />
          <div>
            <p className="font-medium text-sm md:text-base">Total Users</p>
            <p className="text-2xl font-bold">{stats.totalUsers}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
          <Clock className="w-5 h-5 text-green-500" />
          <div>
            <p className="font-medium text-sm md:text-base">Messages (30min)</p>
            <p className="text-2xl font-bold">{stats.messagesInLast30Minutes}</p>
          </div>
        </div>
      </div>
      <div className="mt-6">
        <h4 className="font-semibold mb-2">Tool Call Stats</h4>
        <div className="space-y-2">
          {Array.isArray(stats.toolCallStats) && stats.toolCallStats.length > 0 ? (
            stats.toolCallStats.map((tool: any) => (
              <div
                key={tool.toolName}
                className="flex justify-between items-center text-sm p-2 rounded-md bg-black/20"
              >
                <span>{tool.toolName}</span>
                <span className="font-bold">{tool.count}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No tool calls recorded yet.</p>
          )}
        </div>
      </div>

      {/* Detailed stats section (if available) */}
      {stats.detailedStats && (
        <div className="mt-6">
          <h4 className="font-semibold mb-2">detailed stats</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-md bg-black/10">
              <div className="text-xs text-muted-foreground lowercase">aggregated peak hour</div>
              <div className="font-semibold mt-1">
                {stats.detailedStats.dailyPeaks?.aggregatedPeakHour ?? '—'}:00
              </div>
            </div>
            <div className="p-3 rounded-md bg-black/10">
              <div className="text-xs text-muted-foreground lowercase">top model</div>
              <div className="font-semibold mt-1">
                {stats.detailedStats.topModels && stats.detailedStats.topModels[0]?.model
                  ? stats.detailedStats.topModels[0].model
                  : '—'}
              </div>
            </div>
          </div>

          <div className="mt-3">
            <h5 className="font-medium mb-2">tokens per user (top)</h5>
            <div className="space-y-2">
              {Array.isArray(stats.detailedStats.tokensPerUser) &&
              stats.detailedStats.tokensPerUser.length ? (
                stats.detailedStats.tokensPerUser.slice(0, 8).map((u: any) => (
                  <div
                    key={u.userId || Math.random()}
                    className="flex justify-between items-center text-sm p-2 rounded-md bg-black/20"
                  >
                    <span className="truncate">{u.userId ?? 'anonymous'}</span>
                    <span className="font-bold">{Number(u.totalTokens).toLocaleString()}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">no per-user data</p>
              )}
            </div>
          </div>

          {/* top models bar chart */}
          <div className="mt-4">
            <h5 className="font-medium mb-2">top models (by tokens)</h5>
            {stats.detailedStats.topModels && stats.detailedStats.topModels.length ? (
              <div style={{ width: '100%', height: 160 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={stats.detailedStats.topModels.map((m: any) => ({
                      model: m.model,
                      totalTokens: m.totalTokens,
                    }))}
                    layout="vertical"
                  >
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="model" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: any) => [v, 'tokens']} />
                    <Bar dataKey="totalTokens" fill="#7C3AED" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">no model data</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
