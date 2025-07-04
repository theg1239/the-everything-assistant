"use client"

import type React from "react"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Upload, FileText, ImageIcon, CheckCircle, AlertCircle, Loader2, CloudUpload } from "lucide-react"
import { uploadPaper } from "../actions/uploadPaper"
import { Button } from "./ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card"
import { Input } from "./ui/input"
import { toast } from "sonner"

interface UploadFormProps {
  onUploadSuccess?: () => void
}

export default function UploadForm({ onUploadSuccess }: UploadFormProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState("")
  const [result, setResult] = useState<{ success: boolean; error?: string; paper?: any } | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleSubmit = async (formData: FormData) => {
    if (!selectedFile || isUploading) return

    setIsUploading(true)
    setResult(null)
    setUploadProgress(5)
    setUploadStatus("preparing file...")

    try {
      await new Promise(resolve => setTimeout(resolve, 500))
      setUploadProgress(15)
      setUploadStatus("validating file...")
      
      await new Promise(resolve => setTimeout(resolve, 300))
      setUploadProgress(25)
      setUploadStatus("uploading to cloud...")
      
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
      setUploadStatus("processing content...")
      setResult(result)

      if (result.success) {
        setUploadProgress(100)
        setUploadStatus("upload complete!")
        toast.success("paper uploaded successfully", {
          description: `"${result.paper?.title}" has been processed and saved.`,
        })
        
        onUploadSuccess?.()
        
        setTimeout(() => {
          setResult(null)
          setSelectedFile(null)
          setUploadProgress(0)
          setUploadStatus("")
          const fileInput = document.getElementById('file') as HTMLInputElement
          if (fileInput) fileInput.value = ''
        }, 5000)
      } else {
        setUploadStatus("upload failed")
        toast.error("upload failed", {
          description: result.error,
        })
      }
    } catch (error) {
      const errorResult = {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      }
      setResult(errorResult)
      setUploadStatus("upload failed")
      toast.error("upload failed", {
        description: errorResult.error,
      })
    } finally {
      setIsUploading(false)
      if (!result || !result.success) {
        setUploadProgress(0)
        setUploadStatus("")
      }
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = e.dataTransfer.files
    if (files && files[0]) {
      setSelectedFile(files[0])
      const formData = new FormData()
      formData.append("file", files[0])
      handleSubmit(formData)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files[0]) {
      setSelectedFile(files[0])
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
      <Card className="mx-auto max-w-xl border-0 bg-white/80 backdrop-blur-sm dark:bg-gray-900/80">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">
            upload paper
          </CardTitle>
          <CardDescription className="text-sm text-gray-600 dark:text-gray-400">
            pdf or image files
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <form onSubmit={(e) => {
            e.preventDefault()
            if (selectedFile && !isUploading) {
              const formData = new FormData()
              formData.append("file", selectedFile)
              handleSubmit(formData)
            }
          }} className="space-y-4">
            <div
              className={`group relative overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300 ${
                dragActive
                  ? "border-blue-400/60 bg-blue-50/30 dark:border-blue-500/60 dark:bg-blue-950/10"
                  : "border-gray-300/60 bg-gray-50/30 hover:border-gray-400/60 hover:bg-gray-100/30 dark:border-gray-700/60 dark:bg-gray-800/30 dark:hover:border-gray-600/60"
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
                required
                disabled={isUploading}
                onChange={handleFileChange}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />

              <div className="flex flex-col items-center gap-4">
                <motion.div
                  animate={dragActive ? { scale: 1.05 } : { scale: 1 }}
                  className={`rounded-full p-4 transition-colors ${
                    dragActive
                      ? "bg-blue-100/80 dark:bg-blue-900/20"
                      : "bg-gray-100/80 group-hover:bg-gray-200/80 dark:bg-gray-800/80 dark:group-hover:bg-gray-700/80"
                  }`}
                >
                  {isUploading ? (
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
                  ) : dragActive ? (
                    <Upload className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <FileText className="h-8 w-8 text-gray-600 dark:text-gray-400" />
                  )}
                </motion.div>

                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {isUploading 
                      ? uploadStatus || "processing..." 
                      : dragActive 
                        ? "drop file here" 
                        : selectedFile 
                          ? selectedFile.name 
                          : "choose file or drag & drop"
                    }
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {selectedFile 
                      ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} mb` 
                      : "pdf, jpg, png, webp • max 10mb"
                    }
                  </p>
                </div>

                {isUploading && (
                  <div className="w-full max-w-xs">
                    <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                      <motion.div
                        className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-center text-gray-500 dark:text-gray-400">
                      {uploadProgress.toFixed(0)}% complete
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={isUploading || !selectedFile}
                className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 py-3 text-sm font-medium transition-all hover:from-blue-700 hover:to-purple-700 disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    processing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    upload
                  </>
                )}
              </Button>
              
              {selectedFile && !isUploading && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSelectedFile(null)
                    setResult(null)
                    setUploadProgress(0)
                    setUploadStatus("")
                    const fileInput = document.getElementById('file') as HTMLInputElement
                    if (fileInput) fileInput.value = ''
                  }}
                  className="rounded-xl px-4 py-3 text-sm"
                >
                  clear
                </Button>
              )}
            </div>
          </form>

          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div
                  className={`rounded-xl border p-4 ${
                    result.success
                      ? "border-green-200/60 bg-green-50/30 dark:border-green-800/60 dark:bg-green-950/10"
                      : "border-red-200/60 bg-red-50/30 dark:border-red-800/60 dark:bg-red-950/10"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`rounded-full p-1.5 ${
                        result.success ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"
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
                          result.success ? "text-green-900 dark:text-green-100" : "text-red-900 dark:text-red-100"
                        }`}
                      >
                        {result.success ? "upload successful" : "upload failed"}
                      </p>

                      {result.success && result.paper && (
                        <div className="space-y-2">
                          <div className="space-y-1 text-xs text-green-800 dark:text-green-200">
                            <div>
                              <span className="opacity-75">title:</span> {result.paper.title}
                            </div>
                            {result.paper.courseCode && (
                              <div>
                                <span className="opacity-75">course:</span> {result.paper.courseCode}
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
                              setSelectedFile(null)
                              setUploadProgress(0)
                              setUploadStatus("")
                              const fileInput = document.getElementById('file') as HTMLInputElement
                              if (fileInput) fileInput.value = ''
                            }}
                            className="mt-2 rounded-lg text-xs"
                          >
                            upload another paper
                          </Button>
                        </div>
                      )}

                      {!result.success && <p className="text-xs text-red-800 dark:text-red-200">{result.error}</p>}
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
