'use client'

import React, { useMemo } from 'react'
import {
  ComposedChart,
  Area,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceDot,
  Brush,
} from 'recharts'
import type { StatsResponse, UsageResponse } from '../types'

type SparkPoint = { t: string; ts: number; v: number }

interface OverviewProps {
  stats: StatsResponse | null
  usage: UsageResponse | null
}

const formatDateTick = (val: unknown) => new Date(Number(val)).toLocaleDateString()

export default function Overview({ stats, usage }: OverviewProps) {
  const sparkData = useMemo((): SparkPoint[] => {
    if (usage?.lifetimeBuckets && usage.lifetimeBuckets.length) {
      return usage.lifetimeBuckets.map(p => ({
        t: new Date(p.ts).toLocaleDateString(),
        ts: p.ts,
        v: p.totalTokens,
      }))
    }
    if (!usage?.recent) return []
    return usage.recent
      .slice()
      .reverse()
      .map(u => {
        const ts = new Date(u.createdAt).getTime()
        return { t: new Date(u.createdAt).toLocaleDateString(), ts, v: Number(u.totalTokens || 0) }
      })
  }, [usage])

  const topEvents = useMemo(() => {
    if (!usage?.recent) return []
    return usage.recent
      .slice()
      .sort((a, b) => Number(b.totalTokens || 0) - Number(a.totalTokens || 0))
      .slice(0, 5)
  }, [usage])

  const derived = useMemo(() => {
    const vals = sparkData.map(d => Number(d.v || 0)).filter(n => !Number.isNaN(n))
    if (!vals.length) return { avg: 0, median: 0, peak: 0, peakTs: undefined, last7d: 0 }
    const sum = vals.reduce((s: number, x: number) => s + x, 0)
    const avg = Math.round(sum / vals.length)
    const sorted = vals.slice().sort((a: number, b: number) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const midValue = sorted[mid] ?? 0
    const median =
      sorted.length % 2 === 1 ? midValue : Math.round(((sorted[mid - 1] ?? 0) + midValue) / 2)
    const peak = Math.max(...vals)
    const peakTs = sparkData.find(d => Number(d.v || 0) === peak)?.ts
    const last7 = vals.slice(-7)
    const prev7 = vals.slice(-14, -7)
    const last7Avg = last7.length
      ? last7.reduce((s: number, x: number) => s + x, 0) / last7.length
      : 0
    const prev7Avg = prev7.length
      ? prev7.reduce((s: number, x: number) => s + x, 0) / prev7.length
      : 0
    const last7d = prev7Avg ? Math.round(((last7Avg - prev7Avg) / prev7Avg) * 100) : 0
    return { avg, median, peak, peakTs, last7d }
  }, [sparkData])

  const lastPoint = sparkData.at(-1)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold lowercase">overview</h3>
          <p className="text-sm text-muted-foreground lowercase">
            quick summary of system health and recent activity
          </p>
        </div>
        <div className="flex gap-4 items-center text-sm">
          <div className="text-muted-foreground lowercase">total tokens</div>
          <div className="font-semibold text-lg">
            {(usage?.summaryAllTime?.totalTokens ?? usage?.summary?.totalTokens)?.toLocaleString() ??
              '—'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-3 rounded-md bg-black/10">
          <div className="text-xs text-muted-foreground lowercase">total users</div>
          <div className="font-semibold mt-1">{stats?.totalUsers ?? '—'}</div>
        </div>
        <div className="p-3 rounded-md bg-black/10">
          <div className="text-xs text-muted-foreground lowercase">messages (30m)</div>
          <div className="font-semibold mt-1">{stats?.messagesInLast30Minutes ?? '—'}</div>
        </div>
        <div className="p-3 rounded-md bg-black/10">
          <div className="text-xs text-muted-foreground lowercase">token events (24h)</div>
          <div className="font-semibold mt-1">{usage?.summary?.count ?? '—'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 p-3 rounded-md bg-black/10">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium lowercase mb-2">lifetime token usage</div>
            <div className="text-xs text-muted-foreground lowercase">
              avg {derived.avg.toLocaleString()} · median {derived.median.toLocaleString()} · peak{' '}
              {derived.peak.toLocaleString()}
            </div>
          </div>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <ComposedChart data={sparkData} margin={{ top: 12, right: 16, left: 0, bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.06} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={formatDateTick}
                  tick={{ fontSize: 11 }}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={val => new Date(Number(val)).toLocaleString()}
                  formatter={v => [typeof v === 'number' ? v.toLocaleString() : v, 'tokens']}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#7C3AED"
                  fillOpacity={0.08}
                  fill="#7C3AED"
                />
                <Line type="monotone" dataKey="v" stroke="#A78BFA" strokeWidth={2} dot={false} />
                {derived.peakTs && (
                  <ReferenceDot
                    x={derived.peakTs}
                    y={derived.peak}
                    r={4}
                    fill="#F59E0B"
                    stroke="none"
                  />
                )}
                {lastPoint && (
                  <ReferenceDot
                    x={lastPoint.ts}
                    y={lastPoint.v}
                    r={3}
                    fill="#34D399"
                    stroke="none"
                  />
                )}
                <Brush
                  dataKey="ts"
                  height={24}
                  stroke="#475569"
                  travellerWidth={8}
                  tickFormatter={formatDateTick}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-3 rounded-md bg-black/10">
          <div className="text-sm font-medium lowercase mb-2">top events</div>
          <ul className="space-y-2 text-sm">
            {topEvents.length === 0 && <li className="text-muted-foreground">no events</li>}
            {topEvents.map(e => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                  <span className="ml-2 truncate text-xs" style={{ maxWidth: 160 }}>
                    {(e.model || '-').toLowerCase()}
                  </span>
                </div>
                <div className="font-semibold">{Number(e.totalTokens || 0).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
