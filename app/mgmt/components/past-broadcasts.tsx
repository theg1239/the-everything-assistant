"use client"

import React from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Edit, Trash2, Calendar, CheckCircle, Plus, Eye, History } from 'lucide-react'

export default function PastBroadcasts({
  pastBroadcasts,
  loadingBroadcasts,
  editingBroadcast,
  setEditingBroadcast,
  editSlides,
  setEditSlides,
  handleEditBroadcast,
  handleDeleteBroadcast,
  handleEditSlideChange,
  addEditSlide,
  removeEditSlide,
  showEditPreview,
  setShowEditPreview,
  handleSaveEditedBroadcast,
  loading,
}: any) {
  return (
    <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
      <div className="flex flex-col space-y-1.5 mb-6">
        <div className="flex items-center gap-2 text-lg md:text-xl font-semibold">
          <History className="w-5 h-5" /> Past Broadcasts
        </div>
        <div className="text-sm text-muted-foreground">View, edit, and manage previously sent broadcasts</div>
      </div>

      {loadingBroadcasts ? (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading past broadcasts...
          </div>
        </div>
      ) : pastBroadcasts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No past broadcasts found.</div>
      ) : (
        <div className="space-y-4">
          {pastBroadcasts.map((broadcast: any) => (
            <div key={broadcast.id} className="border border-border/20 rounded-lg bg-black/20 p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium">{new Date(broadcast.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Sent by: {broadcast.sentBy}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditBroadcast(broadcast)}
                    disabled={editingBroadcast === broadcast.id}
                    className="gap-1"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteBroadcast(broadcast.id)}
                    disabled={loading}
                    className="gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </Button>
                </div>
              </div>

              {editingBroadcast === broadcast.id ? (
                <div className="space-y-4 mt-4">
                  <div className="text-sm font-medium text-yellow-400 mb-2">Editing broadcast slides:</div>
                  {editSlides.map((slide: any, index: number) => (
                    <div key={index} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700 relative space-y-3">
                      <h5 className="font-medium text-sm">Edit Slide {index + 1}</h5>
                      <input
                        type="text"
                        placeholder="Title"
                        value={slide.title}
                        onChange={e => handleEditSlideChange(index, 'title', e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <textarea
                        placeholder="Text content"
                        value={slide.text}
                        onChange={e => handleEditSlideChange(index, 'text', e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[60px]"
                      />
                      <input
                        type="text"
                        placeholder="Image URL"
                        value={slide.image}
                        onChange={e => handleEditSlideChange(index, 'image', e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {editSlides.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeEditSlide(index)}
                          className="absolute top-2 right-2 w-6 h-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={addEditSlide} className="gap-1">
                        <Plus className="w-4 h-4" />
                        Add Slide
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowEditPreview(true)}
                        className="gap-1"
                        disabled={!editSlides.some((slide: any) => slide.title.trim() || slide.text.trim() || slide.image.trim())}
                      >
                        <Eye className="w-4 h-4" />
                        Preview
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingBroadcast(null)
                          setEditSlides([])
                        }}
                        disabled={loading}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleSaveEditedBroadcast} disabled={loading} size="sm" className="gap-1">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Save Changes
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm font-medium text-blue-400 mb-2">Broadcast slides ({broadcast.slides.length}):</div>
                  {broadcast.slides.map((slide: any, index: number) => (
                    <div key={index} className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-muted-foreground">Slide {index + 1}</span>
                      </div>
                      {slide.title && <div className="font-medium text-sm mb-1">{slide.title}</div>}
                      {slide.text && <div className="text-sm text-muted-foreground mb-2">{slide.text}</div>}
                      {slide.image && <div className="text-xs text-blue-400 truncate">Image: {slide.image}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
