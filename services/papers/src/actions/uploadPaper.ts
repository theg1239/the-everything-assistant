'use server'

import { generateText, Output } from 'ai'
import { openai } from '@ai-sdk/openai'
import {
  v2 as cloudinary,
  type UploadApiOptions,
  type UploadApiResponse,
} from 'cloudinary'
import { PDFDocument, type PDFImage } from 'pdf-lib'
import sharp from 'sharp'
import { db } from '../db'
import { papers, type NewPaper } from '../db/schema'
import { z } from 'zod'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
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
      error: 'Semester must be one of: Fall, Winter, Summer, Spring',
    })
    .describe('The semester when exam was conducted (Fall/Winter/Summer/Spring)'),
  examType: z
    .enum(['CAT-1', 'CAT-2', 'FAT', 'Quiz', 'Assignment', 'Lab'], {
      error: 'Exam type must be one of: CAT-1, CAT-2, FAT, Quiz, Assignment, Lab',
    })
    .describe(
      'Type of assessment: CAT-1 (Continuous Assessment Test 1), CAT-2 (Continuous Assessment Test 2), FAT (Final Assessment Test), Quiz, Assignment, or Lab'
    ),
})

const PaperExtractionSchema = z.object({
  metadata: PaperMetadataSchema,
  text: z.string().describe('Full text content of the document'),
})

type PaperExtraction = z.infer<typeof PaperExtractionSchema>

const EXTRACTION_INSTRUCTIONS =
  'You are an AI that extracts metadata from VIT university exam papers with high accuracy. Follow these extraction rules:\n\n1. TITLE: Extract the full course name exactly as written (e.g., "Computer Programming", "Digital Logic Design", "Mathematics for Engineers")\n2. COURSE CODE: Find the exact alphanumeric course code (e.g., CSE1001, MAT1011, ECE2025, CHE1007)\n3. EXAM TYPE: Identify the assessment type - CAT-1 (Continuous Assessment Test 1), CAT-2 (Continuous Assessment Test 2), FAT (Final Assessment Test), Quiz, Assignment, or Lab\n4. SLOT: Extract the exact slot designation (A1, A2, B1, B2, C1, C2, D1, D2, E1, E2, F1, F2, G1, G2, or L1-L60 for lab slots)\n5. YEAR: Extract the academic year (e.g., 2023, 2024)\n6. SEMESTER: Identify the semester (Fall, Winter, Summer, Spring)\n\nLook for these details in headers, footers, and throughout the document. Be precise and only extract information that is clearly visible. ALL FIELDS ARE REQUIRED - if you cannot find a field, make your best educated guess based on the document content.'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])

export interface UploadedPaper {
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

export interface UploadResult {
  success: boolean
  error?: string
  paper?: UploadedPaper
}

interface CloudinaryUpload {
  secure_url: string
  public_id: string
}

/** Extracts metadata + OCR text from a PDF or image using the LLM, validated by zod. */
async function extractPaperContent(data: Buffer, mediaType: string): Promise<PaperExtraction> {
  const kind = mediaType === 'application/pdf' ? 'PDF' : 'image'
  const { output } = await generateText({
    model: openai('gpt-5.6-luna'),
    output: Output.object({ schema: PaperExtractionSchema }),
    instructions: EXTRACTION_INSTRUCTIONS,
    reasoning: 'none',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Please analyze this exam paper ${kind} and extract both the metadata and full text content.`,
          },
          {
            type: 'file',
            data: { type: 'data', data: data.toString('base64') },
            mediaType,
          },
        ],
      },
    ],
  })
  return output
}

function uploadToCloudinary(
  buffer: Buffer,
  options: UploadApiOptions,
  label: string
): Promise<CloudinaryUpload> {
  return new Promise<CloudinaryUpload>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      options,
      (error, result?: UploadApiResponse) => {
        if (error) {
          console.error(`Cloudinary ${label} error:`, error)
          reject(new Error(`Failed to ${label}: ${error.message}`))
        } else if (!result) {
          reject(new Error(`Failed to ${label}: empty response from Cloudinary`))
        } else {
          console.log(`Cloudinary ${label} succeeded:`, result.secure_url)
          resolve({ secure_url: result.secure_url, public_id: result.public_id })
        }
      }
    )
    uploadStream.end(buffer)
  })
}

export async function uploadPaper(formData: FormData): Promise<UploadResult> {
  try {
    const files = formData.getAll('file').filter((entry): entry is File => entry instanceof File)
    const [firstFile] = files

    if (!firstFile) {
      return { success: false, error: 'No file provided' }
    }

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return {
          success: false,
          error: `File "${file.name}" is too large. Please upload files smaller than 10MB.`,
        }
      }

      if (!ALLOWED_TYPES.has(file.type)) {
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
      finalBuffer = Buffer.from(await firstFile.arrayBuffer())
      finalMimeType = firstFile.type
      combinedFilename = firstFile.name
      console.log(
        `Processing single file: ${firstFile.name}, size: ${firstFile.size} bytes, type: ${firstFile.type}`
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
          let image: PDFImage
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
      combinedFilename = `combined_paper_${files.length}_files.pdf`
      console.log(`Combined PDF created, size: ${finalBuffer.length} bytes`)
    }

    const isPdf = finalMimeType === 'application/pdf'

    if (isPdf) {
      try {
        await PDFDocument.load(finalBuffer)
      } catch {
        return {
          success: false,
          error: 'Invalid PDF file. Please ensure the file is not corrupted.',
        }
      }
    }

    let extraction: PaperExtraction
    try {
      extraction = await extractPaperContent(finalBuffer, finalMimeType)
    } catch (error) {
      console.error(`OpenAI API error for ${isPdf ? 'PDF' : 'image'}:`, error)
      return {
        success: false,
        error: isPdf
          ? 'Failed to process PDF content. Please ensure the PDF contains clear exam paper information and try again.'
          : 'Failed to process image content. Please ensure the image contains clear exam paper information and is readable.',
      }
    }

    const { metadata, text: ocrText } = extraction

    const timestamp = Date.now()
    const fileUploadResult = isPdf
      ? await uploadToCloudinary(
          finalBuffer,
          {
            resource_type: 'raw',
            folder: 'vit-papers',
            public_id: `paper_${timestamp}.pdf`,
            use_filename: false,
            unique_filename: false,
          },
          'upload PDF'
        )
      : await uploadToCloudinary(
          finalBuffer,
          {
            resource_type: 'image',
            folder: 'vit-papers',
            public_id: `paper_${timestamp}`,
            quality: 'auto:best',
            fetch_format: 'auto',
            flags: 'progressive',
          },
          'upload image'
        )

    let thumbnailUploadResult: CloudinaryUpload

    if (isPdf) {
      thumbnailUploadResult = await uploadToCloudinary(
        finalBuffer,
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
        'generate PDF thumbnail'
      )
    } else {
      const thumbnailBuffer = await sharp(finalBuffer)
        .resize(800, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer()

      thumbnailUploadResult = await uploadToCloudinary(
        thumbnailBuffer,
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
        'generate image thumbnail'
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

    if (!insertedPaper) {
      return { success: false, error: 'Failed to save paper' }
    }

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
