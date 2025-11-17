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
  title: z
    .string()
    .min(1, 'Title is required')
    .describe(
      'The full course name/title as written on the exam paper (e.g., "Computer Programming", "Mathematics for Engineers", "Digital Logic Design")'
    ),
  courseCode: z
    .string()
    .min(1, 'Course code is required')
    .describe('The exact course code as written (e.g., CSE1001, MAT1011, ECE2025, CHE1007)'),
  year: z
    .number()
    .min(2000)
    .max(2030, 'Year must be between 2000-2030')
    .describe('The academic year when the exam was conducted (e.g., 2023, 2024)'),
  slot: z
    .string()
    .min(1, 'Slot is required')
    .describe(
      'The exact slot as written on the paper (e.g., A1, A2, B1, B2, C1, C2, D1, D2, E1, E2, F1, F2, G1, G2, L1-L60)'
    ),
  semester: z
    .enum(['Fall', 'Winter', 'Summer', 'Spring'], {
      errorMap: () => ({ message: 'Semester must be one of: Fall, Winter, Summer, Spring' }),
    })
    .describe('The semester when exam was conducted (Fall/Winter/Summer/Spring)'),
  examType: z
    .enum(['CAT-1', 'CAT-2', 'FAT', 'Quiz', 'Assignment', 'Lab'], {
      errorMap: () => ({
        message: 'Exam type must be one of: CAT-1, CAT-2, FAT, Quiz, Assignment, Lab',
      }),
    })
    .describe(
      'Type of assessment: CAT-1 (Continuous Assessment Test 1), CAT-2 (Continuous Assessment Test 2), FAT (Final Assessment Test), Quiz, Assignment, or Lab'
    ),
})

type PaperMetadata = z.infer<typeof PaperMetadataSchema>

interface UploadResult {
  success: boolean
  error?: string
  paper?: {
    id: string
    title: string
    courseCode: string
    year: number
    slot: string
    semester: string
    examType: string
    fileUrl: string
    thumbnailUrl: string
    ocrText?: string
    createdAt: Date
  }
}

