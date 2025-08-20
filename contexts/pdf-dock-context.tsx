"use client"

import React, { createContext, useContext, useState, useEffect } from 'react'

export type PdfItem = {
  id: string
  url: string
  title?: string
  isOpen?: boolean
}

type PdfDockContextType = {
  items: PdfItem[]
  addPdf: (item: Omit<PdfItem, 'isOpen'>) => void
  removePdf: (id: string) => void
  openPdf: (id: string) => void
  minimizePdf: (id: string) => void
  openByUrl?: (url: string) => void
  minimizeByUrl?: (url: string) => void
  removeByUrl?: (url: string) => void
}

const PdfDockContext = createContext<PdfDockContextType | null>(null)

export const usePdfDock = () => {
  const ctx = useContext(PdfDockContext)
  if (!ctx) throw new Error('usePdfDock must be used within PdfDockProvider')
  return ctx
}

export const PdfDockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

  const STORAGE_KEY = 'pdf-dock-items-v1'

  const [items, setItems] = useState<PdfItem[]>(() => {
    try {
      if (typeof window === 'undefined') return []
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as PdfItem[]
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      console.warn('Failed to read pdf dock from localStorage', e)
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch (e) {
      console.warn('Failed to save pdf dock to localStorage', e)
    }
  }, [items])

  const addPdf = (item: Omit<PdfItem, 'isOpen'>) => {
    setItems(prev => {
      const existsById = prev.find(p => p.id === item.id)
      const existsByUrl = prev.find(p => p.url === item.url)
      if (existsById) {
        return prev.map(p => (p.id === item.id ? { ...p, ...item, isOpen: true } : p))
      }
      if (existsByUrl) {
        return prev.map(p => (p.url === item.url ? { ...p, ...item, isOpen: true } : p))
      }
      return [{ ...item, isOpen: true }, ...prev]
    })
  }

  const removePdf = (id: string) => setItems(prev => prev.filter(p => p.id !== id))

  
  const removeByUrl = (url: string) => setItems(prev => prev.filter(p => p.url !== url))
  
    const openPdf = (id: string) => {
      setItems(prev => {
        let changed = false
        const updated = prev.map(p => {
          if (p.id === id) {
            if (!p.isOpen) {
              changed = true
              return { ...p, isOpen: true }
            }
            return p
          }
          return p
        })
        return changed ? updated : prev
      })
      try {
        window.dispatchEvent(new CustomEvent('pdf-dock:open', { detail: { id } }))
      } catch {}
    }

    const minimizePdf = (id: string) => {
      setItems(prev => {
        let changed = false
        const updated = prev.map(p => {
          if (p.id === id) {
            if (p.isOpen) {
              changed = true
              return { ...p, isOpen: false }
            }
            return p
          }
          return p
        })
        return changed ? updated : prev
      })
    }

    const openByUrl = (url: string) => {
      setItems(prev => {
        let changed = false
        const updated = prev.map(p => {
          if (p.url === url) {
            if (!p.isOpen) {
              changed = true
              return { ...p, isOpen: true }
            }
            return p
          }
          return p
        })
        return changed ? updated : prev
      })
      try {
        window.dispatchEvent(new CustomEvent('pdf-dock:open-by-url', { detail: { url } }))
      } catch {}
    }

    const minimizeByUrl = (url: string) => {
      setItems(prev => {
        let changed = false
        const updated = prev.map(p => {
          if (p.url === url) {
            if (p.isOpen) {
              changed = true
              return { ...p, isOpen: false }
            }
            return p
          }
          return p
        })
        return changed ? updated : prev
      })
    }

  return (
    <PdfDockContext.Provider value={{ items, addPdf, removePdf, openPdf, minimizePdf, openByUrl, minimizeByUrl, removeByUrl }}>
      {children}
    </PdfDockContext.Provider>
  )
}

export default PdfDockContext
