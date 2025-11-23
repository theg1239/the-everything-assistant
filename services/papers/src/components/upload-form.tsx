'use client'

import type React from 'react'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload,
  FileText,
  ImageIcon,
  CheckCircle,
  AlertCircle,
  Loader2,
  CloudUpload,
} from 'lucide-react'
import { uploadPaper } from '../actions/uploadPaper'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card'
import { Input } from './ui/input'
import { toast } from 'sonner'

interface UploadFormProps {
  onUploadSuccess?: () => void
}

export default function UploadForm({ onUploadSuccess }: UploadFormProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState('')
  const [result, setResult] = useState<{ success: boolean; error?: string; paper?: any } | null>(
    null
  )
  const [dragActive, setDragActive] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])

  const handlePaste = (e: React.ClipboardEvent<HTMLFormElement>) => {
    const items = e.clipboardData.items
    const newFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) newFiles.push(file)
      }
    }
    if (newFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...newFiles])
    }
  }

  const handleSubmit = async (formData: FormData) => {
    if (selectedFiles.length === 0 || isUploading) return
    setIsUploading(true)
    setResult(null)
    setUploadProgress(5)
    setUploadStatus('preparing file...')
    try {
      await new Promise(resolve => setTimeout(resolve, 500))
      setUploadProgress(15)
      setUploadStatus('validating file...')
      await new Promise(resolve => setTimeout(resolve, 300))
      setUploadProgress(25)
      setUploadStatus('uploading to cloud...')
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev < 80) {
            return prev + Math.random() * 10
          }
          return prev
        })
      }, 200)
      const result = await uploadPaper(formData)
      clearInterval(progressInterval)
      setUploadProgress(95)
      setUploadStatus('processing content...')
      setResult(result)
      if (result.success) {
        setUploadProgress(100)
        setUploadStatus('upload complete!')
        toast.success('paper uploaded successfully', {
          description: `"${result.paper?.title}" has been processed and saved.`,
        })
        onUploadSuccess?.()
        setTimeout(() => {
          setResult(null)
          setSelectedFiles([])
          setUploadProgress(0)
          setUploadStatus('')
          const fileInput = document.getElementById('file') as HTMLInputElement
          if (fileInput) fileInput.value = ''
        }, 5000)
      } else {
        setUploadStatus('upload failed')
        toast.error('upload failed', {
          description: result.error,
        })
      }
    } catch (error) {
      const errorResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      }
      setResult(errorResult)
      setUploadStatus('upload failed')
      toast.error('upload failed', {
        description: errorResult.error,
      })
    } finally {
      setIsUploading(false)
      if (!result || !result.success) {
        setUploadProgress(0)
        setUploadStatus('')
      }
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      setSelectedFiles(prev => [...prev, ...Array.from(files)])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      setSelectedFiles(prev => [...prev, ...Array.from(files)])
    }
  }

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <Card className="w-full max-w-xl border border-border bg-card shadow-sm">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">
            upload paper
          </CardTitle>
          <CardDescription className="text-sm text-gray-600 dark:text-gray-400">
            pdf or image files (paste, drag, or select multiple)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            onPaste={handlePaste}
            onSubmit={e => {
              e.preventDefault()
              if (selectedFiles.length > 0 && !isUploading) {
                const formData = new FormData()
                selectedFiles.forEach(file => formData.append('file', file))
                handleSubmit(formData)
              }
            }}
            className="space-y-4"
          >
            <div
              className={`group relative overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300 ${
                dragActive
                  ? 'border-blue-400/60 bg-blue-50/30 dark:border-blue-500/60 dark:bg-blue-950/10'
                  : 'border-gray-300/60 bg-gray-50/30 hover:border-gray-400/60 hover:bg-gray-100/30 dark:border-gray-700/60 dark:bg-gray-800/30 dark:hover:border-gray-600/60'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Input
                type="file"
                id="file"
                name="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                multiple
                required={selectedFiles.length === 0}
                disabled={isUploading}
                onChange={handleFileChange}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <div className="flex flex-col items-center gap-4">
                <motion.div
                  animate={dragActive ? { scale: 1.05 } : { scale: 1 }}
                  className={`rounded-full p-4 transition-colors ${dragActive ? 'bg-blue-100/80 dark:bg-blue-900/20' : 'bg-white/80 dark:bg-gray-900/40'}`}
                >
                  <CloudUpload className="h-8 w-8 text-blue-500" />
                </motion.div>
                <div className="text-gray-700 dark:text-gray-300">
                  {selectedFiles.length === 0 ? (
                    <span>paste, drag, or select pdf or image files</span>
                  ) : (
                    <div className="flex flex-wrap gap-2 justify-center">
                      {selectedFiles.map((file, idx) => (
                        <div key={idx} className="relative group">
                          {file.type.startsWith('image/') ? (
                            <img
                              src={URL.createObjectURL(file)}
                              alt={file.name}
                              className="h-16 w-16 object-cover rounded shadow"
                            />
                          ) : (
                            <FileText className="h-16 w-16 text-gray-400" />
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(idx)}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 text-xs opacity-80 hover:opacity-100"
                            aria-label="Remove file"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <Button
              type="submit"
              disabled={isUploading || selectedFiles.length === 0}
              className="w-full"
            >
              {isUploading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="animate-spin h-4 w-4" /> Uploading...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Upload className="h-4 w-4" /> Upload Paper
                </span>
              )}
            </Button>
          </form>

          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div
                  className={`rounded-xl border p-4 ${
                    result.success
                      ? 'border-green-200/60 bg-green-50/30 dark:border-green-800/60 dark:bg-green-950/10'
                      : 'border-red-200/60 bg-red-50/30 dark:border-red-800/60 dark:bg-red-950/10'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`rounded-full p-1.5 ${
                        result.success
                          ? 'bg-green-100 dark:bg-green-900/30'
                          : 'bg-red-100 dark:bg-red-900/30'
                      }`}
                    >
                      {result.success ? (
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      )}
                    </div>

                    <div className="flex-1 space-y-2">
                      <p
                        className={`text-sm font-medium ${
                          result.success
                            ? 'text-green-900 dark:text-green-100'
                            : 'text-red-900 dark:text-red-100'
                        }`}
                      >
                        {result.success ? 'upload successful' : 'upload failed'}
                      </p>

                      {result.success && result.paper && (
                        <div className="space-y-2">
                          <div className="space-y-1 text-xs text-green-800 dark:text-green-200">
                            <div>
                              <span className="opacity-75">title:</span> {result.paper.title}
                            </div>
                            {result.paper.courseCode && (
                              <div>
                                <span className="opacity-75">course:</span>{' '}
                                {result.paper.courseCode}
                              </div>
                            )}
                            {result.paper.year && (
                              <div>
                                <span className="opacity-75">year:</span> {result.paper.year}
                              </div>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setResult(null)
                              setSelectedFiles([])
                              setUploadProgress(0)
                              setUploadStatus('')
                              const fileInput = document.getElementById('file') as HTMLInputElement
                              if (fileInput) fileInput.value = ''
                            }}
                            className="mt-2 rounded-lg text-xs"
                          >
                            upload another paper
                          </Button>
                        </div>
                      )}

                      {!result.success && (
                        <p className="text-xs text-red-800 dark:text-red-200">{result.error}</p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  )
}
