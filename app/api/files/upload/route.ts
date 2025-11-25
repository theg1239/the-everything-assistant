import { NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { nanoid } from 'nanoid'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const MAX_FILE_MB = 25
const ALLOWED_PREFIXES = ['image/', 'application/pdf']

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
  const session = await getServerSession(authOptions)
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
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const sizeMb = file.size / (1024 * 1024)
    if (sizeMb > MAX_FILE_MB) {
      return NextResponse.json({ error: `File size exceeds ${MAX_FILE_MB}MB limit` }, { status: 400 })
    }

    const isAllowed = ALLOWED_PREFIXES.some(prefix => file.type.startsWith(prefix))
    if (!isAllowed) {
      return NextResponse.json({ error: 'Only images and PDFs are supported right now' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const safeName = (file as File).name?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload'
    const key = `${session.user.id}/${Date.now()}-${nanoid(8)}-${safeName}`

    const client = getS3Client()
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        Metadata: {
          uploader: session.user.email || session.user.id,
          originalName: safeName,
        },
      })
    )

    const url = buildPublicUrl(bucket, key)

    return NextResponse.json({
      url,
      key,
      contentType: file.type,
      name: safeName,
    })
  } catch (error) {
    console.error('File upload failed', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
