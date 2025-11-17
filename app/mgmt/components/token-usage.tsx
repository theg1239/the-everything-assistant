'use client'

import React, { useMemo, useState } from 'react'
import { Activity, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import TokenUsageChart from './token-usage-chart'
import { ResponsiveContainer, LineChart, Line, Tooltip, XAxis, YAxis } from 'recharts'
import Heatmap from './heatmap'

function StatCard({ label, value, accent }: any) {
  return (
    <div className="p-3 rounded-lg bg-black/20 border border-border/20">
      <div className="text-xs text-muted-foreground lowercase">{label}</div>
      <div className={`mt-1 font-semibold text-lg ${accent || ''}`}>{value}</div>
    </div>
  )
}

export default function TokenUsage({ usage, usageOpen, setUsageOpen, openMessagesViewer }: any) {
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showPeakHour, setShowPeakHour] = useState(false)
  const chartData = useMemo(() => {
    if (
      usage?.lifetimeBuckets &&
      Array.isArray(usage.lifetimeBuckets) &&
      usage.lifetimeBuckets.length
    ) {
      return usage.lifetimeBuckets.map((b: any) => ({
        time: new Date(b.ts).toLocaleDateString(),
        tokens: b.totalTokens,
      }))
    }
    if (!usage?.recent) return []
    return usage.recent
      .slice()
      .reverse()
      .map((u: any) => ({
        time: new Date(u.createdAt).toLocaleTimeString(),
        prompt: u.promptTokens,
        completion: u.completionTokens,
        tokens: u.totalTokens,
      }))
  }, [usage])

  const heatmap: any = useMemo(() => {
    const rows: any[] = []
    const hh = usage?.detailedStats?.hourlyHeatmap || []
    if (!Array.isArray(hh) || hh.length === 0) return { rows, max: 0 }

    const map: Record<string, number[]> = {}
    let max = 0
    for (const h of hh) {
      const ts = Number(h.ts || h)
      const d = new Date(ts)
      if (Number.isNaN(d.getTime())) continue
      const day = d.toISOString().slice(0, 10)
      const hour = d.getUTCHours()
      map[day] = map[day] || new Array(24).fill(0)
      map[day][hour] = (map[day][hour] || 0) + Number(h.totalTokens || 0)
      max = Math.max(max, map[day][hour])
    }

    const days = Object.keys(map).sort()
    for (const day of days) {
      rows.push({ day, values: map[day], max })
    }
    return { rows, max }
  }, [usage])

  return (
    <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-lg md:text-xl font-semibold lowercase">
          <Activity className="w-5 h-5" /> token usage (last 24h)
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end gap-0.5">
              {usage?.summary && (
                <div className="text-xs md:text-sm text-muted-foreground lowercase">
                  24h: {usage.summary.totalTokens?.toLocaleString?.() || 0} tokens ·{' '}
                  {usage.summary.count || 0} events
                </div>
              )}
              {usage?.summaryAllTime && (
                <div className="text-[11px] md:text-xs text-muted-foreground/80 lowercase">
                  all time: {usage.summaryAllTime.totalTokens?.toLocaleString?.() || 0} tokens ·{' '}
                  {usage.summaryAllTime.count || 0} events
                </div>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setUsageOpen((v: boolean) => !v)}
              aria-expanded={usageOpen}
              aria-controls="usage-table"
            >
              {usageOpen ? 'hide' : 'show'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowHeatmap(v => !v)}
            >
              {showHeatmap ? 'hide heatmap' : 'show heatmap'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowPeakHour(v => !v)}
            >
              {showPeakHour ? 'hide peak' : 'show peak'}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          label="24h total tokens"
          value={usage?.summary?.totalTokens?.toLocaleString() ?? '0'}
          accent="text-purple-300"
        />
        <StatCard label="24h events" value={usage?.summary?.count ?? '0'} accent="text-blue-200" />
        <StatCard
          label="avg tokens / event"
          value={usage?.summary?.average?.toFixed?.(1) ?? '-'}
          accent="text-green-200"
        />
      </div>

      <TokenUsageChart data={chartData} />

      {showHeatmap && Array.isArray(usage?.detailedStats?.hourlyHeatmap) && (
        <div className="mt-4 p-3 rounded-md bg-black/10">
          <Heatmap
            rows={(heatmap.rows || []).map((r: any) => ({ day: r.day, values: r.values }))}
            max={heatmap.max || 0}
          />
        </div>
      )}

      {showPeakHour && (
        <div className="mt-4 p-3 rounded-md bg-black/10">
          <div className="text-sm font-medium lowercase mb-2">peak hours</div>
          <div className="text-xs text-muted-foreground">
            aggregated peak hour: {usage?.detailedStats?.dailyPeaks?.aggregatedPeakHour ?? '—'}
          </div>
          <div className="mt-2 text-sm">

            {(Array.isArray(usage?.detailedStats?.dailyPeaks?.perDay)
              ? usage.detailedStats.dailyPeaks.perDay.slice(-7)
              : []
            ).map((d: any) => (
              <div key={d.day} className="flex justify-between text-xs py-0.5">
                <span className="text-muted-foreground">{d.day}</span>
                <span>
                  {d.peakHour}:00{' '}
                  <span className="text-muted-foreground">({d.peakTokens.toLocaleString()})</span>
                </span>
              </div>
            ))}
          </div>


          {Array.isArray(usage?.detailedStats?.hourlyHeatmap) && (
            <div className="mt-3">
              <div className="text-xs text-muted-foreground mb-1 lowercase">
                tokens by hour (aggregated)
              </div>
              <div className="flex items-end gap-1 h-20">
                {Array.from({ length: 24 }).map((_, h) => {
                  const hhArr = Array.isArray(usage.detailedStats.hourlyHeatmap)
                    ? usage.detailedStats.hourlyHeatmap
                    : []
                  const total = hhArr
                    .filter((x: any) => {
                      const d = new Date(Number(x.ts))
                      return !Number.isNaN(d.getTime()) && d.getUTCHours() === h
                    })
                    .reduce((s: any, x: any) => s + Number(x.totalTokens || 0), 0)
                  const max = Math.max(1, ...hhArr.map((x: any) => Number(x.totalTokens || 0)))
                  const hPct = Math.min(100, Math.round((total / (max || 1)) * 100))
                  return (
                    <div key={h} className="w-1/24 flex-1 flex items-end">
                      <div
                        className="w-full bg-violet-500 rounded-t-sm"
                        style={{ height: `${hPct}%`, opacity: 0.85 }}
                        title={`${h}:00 — ${total.toLocaleString()}`}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}


      {Array.isArray(usage?.detailedStats?.movingAverages) && (
        <div className="mt-4 p-3 rounded-md bg-black/10">
          <div className="text-sm font-medium lowercase mb-2">moving average (7d)</div>
          <div style={{ width: '100%', height: 80 }}>
            <ResponsiveContainer>
              <LineChart
                data={usage.detailedStats.movingAverages.map((m: any) => ({
                  day: m.day,
                  avg: m.avg,
                }))}
              >
                <XAxis dataKey="day" hide />
                <YAxis hide />
                <Tooltip formatter={(v: any) => [v, 'avg']} labelFormatter={(l: any) => l} />
                <Line type="monotone" dataKey="avg" stroke="#A78BFA" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {usageOpen && (
        <div
          id="usage-table"
          className="overflow-x-auto rounded-md border border-border/20 mt-4"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <table className="min-w-full text-xs sm:text-sm">
            <thead className="bg-black/30 lowercase">
              <tr>
                <th className="text-left px-3 py-2">time</th>
                <th className="text-left px-3 py-2">model</th>
                <th className="text-right px-3 py-2">prompt</th>
                <th className="text-right px-3 py-2">completion</th>
                <th className="text-right px-3 py-2">total</th>
                <th className="text-right px-3 py-2">step</th>
                <th className="text-left px-3 py-2">chat</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(usage?.recent) &&
                usage.recent.map((u: any) => (
                  <tr key={u.id} className="border-t border-border/10">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(u.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap lowercase">{u.model || '-'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {u.promptTokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {u.completionTokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                      {u.totalTokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{u.stepIndex ?? '-'}</td>
                    <td className="px-3 py-2 text-muted-foreground break-all">
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{u.chatId?.slice(0, 8) || '-'}</span>
                        {u.chatId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="View messages"
                            onClick={() => openMessagesViewer(u.chatId)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              {(!usage || !Array.isArray(usage.recent) || usage.recent.length === 0) && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">
                    no usage records
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
