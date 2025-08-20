"use client"

import React from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Send, Trash2, Eye } from 'lucide-react'

export default function BroadcastForm({
  broadcastSlides,
  handleSlideChange,
  addSlide,
  removeSlide,
  setShowPreview,
  handleSendBroadcast,
  loading,
}: any) {
  return (
    <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
      <div className="flex flex-col space-y-1.5 mb-6">
        <div className="flex items-center gap-2 text-lg md:text-xl font-semibold">
          <Send className="w-5 h-5" /> broadcast dialog
        </div>
        <div className="text-sm text-muted-foreground">send a dialog to all connected users in real-time</div>
      </div>

      <div className="space-y-4">
        {broadcastSlides.map((slide: any, index: number) => (
          <div key={index} className="p-4 rounded-lg bg-black/20 border border-border/20 relative space-y-3">
            <h4 className="font-medium">slide {index + 1}</h4>
            <input
              type="text"
              placeholder="Title"
              value={slide.title}
              onChange={e => handleSlideChange(index, 'title', e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              placeholder="Text content"
              value={slide.text}
              onChange={e => handleSlideChange(index, 'text', e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
            />
            <input
              type="text"
              placeholder="Image URL"
              value={slide.image}
              onChange={e => handleSlideChange(index, 'image', e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {broadcastSlides.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeSlide(index)}
                className="absolute top-2 right-2 w-8 h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-between items-center">
        <div className="flex gap-2">
          <Button variant="outline" onClick={addSlide} className="gap-2">
            <Plus className="w-4 h-4" /> add slide
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowPreview(true)}
            className="gap-2"
            disabled={!broadcastSlides.some((slide: any) => slide.title.trim() || slide.text.trim() || slide.image.trim())}
          >
            <Eye className="w-4 h-4" /> preview
          </Button>
        </div>
        <Button onClick={handleSendBroadcast} disabled={loading} className="gap-2 bg-purple-600 hover:bg-purple-700">
          <Send className="w-4 h-4" /> send broadcast
        </Button>
      </div>
    </div>
  )
}
