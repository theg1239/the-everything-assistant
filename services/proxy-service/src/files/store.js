'use strict'

const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
const { deriveKey } = require('../workflow/token')

const CONTENT_TYPES = {
  '.pdf': 'application/pdf',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
  '.ics': 'text/calendar; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
}
const INLINE_SAFE = new Set(['application/pdf', 'image/png', 'image/jpeg'])
const ID_PATTERN = /^[A-Za-z0-9_-]{16,40}$/
const INGEST_CONCURRENCY = 8

/** Promise.all with at most `limit` tasks in flight; results keep input order. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32Update(crc, buffer) {
  let c = crc ^ 0xffffffff
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

async function crc32File(file) {
  let crc = 0
  for await (const chunk of fs.createReadStream(file)) crc = crc32Update(crc, chunk)
  return crc
}

function safeName(name) {
  const base = path.basename(String(name || 'file')).replace(/[\u0000-\u001f\u007f/\\]/g, '_').trim()
  return base && base !== '.' && base !== '..' ? base.slice(0, 200) : 'file'
}

function contentDisposition(type, name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\%]/g, '_')
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/**
 * Holds files cli-top downloaded (course materials, syllabus, DA question papers, .ics files)
 * after the per-run directory is deleted. Files live in one flat directory under random ids,
 * metadata stays in memory, and downloads require an HMAC-signed, expiring URL (the URL is the
 * capability; it is only ever returned to the authenticated caller who triggered the download).
 */
class FileStore {
  constructor({ dir, ttlSeconds, maxBytes, secret, logger }) {
    this.dir = dir
    this.ttlMs = ttlSeconds * 1000
    this.maxBytes = maxBytes
    this.key = deriveKey(secret, 'vtop-proxy/file-url/v1')
    this.logger = logger
    this.files = new Map()
    this.bundles = new Map()
    this.totalBytes = 0
    this.timer = null
  }

  async init() {
    // Metadata is in-memory, so files from a previous process are unreachable: start clean.
    await fsp.rm(this.dir, { recursive: true, force: true })
    await fsp.mkdir(this.dir, { recursive: true, mode: 0o700 })
    this.timer = setInterval(() => void this.sweep(), 60_000)
    this.timer.unref()
  }

  stop() {
    clearInterval(this.timer)
  }

  newId() {
    return crypto.randomBytes(18).toString('base64url')
  }

  async ingest(downloads, { owner }) {
    // Move + checksum files concurrently (bounded); order of the result follows `downloads`.
    const stored = await mapLimit(downloads, INGEST_CONCURRENCY, async download => {
      const id = this.newId()
      const target = path.join(this.dir, id)
      try {
        await fsp.rename(download.absPath, target)
      } catch {
        await fsp.copyFile(download.absPath, target)
        await fsp.rm(download.absPath, { force: true })
      }
      const name = safeName(download.relPath)
      return {
        id,
        name,
        relPath: download.relPath.split(path.sep).join('/'),
        size: download.size,
        contentType: CONTENT_TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream',
        crc32: await crc32File(target),
        owner,
        createdAt: Date.now(),
        expiresAt: Date.now() + this.ttlMs,
      }
    })
    for (const meta of stored) {
      this.files.set(meta.id, meta)
      this.totalBytes += meta.size
    }
    await this.enforceQuota()
    return stored
  }

  createBundle(files, name) {
    const id = this.newId()
    const bundle = {
      id,
      name: safeName(name.endsWith('.zip') ? name : `${name}.zip`),
      fileIds: files.map(file => file.id),
      size: files.reduce((sum, file) => sum + file.size, 0),
      expiresAt: Math.min(...files.map(file => file.expiresAt)),
    }
    this.bundles.set(id, bundle)
    return bundle
  }

  sign(kind, id, exp) {
    return crypto.createHmac('sha256', this.key).update(`${kind}:${id}:${exp}`).digest('base64url')
  }

  verify(kind, id, exp, sig) {
    if (!ID_PATTERN.test(id || '') || !/^\d{10,13}$/.test(String(exp || '')) || typeof sig !== 'string') return false
    if (parseInt(exp, 10) * 1000 < Date.now()) return false
    const expected = Buffer.from(this.sign(kind, id, exp))
    const provided = Buffer.from(sig)
    return expected.length === provided.length && crypto.timingSafeEqual(expected, provided)
  }

  /** Public, signed descriptor for API responses (relative URL; HTTP layer makes it absolute). */
  describe(meta) {
    const exp = Math.floor(meta.expiresAt / 1000)
    return {
      id: meta.id,
      name: meta.name,
      path: meta.relPath,
      size: meta.size,
      contentType: meta.contentType,
      expiresAt: new Date(meta.expiresAt).toISOString(),
      url: `/files/${meta.id}/${encodeURIComponent(meta.name)}?exp=${exp}&sig=${this.sign('f', meta.id, exp)}`,
    }
  }

  describeBundle(bundle) {
    const exp = Math.floor(bundle.expiresAt / 1000)
    return {
      id: bundle.id,
      name: bundle.name,
      count: bundle.fileIds.length,
      size: bundle.size,
      expiresAt: new Date(bundle.expiresAt).toISOString(),
      url: `/files/bundle/${bundle.id}/${encodeURIComponent(bundle.name)}?exp=${exp}&sig=${this.sign('b', bundle.id, exp)}`,
    }
  }

