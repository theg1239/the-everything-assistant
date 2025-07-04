'use server'

import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { v2 as cloudinary } from 'cloudinary'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { db } from '../db'
import { papers, NewPaper } from '../db/schema'
import { z } from 'zod'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
})

const PaperMetadataSchema = z.object({
  title: z.string().describe('The title or subject of the exam paper'),
  courseCode: z.string().optional().describe('The course code (e.g., CSE1001, MAT1001)'),
  year: z.number().optional().describe('The year the exam was conducted'),
  slot: z.string().optional().describe('The exam slot (e.g., A1, B1, C1)'),
  semester: z.string().optional().describe('The semester (e.g., Fall, Winter, Summer)'),
  examType: z.string().optional().describe('Type of exam (e.g., CAT1, CAT2, FAT, Quiz)'),
})

type PaperMetadata = z.infer<typeof PaperMetadataSchema>

interface UploadResult {
  success: boolean
  error?: string
  paper?: {
    id: string
    title: string
    courseCode?: string
    year?: number
    slot?: string
    semester?: string
    examType?: string
    fileUrl: string
    thumbnailUrl: string
    ocrText?: string
    createdAt: Date
  }
}

export async function uploadPaper(formData: FormData): Promise<UploadResult> {
  try {
    const file = formData.get('file') as File
    
    if (!file) {
      return { success: false, error: 'No file provided' }
    }

    const maxFileSize = 10 * 1024 * 1024
    if (file.size > maxFileSize) {
      return { 
        success: false, 
        error: 'File size too large. Please upload files smaller than 10MB.' 
      }
    }

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return { 
        success: false, 
        error: 'Invalid file type. Please upload a PDF or image file (JPEG, PNG, WebP)' 
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    console.log(`Processing file: ${file.name}, size: ${file.size} bytes, type: ${file.type}`)
    console.log(`Buffer size: ${buffer.length} bytes`)
    
    let ocrText = ''
    let metadata: PaperMetadata
    let fileBuffer = buffer

    if (file.type === 'application/pdf') {
      try {
        await PDFDocument.load(buffer)
      } catch (error) {
        return { 
          success: false, 
          error: 'Invalid PDF file. Please ensure the file is not corrupted.' 
        }
      }
      
      const base64Pdf = buffer.toString('base64')
      
      // Generate metadata and OCR text using Gemini in a single call
      try {
        const { object: extractedData } = await generateObject({
          model: google('gemini-2.0-flash-exp'),
          schema: z.object({
            metadata: PaperMetadataSchema,
            text: z.string().describe('Full text content of the document'),
          }),
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Please analyze this exam paper PDF and extract both the metadata and full text content.',
                },
                {
                  type: 'file',
                  data: base64Pdf,
                  mimeType: 'application/pdf',
                },
              ],
            },
          ],
          system: 'You are an AI that extracts metadata from VIT university exam papers. Extract the title, course code, year, slot, semester, and exam type from the document. Also extract all the text content. Be as accurate as possible.',
        })
        
        metadata = extractedData.metadata
        ocrText = extractedData.text
      } catch (error) {
        console.error('Gemini API error for PDF:', error)
        return {
          success: false,
          error: 'Failed to process PDF content. Please ensure the PDF is readable and try again.',
        }
      }
      
    } else {
      const base64Image = buffer.toString('base64')
      const mimeType = file.type
      
      try {
        const { object: extractedData } = await generateObject({
          model: google('gemini-2.0-flash-exp'),
          schema: z.object({
            metadata: PaperMetadataSchema,
            text: z.string().describe('Full text content of the document'),
          }),
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Please analyze this exam paper image and extract both the metadata and full text content.',
                },
                {
                  type: 'image',
                  image: base64Image,
                  mimeType,
                },
              ],
            },
          ],
          system: 'You are an AI that extracts metadata from VIT university exam papers. Extract the title, course code, year, slot, semester, and exam type from the document. Also extract all the text content. Be as accurate as possible.',
        })

        metadata = extractedData.metadata
        ocrText = extractedData.text
      } catch (error) {
        console.error('Gemini API error for image:', error)
        return {
          success: false,
          error: 'Failed to process image content. Please ensure the image is clear and readable.',
        }
      }
    }

    const timestamp = Date.now()
    const fileUploadResult = await new Promise<{secure_url: string; public_id: string}>((resolve, reject) => {
      
      if (file.type === 'application/pdf') {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'raw',
            folder: 'vit-papers',
            public_id: `paper_${timestamp}.pdf`,
            use_filename: false,
            unique_filename: false,
          },
          (error: any, result: any) => {
            if (error) {
              console.error('Cloudinary PDF upload error:', error)
              reject(new Error(`Failed to upload PDF: ${error.message}`))
            } else {
              console.log('PDF uploaded successfully:', result.secure_url)
              resolve(result)
            }
          }
        )
        uploadStream.end(fileBuffer)
      } else {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            folder: 'vit-papers',
            public_id: `paper_${timestamp}`,
            quality: 'auto:best',
            fetch_format: 'auto',
            flags: 'progressive',
          },
          (error: any, result: any) => {
            if (error) {
              console.error('Cloudinary image upload error:', error)
              reject(new Error(`Failed to upload image: ${error.message}`))
            } else {
              console.log('Image uploaded successfully:', result.secure_url)
              resolve(result)
            }
          }
        )
        uploadStream.end(fileBuffer)
      }
    })

    let thumbnailUploadResult: {secure_url: string; public_id: string}
    
    if (file.type === 'application/pdf') {
      thumbnailUploadResult = await new Promise<{secure_url: string; public_id: string}>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            folder: 'vit-papers/thumbnails',
            public_id: `thumb_${timestamp}`,
            format: 'webp',
            page: 1,
            width: 800,
            height: 1200,
            crop: 'limit',
            quality: 'auto:good'
          },
          (error: any, result: any) => {
            if (error) {
              console.error('Cloudinary PDF thumbnail error:', error)
              reject(new Error(`Failed to generate PDF thumbnail: ${error.message}`))
            } else {
              console.log('PDF thumbnail generated successfully:', result.secure_url)
              resolve(result)
            }
          }
        )
        uploadStream.end(buffer)
      })
    } else {
      const thumbnailBuffer = await sharp(buffer)
        .resize(800, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer()
      
      thumbnailUploadResult = await new Promise<{secure_url: string; public_id: string}>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            folder: 'vit-papers/thumbnails',
            public_id: `thumb_${Date.now()}`,
            format: 'webp',
            transformation: [
              { width: 800, height: 1200, crop: 'limit' },
              { quality: 'auto:good', fetch_format: 'auto' }
            ],
          },
          (error: any, result: any) => {
            if (error) {
              console.error('Cloudinary thumbnail upload error:', error)
              reject(new Error(`Failed to generate image thumbnail: ${error.message}`))
            } else {
              resolve(result)
            }
          }
        )
        
        uploadStream.end(thumbnailBuffer)
      })
    }

    const newPaper: NewPaper = {
      title: metadata.title || 'Untitled Paper',
      courseCode: metadata.courseCode || null,
      year: metadata.year || null,
      slot: metadata.slot || null,
      semester: metadata.semester || null,
      examType: metadata.examType || null,
      fileUrl: fileUploadResult.secure_url,
      thumbnailUrl: thumbnailUploadResult.secure_url,
      ocrText,
      extractedText: ocrText,
      cloudinaryPublicId: fileUploadResult.public_id,
      thumbnailPublicId: thumbnailUploadResult.public_id,
      originalFilename: file.name,
      fileSize: file.size,
      mimeType: file.type,
    }

    const [insertedPaper] = await db.insert(papers).values(newPaper).returning()

    return {
      success: true,
      paper: {
        id: insertedPaper.id,
        title: insertedPaper.title,
        courseCode: insertedPaper.courseCode || undefined,
        year: insertedPaper.year || undefined,
        slot: insertedPaper.slot || undefined,
        semester: insertedPaper.semester || undefined,
        examType: insertedPaper.examType || undefined,
        fileUrl: insertedPaper.fileUrl,
        thumbnailUrl: insertedPaper.thumbnailUrl,
        ocrText: insertedPaper.ocrText || undefined,
        createdAt: insertedPaper.createdAt,
      },
    }

  } catch (error) {
    console.error('Error uploading paper:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred',
    }
  }
}
