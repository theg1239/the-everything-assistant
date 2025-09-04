'use client'

import React from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

export default function TokenUsageChart({ data }: any) {
  // data expected: [{ time: string, tokens: number, prompt: number, completion: number }, ...]
  if (!data || data.length === 0)
    return <div className="text-sm text-muted-foreground">no chart data</div>

  return (
    <div style={{ width: '100%', height: 220 }} className="mt-4">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 6, right: 12, left: 6, bottom: 6 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.06} />
          <XAxis dataKey="time" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={v => v.toLocaleString()} />
          <Tooltip formatter={(value: any) => value?.toLocaleString?.() ?? value} />
          <Line type="monotone" dataKey="prompt" stroke="#60A5FA" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="completion" stroke="#34D399" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="tokens" stroke="#A78BFA" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
