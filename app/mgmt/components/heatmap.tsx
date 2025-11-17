'use client'

import React, { useRef, useState } from 'react'

type HeatmapRow = { day: string; values: number[] }

export default function Heatmap({ rows = [], max = 0 }: { rows: HeatmapRow[]; max: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [tip, setTip] = useState<{
    x: number
    y: number
    day: string
    hour: number
    tokens: number
  } | null>(null)

  const onCellEnter = (e: React.MouseEvent, day: string, hour: number, tokens: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    const x = rect ? e.clientX - rect.left : 0
    const y = rect ? e.clientY - rect.top : 0
    setTip({ x, y, day, hour, tokens })
  }

  const onCellLeave = () => setTip(null)

  const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground lowercase">hourly heatmap</div>
        <div className="text-xs text-muted-foreground lowercase">darker = more tokens</div>
      </div>

      <div ref={containerRef} className="overflow-auto">

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
          <div className="w-20">day</div>
          <div className="flex-1 grid grid-cols-24 gap-[2px]">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="text-center text-[11px]">
                {i}
              </div>
            ))}
          </div>
        </div>


        <div className="space-y-1">
          {rows.length === 0 && (
            <div className="text-xs text-muted-foreground">no heatmap rows</div>
          )}

          {rows.map(r => (
            <div key={r.day} className="flex items-center gap-2">
              <div className="w-20 text-xs text-muted-foreground">{r.day}</div>
              <div className="flex-1 grid grid-cols-24 gap-[2px]">
                {r.values.map((v, hourIdx) => {
                  const intensity = max > 0 ? clamp(v / max, 0, 1) : 0
                  const alpha = 0.12 + intensity * 0.88
                  const bg = `rgba(124,58,237,${alpha})`
                  return (
                    <div
                      key={hourIdx}
                      onMouseEnter={e => onCellEnter(e, r.day, hourIdx, v)}
                      onMouseMove={e => onCellEnter(e, r.day, hourIdx, v)}
                      onMouseLeave={onCellLeave}
                      role="button"
                      tabIndex={0}
                      className="h-5 rounded-sm transition-colors"
                      style={{ background: bg }}
                      aria-label={`${r.day} ${hourIdx}:00 — ${v} tokens`}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>


      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground lowercase">
          <span>0</span>
          <div className="w-32 h-3 bg-gradient-to-r from-violet-200 via-violet-400 to-violet-700 rounded" />
          <span>{max?.toLocaleString?.() ?? 'max'}</span>
        </div>
        <div className="text-xs text-muted-foreground lowercase">last {rows.length} days</div>
      </div>

      {tip && (
        <div
          className="pointer-events-none absolute z-50 rounded-md bg-neutral-900 text-white text-xs px-2 py-1 shadow-lg"
          style={{ left: tip.x + 16, top: tip.y + 8 }}
        >
          <div className="font-medium">
            {tip.day} • {tip.hour}:00
          </div>
          <div className="text-[11px]">{tip.tokens.toLocaleString()} tokens</div>
        </div>
      )}
    </div>
  )
}
