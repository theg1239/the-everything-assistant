"use client"

import React from 'react'
import { motion } from 'framer-motion'

export default function MgmtLayout({ title = 'mgmt', subtitle, headerActions, lastUpdate, nav, children }: any) {
  return (
    <div className="flex flex-col h-screen bg-transparent text-foreground overflow-hidden" data-allow-touch-scroll>
      <header className="flex-shrink-0 bg-black/30 backdrop-blur-md border-b border-border/40">
        <div className="container mx-auto px-4 max-w-7xl">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="py-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-4">
                  <div>
                    <h1 className="text-3xl font-extrabold lowercase tracking-tight">{title}</h1>
                    {subtitle && <p className="text-muted-foreground mt-0.5 lowercase text-sm">{subtitle}</p>}
                  </div>
          {/* last updated removed per request - details will be shown by default */}
                </div>
              </div>

        {/* header actions intentionally removed: controls like show details / auto refresh / load data are handled elsewhere or removed */}
            </div>

            {/* nav slot integrated here for better visual flow */}
            <div className="mt-4">{nav}</div>
          </motion.div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden" data-allow-touch-scroll>
        <div className="h-full overflow-y-auto" data-allow-touch-scroll style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="container mx-auto px-4 max-w-7xl py-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
