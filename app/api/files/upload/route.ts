import { NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { nanoid } from 'nanoid'
import { auth } from '@/lib/auth'

const MAX_FILE_MB = 25

type UploadType = { contentType: string; inline: boolean }

/**
 * Content type from the file's magic bytes; the client-claimed type is not
 * trusted. Only raster images are served inline; PDFs are served as attachments.
 * Everything else (SVG, HTML, ...) is rejected: the bucket is public.
 */
function detectUploadType(bytes: Uint8Array): UploadType | null {
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((byte, i) => bytes[offset + i] === byte)
  const ascii = (text: string) => Array.from(text, char => char.charCodeAt(0))

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: 'image/png', inline: true }
  }
  if (startsWith([0xff, 0xd8, 0xff])) return { contentType: 'image/jpeg', inline: true }
  if (startsWith(ascii('GIF87a')) || startsWith(ascii('GIF89a'))) {
    return { contentType: 'image/gif', inline: true }
  }
  if (startsWith(ascii('RIFF')) && startsWith(ascii('WEBP'), 8)) {
    return { contentType: 'image/webp', inline: true }
  }
  if (startsWith(ascii('%PDF-'))) return { contentType: 'application/pdf', inline: false }
  return null
}

const getEnv = (key: string) => process.env[key]

const getS3Client = () => {
  const endpoint = getEnv('R2_ENDPOINT')
  const accessKeyId = getEnv('R2_ACCESS_KEY_ID')
  const secretAccessKey = getEnv('R2_SECRET_ACCESS_KEY')

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing R2 credentials (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)')
  }

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })
}

const buildPublicUrl = (bucket: string, key: string) => {
  const base = getEnv('R2_PUBLIC_BASE_URL') || getEnv('R2_ENDPOINT')
  if (!base) return ''

  const trimmed = base.replace(/\/$/, '')
  if (getEnv('R2_PUBLIC_BASE_URL')) {
    return `${trimmed}/${encodeURIComponent(key)}`
  }
  return `${trimmed}/${bucket}/${encodeURIComponent(key)}`
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (request.body === null) {
    return NextResponse.json({ error: 'Request body is empty' }, { status: 400 })
  }

  const bucket = getEnv('R2_UPLOAD_BUCKET')
  if (!bucket) {
    return NextResponse.json({ error: 'R2_UPLOAD_BUCKET is not configured' }, { status: 500 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const sizeMb = file.size / (1024 * 1024)
    if (sizeMb > MAX_FILE_MB) {
      return NextResponse.json({ error: `File size exceeds ${MAX_FILE_MB}MB limit` }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const detected = detectUploadType(buffer)
    if (!detected) {
      return NextResponse.json(
        { error: 'Only PNG, JPEG, WebP, GIF images and PDFs are supported right now' },
        { status: 415 }
      )
    }

    const safeName = file.name?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload'
    const key = `${session.user.id}/${Date.now()}-${nanoid(8)}-${safeName}`

    const client = getS3Client()
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: detected.contentType,
        ContentDisposition: `${detected.inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
        Metadata: {
          uploader: session.user.id,
          originalName: safeName,
        },
      })
    )

    const url = buildPublicUrl(bucket, key)

    return NextResponse.json({
      url,
      key,
      contentType: detected.contentType,
      name: safeName,
    })
  } catch (error) {
    console.error('File upload failed', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
