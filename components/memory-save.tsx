import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, Check, ChevronDown, ChevronUp, X, Sparkles } from 'lucide-react'

interface MemorySaveIndicatorProps {
  toolCalls: any[]
}

export const MemorySaveIndicator = ({ toolCalls }: MemorySaveIndicatorProps) => {
  const [showIndicator, setShowIndicator] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [savedMemories, setSavedMemories] = useState<any[]>([])

  useEffect(() => {
    const memoryTools = toolCalls.filter(tool => tool.toolName === 'saveMemory')
    
    if (memoryTools.length > 0) {
      const completedMemories = memoryTools.filter(tool => tool.result)
      const hasRunning = memoryTools.some(tool => !tool.result)
      
      if (hasRunning || completedMemories.length > 0) {
        setShowIndicator(true)
        
        if (completedMemories.length > 0) {
          setIsComplete(true)
          setSavedMemories(completedMemories)
          
          // Auto-hide after 8 seconds if not expanded
          setTimeout(() => {
            if (!isExpanded) {
              setShowIndicator(false)
              setIsComplete(false)
              setSavedMemories([])
            }
          }, 8000)
        }
      }
    }
  }, [toolCalls, isExpanded])

  const handleClose = () => {
    setShowIndicator(false)
    setIsComplete(false)
    setSavedMemories([])
    setIsExpanded(false)
  }

  const getMemoryContent = (memory: any) => {
    // Extract content from the tool call
    const args = memory.function?.arguments || memory.args
    let content = ''
    
    if (typeof args === 'string') {
      try {
        const parsed = JSON.parse(args)
        content = parsed.content || parsed.memory || parsed.text || ''
      } catch {
        content = args
      }
    } else if (args) {
      content = args.content || args.memory || args.text || ''
    }
    
    return content || 'Memory saved successfully'
  }

  const getMemoryType = (memory: any) => {
    const args = memory.function?.arguments || memory.args
    let type = 'general'
    
    if (typeof args === 'string') {
      try {
        const parsed = JSON.parse(args)
        type = parsed.type || parsed.category || 'general'
      } catch {
        // ignore
      }
    } else if (args) {
      type = args.type || args.category || 'general'
    }
    
    return type
  }

  return (
    <AnimatePresence>
      {showIndicator && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ 
            type: "spring", 
            stiffness: 400, 
            damping: 25,
            duration: 0.4 
          }}
          className="fixed bottom-4 right-4 z-50 max-w-sm"
        >
          <div className="bg-background/95 backdrop-blur-md border border-border/50 rounded-xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-b border-border/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <motion.div
                    animate={isComplete ? { scale: [1, 1.1, 1] } : { rotate: 360 }}
                    transition={isComplete ? { 
                      duration: 0.6, 
                      times: [0, 0.5, 1],
                      ease: "easeInOut" 
                    } : { 
                      duration: 2, 
                      repeat: Infinity, 
                      ease: "linear" 
                    }}
                  >
                    {isComplete ? (
                      <div className="relative">
                        <Brain className="h-4 w-4 text-blue-500" />
                        <Check className="h-2 w-2 text-green-500 absolute -top-1 -right-1 bg-background rounded-full" />
                      </div>
                    ) : (
                      <Brain className="h-4 w-4 text-blue-500" />
                    )}
                  </motion.div>
                  
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">
                      {isComplete ? 'Saved a memory' : 'Saving memory...'}
                    </span>
                    {isComplete && savedMemories.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {savedMemories.length} item{savedMemories.length > 1 ? 's' : ''} remembered
                      </span>
                    )}
                  </div>
                  
                  {!isComplete && (
                    <motion.div
                      className="flex gap-1"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ 
                        duration: 1.5, 
                        repeat: Infinity, 
                        ease: "easeInOut" 
                      }}
                    >
                      <div className="w-1 h-1 bg-blue-500 rounded-full" />
                      <div className="w-1 h-1 bg-purple-500 rounded-full" />
                      <div className="w-1 h-1 bg-blue-500 rounded-full" />
                    </motion.div>
                  )}
                </div>
                
                <div className="flex items-center gap-1">
                  {isComplete && savedMemories.length > 0 && (
                    <button
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="p-1 hover:bg-muted rounded-md transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={handleClose}
                    className="p-1 hover:bg-muted rounded-md transition-colors"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>

            {/* Expanded Content */}
            <AnimatePresence>
              {isExpanded && savedMemories.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="px-4 py-3 bg-muted/20 space-y-3 max-h-60 overflow-y-auto">
                    {savedMemories.map((memory, index) => {
                      const content = getMemoryContent(memory)
                      const type = getMemoryType(memory)
                      
                      return (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="bg-background/50 rounded-lg p-3 border border-border/30"
                        >
                          <div className="flex items-start gap-2">
                            <Sparkles className="h-3 w-3 text-purple-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-purple-400 capitalize">
                                  {type}
                                </span>
                                <div className="h-1 w-1 bg-muted-foreground/30 rounded-full" />
                                <span className="text-xs text-muted-foreground">
                                  Just now
                                </span>
                              </div>
                              <p className="text-xs text-foreground/80 leading-relaxed line-clamp-3">
                                {content}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}