  isAlive(id) {
    const meta = this.files.get(id)
    return Boolean(meta && meta.expiresAt > Date.now())
  }

  async remove(id) {
    const meta = this.files.get(id)
    if (!meta) return
    this.files.delete(id)
    this.totalBytes -= meta.size
    await fsp.rm(path.join(this.dir, id), { force: true })
  }

  async sweep() {
    const now = Date.now()
    const expired = [...this.files.values()].filter(meta => meta.expiresAt <= now)
    await mapLimit(expired, INGEST_CONCURRENCY, meta => this.remove(meta.id))
    for (const [id, bundle] of this.bundles) if (bundle.expiresAt <= now) this.bundles.delete(id)
  }

  async enforceQuota() {
    if (this.totalBytes <= this.maxBytes) return
    const oldest = [...this.files.values()].sort((a, b) => a.createdAt - b.createdAt)
    for (const meta of oldest) {
      if (this.totalBytes <= this.maxBytes) break
      await this.remove(meta.id)
    }
  }

  stats() {
    return { files: this.files.size, bytes: this.totalBytes, bundles: this.bundles.size }
  }

  /** GET /files/:id/:name?exp&sig */
  fileHandler() {
    return (req, res) => {
      const { id } = req.params
      const { exp, sig } = req.query
      if (!this.verify('f', id, exp, sig)) return res.status(403).json({ error: 'Invalid or expired download link' })
      const meta = this.files.get(id)
      if (!meta || meta.expiresAt <= Date.now()) return res.status(410).json({ error: 'File has expired' })
      const inline = req.query.inline === '1' && INLINE_SAFE.has(meta.contentType)
      res.set({
        'Content-Type': meta.contentType,
        'Content-Length': String(meta.size),
        'Content-Disposition': contentDisposition(inline ? 'inline' : 'attachment', meta.name),
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      })
      const stream = fs.createReadStream(path.join(this.dir, id))
      stream.on('error', () => {
        if (!res.headersSent) res.status(410).json({ error: 'File no longer available' })
        else res.destroy()
      })
      stream.pipe(res)
    }
  }

  /** GET /files/bundle/:id/:name?exp&sig -- store-only ZIP streamed from disk. */
  bundleHandler() {
    return async (req, res) => {
      const { id } = req.params
      const { exp, sig } = req.query
      if (!this.verify('b', id, exp, sig)) return res.status(403).json({ error: 'Invalid or expired download link' })
      const bundle = this.bundles.get(id)
      const files = bundle ? bundle.fileIds.map(fileId => this.files.get(fileId)) : []
      if (!bundle || bundle.expiresAt <= Date.now() || files.some(file => !file)) {
        return res.status(410).json({ error: 'Bundle has expired' })
      }
      res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': contentDisposition('attachment', bundle.name),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      try {
        await writeZip(res, files.map(file => ({ ...file, absPath: path.join(this.dir, file.id) })))
        res.end()
      } catch (error) {
        this.logger.warn('[files] bundle stream failed:', error.message)
        res.destroy(error)
      }
    }
  }
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

const write = (stream, chunk) =>
  new Promise((resolve, reject) => {
    if (stream.write(chunk)) return resolve()
    stream.once('drain', resolve)
    stream.once('error', reject)
  })

/** Minimal ZIP writer (stored entries, UTF-8 names, CRCs precomputed at ingest). */
async function writeZip(out, files) {
  const { time, day } = dosDateTime(new Date())
  const central = []
  let offset = 0
  const used = new Set()
  for (const file of files) {
    let name = file.relPath
    for (let n = 2; used.has(name); n++) name = file.relPath.replace(/(\.[^./]+)?$/, `-${n}$1`)
    used.add(name)
    const nameBuf = Buffer.from(name, 'utf8')
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0x0800, 6)
    header.writeUInt16LE(0, 8)
    header.writeUInt16LE(time, 10)
    header.writeUInt16LE(day, 12)
    header.writeUInt32LE(file.crc32, 14)
    header.writeUInt32LE(file.size, 18)
    header.writeUInt32LE(file.size, 22)
    header.writeUInt16LE(nameBuf.length, 26)
    header.writeUInt16LE(0, 28)
    await write(out, header)
    await write(out, nameBuf)
    for await (const chunk of fs.createReadStream(file.absPath)) await write(out, chunk)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(0x0800, 8)
    entry.writeUInt16LE(0, 10)
    entry.writeUInt16LE(time, 12)
    entry.writeUInt16LE(day, 14)
    entry.writeUInt32LE(file.crc32, 16)
    entry.writeUInt32LE(file.size, 20)
    entry.writeUInt32LE(file.size, 24)
    entry.writeUInt16LE(nameBuf.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(Buffer.concat([entry, nameBuf]))
    offset += 30 + nameBuf.length + file.size
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  await write(out, directory)
  await write(out, end)
}

module.exports = { FileStore, safeName, contentDisposition, crc32Update, mapLimit }