export async function uploadPaper(formData: FormData): Promise<UploadResult> {
  try {
    const files = formData.getAll('file') as File[]

    if (!files || files.length === 0) {
      return { success: false, error: 'No file provided' }
    }

    const maxFileSize = 10 * 1024 * 1024
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

    for (const file of files) {
      if (file.size > maxFileSize) {
        return {
          success: false,
          error: `File "${file.name}" is too large. Please upload files smaller than 10MB.`,
        }
      }

      if (!allowedTypes.includes(file.type)) {
        return {
          success: false,
          error: `Invalid file type for "${file.name}". Please upload PDF or image files (JPEG, PNG, WebP)`,
        }
      }
    }

    console.log(`Processing ${files.length} file(s)`)

    let finalBuffer: Buffer
    let finalMimeType: string
    let combinedFilename: string

    if (files.length === 1) {
      const file = files[0]
      finalBuffer = Buffer.from(await file.arrayBuffer())
      finalMimeType = file.type
      combinedFilename = file.name
      console.log(
        `Processing single file: ${file.name}, size: ${file.size} bytes, type: ${file.type}`
      )
    } else {
      console.log(`Combining ${files.length} files into a single PDF`)
      const pdfDoc = await PDFDocument.create()

      for (const file of files) {
        const buffer = Buffer.from(await file.arrayBuffer())
        console.log(`Processing file: ${file.name}, size: ${file.size} bytes, type: ${file.type}`)

        if (file.type === 'application/pdf') {
          const existingPdf = await PDFDocument.load(buffer)
          const pages = await pdfDoc.copyPages(existingPdf, existingPdf.getPageIndices())
          pages.forEach(page => pdfDoc.addPage(page))
        } else {
          let image
          if (file.type === 'image/png') {
            image = await pdfDoc.embedPng(buffer)
          } else if (file.type === 'image/jpeg') {
            image = await pdfDoc.embedJpg(buffer)
          } else {
            const pngBuffer = await sharp(buffer).png().toBuffer()
            image = await pdfDoc.embedPng(pngBuffer)
          }

          const page = pdfDoc.addPage()
          const { width, height } = image.scale(1)

          const pageWidth = page.getWidth()
          const pageHeight = page.getHeight()
          const scale = Math.min(pageWidth / width, pageHeight / height)

          const scaledWidth = width * scale
          const scaledHeight = height * scale

          page.drawImage(image, {
            x: (pageWidth - scaledWidth) / 2,
            y: (pageHeight - scaledHeight) / 2,
            width: scaledWidth,
            height: scaledHeight,
          })
        }
      }

      finalBuffer = Buffer.from(await pdfDoc.save())
      finalMimeType = 'application/pdf'
      combinedFilename =
        files.length > 1 ? `combined_paper_${files.length}_files.pdf` : files[0].name
      console.log(`Combined PDF created, size: ${finalBuffer.length} bytes`)
    }

    let ocrText = ''
    let metadata: PaperMetadata
    let fileBuffer = finalBuffer

    if (finalMimeType === 'application/pdf') {
      try {
        await PDFDocument.load(finalBuffer)
      } catch (error) {
        return {
          success: false,
          error: 'Invalid PDF file. Please ensure the file is not corrupted.',
        }
      }

      const base64Pdf = finalBuffer.toString('base64')

      try {
        const { object: extractedData } = await generateObject({
          model: google('gemini-flash-latest'),
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
          system:
            'You are an AI that extracts metadata from VIT university exam papers with high accuracy. Follow these extraction rules:\n\n1. TITLE: Extract the full course name exactly as written (e.g., "Computer Programming", "Digital Logic Design", "Mathematics for Engineers")\n2. COURSE CODE: Find the exact alphanumeric course code (e.g., CSE1001, MAT1011, ECE2025, CHE1007)\n3. EXAM TYPE: Identify the assessment type - CAT-1 (Continuous Assessment Test 1), CAT-2 (Continuous Assessment Test 2), FAT (Final Assessment Test), Quiz, Assignment, or Lab\n4. SLOT: Extract the exact slot designation (A1, A2, B1, B2, C1, C2, D1, D2, E1, E2, F1, F2, G1, G2, or L1-L60 for lab slots)\n5. YEAR: Extract the academic year (e.g., 2023, 2024)\n6. SEMESTER: Identify the semester (Fall, Winter, Summer, Spring)\n\nLook for these details in headers, footers, and throughout the document. Be precise and only extract information that is clearly visible. ALL FIELDS ARE REQUIRED - if you cannot find a field, make your best educated guess based on the document content.',
        })

        const validationResult = PaperMetadataSchema.safeParse(extractedData.metadata)
        if (!validationResult.success) {
          console.error('Schema validation failed for PDF:', validationResult.error.issues)
          return {
            success: false,
            error: `Failed to extract required metadata from PDF: ${validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`,
          }
        }

        metadata = validationResult.data
        ocrText = extractedData.text
      } catch (error) {
        console.error('Gemini API error for PDF:', error)
        return {
          success: false,
          error:
            'Failed to process PDF content. Please ensure the PDF contains clear exam paper information and try again.',
        }
      }
    } else {
      const base64Image = finalBuffer.toString('base64')
      const mimeType = finalMimeType

      try {
        const { object: extractedData } = await generateObject({
          model: google('gemini-flash-latest'),
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
          system:
            'You are an AI that extracts metadata from VIT university exam papers with high accuracy. Follow these extraction rules:\n\n1. TITLE: Extract the full course name exactly as written (e.g., "Computer Programming", "Digital Logic Design", "Mathematics for Engineers")\n2. COURSE CODE: Find the exact alphanumeric course code (e.g., CSE1001, MAT1011, ECE2025, CHE1007)\n3. EXAM TYPE: Identify the assessment type - CAT-1 (Continuous Assessment Test 1), CAT-2 (Continuous Assessment Test 2), FAT (Final Assessment Test), Quiz, Assignment, or Lab\n4. SLOT: Extract the exact slot designation (A1, A2, B1, B2, C1, C2, D1, D2, E1, E2, F1, F2, G1, G2, or L1-L60 for lab slots)\n5. YEAR: Extract the academic year (e.g., 2023, 2024)\n6. SEMESTER: Identify the semester (Fall, Winter, Summer, Spring)\n\nLook for these details in headers, footers, and throughout the document. Be precise and only extract information that is clearly visible. ALL FIELDS ARE REQUIRED - if you cannot find a field, make your best educated guess based on the document content.',
        })

        const validationResult = PaperMetadataSchema.safeParse(extractedData.metadata)
        if (!validationResult.success) {
          console.error('Schema validation failed for image:', validationResult.error.issues)
          return {
            success: false,
            error: `Failed to extract required metadata from image: ${validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`,
          }
        }

        metadata = validationResult.data
        ocrText = extractedData.text
      } catch (error) {
        console.error('Gemini API error for image:', error)
        return {
          success: false,
          error:
            'Failed to process image content. Please ensure the image contains clear exam paper information and is readable.',
        }
      }
    }

    const timestamp = Date.now()
    const fileUploadResult = await new Promise<{ secure_url: string; public_id: string }>(
      (resolve, reject) => {
        if (finalMimeType === 'application/pdf') {
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
      }
    )

    let thumbnailUploadResult: { secure_url: string; public_id: string }

    if (finalMimeType === 'application/pdf') {
      thumbnailUploadResult = await new Promise<{ secure_url: string; public_id: string }>(
        (resolve, reject) => {
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
              quality: 'auto:good',
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
          uploadStream.end(finalBuffer)
        }
      )
    } else {
      const thumbnailBuffer = await sharp(finalBuffer)
        .resize(800, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer()

      thumbnailUploadResult = await new Promise<{ secure_url: string; public_id: string }>(
        (resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              resource_type: 'image',
              folder: 'vit-papers/thumbnails',
              public_id: `thumb_${Date.now()}`,
              format: 'webp',
              transformation: [
                { width: 800, height: 1200, crop: 'limit' },
                { quality: 'auto:good', fetch_format: 'auto' },
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
        }
      )
    }

    const newPaper: NewPaper = {
      title: metadata.title,
      courseCode: metadata.courseCode,
      year: metadata.year,
      slot: metadata.slot,
      semester: metadata.semester,
      examType: metadata.examType,
      fileUrl: fileUploadResult.secure_url,
      thumbnailUrl: thumbnailUploadResult.secure_url,
      ocrText,
      extractedText: ocrText,
      cloudinaryPublicId: fileUploadResult.public_id,
      thumbnailPublicId: thumbnailUploadResult.public_id,
      originalFilename: combinedFilename,
      fileSize: finalBuffer.length,
      mimeType: finalMimeType,
    }

    const [insertedPaper] = await db.insert(papers).values(newPaper).returning()

    return {
      success: true,
      paper: {
        id: insertedPaper.id,
        title: insertedPaper.title,
        courseCode: insertedPaper.courseCode,
        year: insertedPaper.year,
        slot: insertedPaper.slot,
        semester: insertedPaper.semester,
        examType: insertedPaper.examType,
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
