import { scrapePapersService } from '../scrapers/papers-scraper'
import { scrapePapersCodeChef } from '../scrapers/papers-codechef'
import { scrapeVITPaperVault } from '../scrapers/vit-papervault'
import { getCourseCode } from '../question-generator'
import { getAllCourseMatches } from '../course-map'
import rateLimitedAI from '../ai/rate-limited-ai'
import {
  ensurePaperSchema,
  insertPaper,
  findPaperByUrl,
  loadChunksAndQuestions,
  createIndexRecord,
  linkIndexPapers,
  getIndexMetaById,
  getIndexPaperIds,
  getPapersByIds,
  upsertChunks,
  upsertQuestionEmbeddings,
  semanticRankQuestion,
  questionEmbeddingScores,
  getCoursePapers,
} from '../papers-db'

import { paperProgress } from '../progress/paper-progress'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import { existsSync } from 'fs'
import { PDFDocument } from 'pdf-lib'

async function computeHash(buf: Buffer | Uint8Array): Promise<string> {
  try {
    const data = buf instanceof Buffer ? buf : Buffer.from(buf)
    const subtle: any = (globalThis as any).crypto?.subtle
    if (subtle) {
      const hashBuf = await subtle.digest('SHA-256', data)
      return Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    }
    const { createHash } = await import('crypto')
    return createHash('sha256').update(data).digest('hex')
  } catch {
    return Math.random().toString(36).slice(2)
  }
}

interface Logger {
  (msg: string, data?: any): void
  getLogs(): string[]
}

async function fetchAllPapers(courseCode: string, examType?: string, year?: string, log?: Logger) {
  log?.('Fetching papers from all sources', { courseCode, examType, year })
  const started = Date.now()
  const results = await Promise.allSettled([
    scrapePapersService(courseCode, examType, year),
    scrapePapersCodeChef(courseCode, examType, year),
    scrapeVITPaperVault(courseCode, examType, year),
  ])
  const papers: RawPaperMeta[] = []
  results.forEach((r, idx) => {
    if (r.status === 'fulfilled' && r.value.success) {
      log?.('Source success', { sourceIndex: idx, count: r.value.papers.length })
      papers.push(...r.value.papers)
    } else {
      log?.('Source failure', { sourceIndex: idx, error: r })
    }
  })

  const extractDriveId = (url?: string) => {
    if (!url) return null
    const m = url.match(/https?:\/\/drive\.google\.com\/file\/d\/([^/]+)\//)
    return m ? m[1] : null
  }
  const normalizeUrl = (url?: string) => {
    if (!url) return ''
    try {
      const u = new URL(url)
      u.search = ''
      return u.toString().replace(/\/view$/, '')
    } catch {
      return url
    }
  }
  const normalizeTitle = (t?: string) =>
    (t || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\([^)]*\)/g, '')
      .replace(/cat[- ]?\d/gi, m => m.toUpperCase())
      .trim()

  function jaccardTokens(a: string, b: string) {
    const toks = (s: string) => Array.from(new Set(s.split(/[^a-z0-9]+/).filter(Boolean)))
    const A = toks(a)
    const B = toks(b)
    if (!A.length || !B.length) return 0
    let inter = 0
    for (const t of A) if (B.includes(t)) inter++
    return inter / (new Set([...A, ...B]).size || 1)
  }

  interface Annotated extends RawPaperMeta {
    _normUrl: string
    _driveId: string | null
    _normTitle: string
  }
  const annotated: Annotated[] = papers.map(p => ({
    ...p,
    _normUrl: normalizeUrl(p.url),
    _driveId: extractDriveId(p.url),
    _normTitle: normalizeTitle(p.title),
  }))

  const byKey: Annotated[] = []
  const urlSeen = new Set<string>()
  const driveSeen = new Set<string>()
  for (const p of annotated) {
    if (p._driveId) {
      if (driveSeen.has(p._driveId)) continue
      driveSeen.add(p._driveId)
    } else {
      if (urlSeen.has(p._normUrl)) continue
      urlSeen.add(p._normUrl)
    }
    byKey.push(p)
  }

  const final: Annotated[] = []
  for (const p of byKey) {
    const dup = final.find(
      f =>
        f.examType === p.examType &&
        f.year === p.year &&
        jaccardTokens(f._normTitle, p._normTitle) >= 0.88
    )
    if (dup) continue
    final.push(p)
  }

  log?.('Fetched & deduped papers', {
    totalRaw: papers.length,
    stage1_keys: byKey.length,
    totalDeduped: final.length,
    ms: Date.now() - started,
  })
  return final.map(({ _normUrl, _driveId, _normTitle, ...rest }) => rest)
}

function toDirectDrive(url: string): string {
  const m = url.match(/https:\/\/drive\.google\.com\/file\/d\/([^/]+)\//)
  if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`
  return url
}

interface DriveFallbackResult {
  pdf: Buffer | null
  images: Buffer[]
}

let sharedBrowser: any = null
let sharedBrowserUsageCount = 0
const MAX_SHARED_BROWSER_USAGE = 10
let launchingBrowserPromise: Promise<any> | null = null

async function getOrCreateSharedBrowser(log?: Logger): Promise<any> {
  if (sharedBrowser && sharedBrowserUsageCount < MAX_SHARED_BROWSER_USAGE) {
    sharedBrowserUsageCount++
    return sharedBrowser
  }

  if (!launchingBrowserPromise) {
    launchingBrowserPromise = (async () => {
      if (sharedBrowser) {
        try {
          await sharedBrowser.close()
          log?.('Closed previous shared browser instance')
        } catch (e) {
          log?.('Error closing previous browser (continuing)', { error: (e as Error)?.message })
        } finally {
          sharedBrowser = null
        }
      }

      log?.('Creating new shared browser instance')

      const preferSystem =
        process.env.PAPER_AGENT_USE_SYSTEM_BROWSER === '1' || process.env.NODE_ENV === 'development'
      const explicitPath = process.env.PAPER_AGENT_BROWSER_PATH

      function resolveSystemBrowserPath(): string | null {
        if (explicitPath && existsSync(explicitPath)) return explicitPath
        const plat = process.platform
        const candidates: string[] = []
        if (plat === 'win32') {
          const pf = process.env['PROGRAMFILES'] || 'C:/Program Files'
          const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)'
          const local = process.env['LOCALAPPDATA'] || 'C:/Users/Default/AppData/Local'
          candidates.push(
            `${pf}/Google/Chrome/Application/chrome.exe`,
            `${pf86}/Google/Chrome/Application/chrome.exe`,
            `${local}/Google/Chrome/Application/chrome.exe`,
            `${pf}/Microsoft/Edge/Application/msedge.exe`,
            `${pf86}/Microsoft/Edge/Application/msedge.exe`,
            `${local}/Microsoft/Edge/Application/msedge.exe`
          )
        } else if (plat === 'darwin') {
          candidates.push(
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
          )
        } else {
          candidates.push(
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/microsoft-edge',
            '/usr/bin/brave-browser'
          )
        }
        for (const p of candidates) {
          try {
            if (existsSync(p)) return p
          } catch {}
        }
        return null
      }

      // Hardened args for serverless environments
      let args = [
        ...chromium.args,
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
        '--headless=new',
      ]

      const sysPath = (preferSystem && resolveSystemBrowserPath()) || undefined
      if (sysPath) {
        sharedBrowser = await puppeteer.launch({
          args,
          defaultViewport: { width: 1280, height: 1024 },
          executablePath: sysPath,
          headless: true,
        })
      } else {
        sharedBrowser = await puppeteer.launch({
          args,
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
        })
      }
      sharedBrowserUsageCount = 0
      return sharedBrowser
    })()
      .catch(e => {
        log?.('Browser launch failed', { error: (e as Error)?.message })
        throw e
      })
      .finally(() => {
        // allow next launch attempt if needed
        launchingBrowserPromise = null
      })
  }

  const b = await launchingBrowserPromise
  sharedBrowser = b
  sharedBrowserUsageCount++
  return b
}

async function cleanupSharedBrowser(log?: Logger): Promise<void> {
  if (sharedBrowser) {
    try {
      await sharedBrowser.close()
      log?.('Shared browser cleaned up successfully')
    } catch (e) {
      log?.('Error during shared browser cleanup', { error: (e as Error)?.message })
    } finally {
      sharedBrowser = null
      sharedBrowserUsageCount = 0
    }
  }
}

/**
 * Cloudinary PDF page image derivation
 * Example raw PDF: https://res.cloudinary.com/<cloud>/raw/upload/v12345/folder/file.pdf
 * Page image URL:  https://res.cloudinary.com/<cloud>/image/upload/pg_1/v12345/folder/file.png
 */
function toCloudinaryPageImageUrls(pdfUrl: string, pages = 4): string[] | null {
  try {
    const m = pdfUrl.match(
      /^https?:\/\/res\.cloudinary\.com\/([^/]+)\/raw\/upload\/(.+\.pdf)(?:$|\?)/i
    )
    if (!m) return null
    const cloud = m[1]
    let publicId = m[2]
    if (publicId.endsWith('.pdf')) publicId = publicId.slice(0, -4)
    const urls: string[] = []
    for (let i = 1; i <= pages; i++) {
      urls.push(`https://res.cloudinary.com/${cloud}/image/upload/pg_${i}/${publicId}.png`)
    }
    return urls
  } catch {
    return null
  }
}

function toCloudinaryFetchPageImageUrls(pdfUrl: string, pages = 4): string[] | null {
  try {
    const m = pdfUrl.match(/^https?:\/\/res\.cloudinary\.com\/([^/]+)\//i)
    if (!m) return null
    const cloud = m[1]
    const encoded = encodeURIComponent(pdfUrl)
    const urls: string[] = []
    for (let i = 1; i <= pages; i++) {
      // Request Cloudinary to fetch the remote PDF and render page i as PNG
      urls.push(`https://res.cloudinary.com/${cloud}/image/fetch/f_png,pg_${i}/${encoded}`)
    }
    return urls
  } catch {
    return null
  }
}

async function fetchAsBuffer(
  url: string,
  timeoutMs = 10000,
  headers?: Record<string, string>
): Promise<Buffer | null> {
  try {
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
    if (!resp.ok) return null
    const ab = await resp.arrayBuffer()
    if (!ab || ab.byteLength < 500) return null
    return Buffer.from(ab)
  } catch {
    return null
  }
}

/** Headless capture that always produces images (canvas/img first; else viewport scroll screenshots). */
async function genericHeadlessPdfToImages(
  url: string,
  log?: Logger,
  runId?: string
): Promise<DriveFallbackResult> {
  let browser: any
  let page: any
  try {
    log?.('Generic PDF headless capture start', { url })
    if (runId) logEmit(runId, 'trying with agent', { url })

    await new Promise(r => setTimeout(r, 300))

    browser = await getOrCreateSharedBrowser(log)
    page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    )
    let targetUrl = url
    if (/\.pdf($|\?|#)/i.test(url) && !/drive\.google\.com/i.test(url)) {
      // Use Google Docs viewer to render the PDF when direct view is not ideal
      targetUrl = `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`
    }
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })

    await page.evaluate(async () => {
      const delay = (ms: number) => new Promise(res => setTimeout(res, ms))
      let lastHeight = 0
      let stableIterations = 0
      for (let i = 0; i < 30; i++) {
        window.scrollBy(0, window.innerHeight * 0.85)
        await delay(200)
        const newHeight = document.documentElement.scrollHeight
        if (newHeight === lastHeight) stableIterations++
        else stableIterations = 0
        lastHeight = newHeight
        if (stableIterations >= 2) break
      }
    })

    let pageInfos = await page.evaluate(() => {
      const items: {
        x: number
        y: number
        width: number
        height: number
        aspect: number
        tag: string
      }[] = []
      const els = Array.from(document.querySelectorAll('canvas, img')) as (
        | HTMLCanvasElement
        | HTMLImageElement
      )[]
      for (const el of els) {
        const r = el.getBoundingClientRect()
        const aspect = r.height / Math.max(1, r.width)
        if (r.width > 380 && r.height > 480 && aspect > 1.0) {
          items.push({
            x: r.x,
            y: r.y + window.scrollY,
            width: r.width,
            height: r.height,
            aspect,
            tag: el.tagName.toLowerCase(),
          })
        }
      }
      items.sort((a, b) => a.y - b.y)
      return items
    })

    const screenshots: Buffer[] = []
    const pushViewportShots = async (maxShots = 10) => {
      const seen = new Set<string>()
      for (let i = 0; i < maxShots; i++) {
        const buf = (await page.screenshot({ fullPage: false })) as Buffer
        const key = String(buf.length)
        if (!seen.has(key)) {
          seen.add(key)
          screenshots.push(buf)
        }
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.92))
        await new Promise(resolve => setTimeout(resolve, 150))
      }
    }

    if (!pageInfos.length) {
      log?.('Generic headless: no suitable canvases/images found — using viewport fallback')
      if (runId) logEmit(runId, 'driveFallbackScreenshotsMissingElements', { url })
      await pushViewportShots(10)
    } else {
      if (runId) logEmit(runId, 'driveFallbackPagesDetected', { pages: pageInfos.length })
      for (const info of pageInfos.slice(0, 10)) {
        try {
          await page.evaluate((y: number) => window.scrollTo(0, Math.max(0, y - 20)), info.y)
          await new Promise(resolve => setTimeout(resolve, 120))
          const buf = (await page.screenshot({ fullPage: false })) as Buffer
          screenshots.push(buf)
        } catch {}
      }
      if (!screenshots.length) {
        await pushViewportShots(8)
      }
    }

    if (!screenshots.length) {
      if (runId) logEmit(runId, 'driveFallbackScreenshotsFailed', { url })
      return { pdf: null, images: [] }
    }

    try {
      const pdfDoc = await PDFDocument.create()
      for (const imgBuf of screenshots) {
        try {
          const img = await pdfDoc.embedPng(imgBuf)
          const pg = pdfDoc.addPage([img.width, img.height])
          pg.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
        } catch {}
      }
      const pdfBytes = await pdfDoc.save()
      const out = Buffer.from(pdfBytes)
      log?.('Generic headless PDF assembled', { pages: screenshots.length, bytes: out.length })
      if (runId)
        logEmit(runId, 'driveFallbackSuccess', { pages: screenshots.length, bytes: out.length })
      return { pdf: out, images: screenshots }
    } catch (e: any) {
      log?.('Generic headless: PDF assembly failed (continuing with images only)', {
        error: e?.message,
        pages: screenshots.length,
      })
      if (runId)
        logEmit(runId, 'driveFallbackSuccess', { pages: screenshots.length, note: 'images-only' })
      return { pdf: null, images: screenshots }
    }
  } catch (e: any) {
    log?.('Generic headless fallback error', { error: e?.message })
    if (runId) logEmit(runId, 'driveFallbackDevRetryFailed', { error: e?.message })
    return { pdf: null, images: [] }
  } finally {
    if (page) {
      try {
        await page.close()
      } catch {}
    }
  }
}

async function driveHeadlessFallback(
  url: string,
  log?: Logger,
  runId?: string
): Promise<DriveFallbackResult> {
  let browser: any
  let page: any
  try {
    log?.('Drive fallback using shared browser', { url })
    if (runId) logEmit(runId, 'Opening document viewer', { url })

    await new Promise(resolve => setTimeout(resolve, 500))

    browser = await getOrCreateSharedBrowser(log)
    page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    )

    let viewerUrl = url
    const fileIdMatch = url.match(
      /drive\.google\.com\/(?:file\/d\/|uc\?export=download&id=)([^&/]+)/
    )
    if (fileIdMatch) viewerUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/view`
    await page.goto(viewerUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })

    await page.evaluate(async () => {
      const delay = (ms: number) => new Promise(res => setTimeout(res, ms))
      let lastHeight = 0
      let stableIterations = 0
      for (let i = 0; i < 20; i++) {
        window.scrollBy(0, window.innerHeight * 0.85)
        await delay(200)
        const newHeight = document.documentElement.scrollHeight
        if (newHeight === lastHeight) stableIterations++
        else stableIterations = 0
        lastHeight = newHeight
        if (stableIterations >= 2) break
      }
    })

    const pageInfos = await page.evaluate(() => {
      const items: {
        index: number
        x: number
        y: number
        width: number
        height: number
        aspect: number
      }[] = []
      const candidates = Array.from(document.querySelectorAll('img')) as HTMLImageElement[]
      let idx = 0
      for (const img of candidates) {
        const rect = img.getBoundingClientRect()
        const aspect = rect.height / Math.max(1, rect.width)
        if (rect.width > 380 && rect.height > 480 && aspect > 1.0) {
          items.push({
            index: idx++,
            x: rect.x,
            y: rect.y + window.scrollY,
            width: rect.width,
            height: rect.height,
            aspect,
          })
        }
      }
      items.sort((a, b) => a.y - b.y)
      return items
    })

    const screenshots: Buffer[] = []
    if (!pageInfos.length) {
      if (runId) logEmit(runId, 'Document appears empty', { url })
      for (let i = 0; i < 10; i++) {
        const buf = (await page.screenshot({ fullPage: false })) as Buffer
        screenshots.push(buf)
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.92))
        await new Promise(resolve => setTimeout(resolve, 150))
      }
    } else {
      if (runId)
        logEmit(runId, `Found ${pageInfos.length} pages to scan`, { pages: pageInfos.length })
      for (const info of pageInfos.slice(0, 10)) {
        try {
          await page.evaluate((y: number) => window.scrollTo(0, Math.max(0, y - 20)), info.y)
          await new Promise(resolve => setTimeout(resolve, 120))
          const buf = (await page.screenshot({ fullPage: false })) as Buffer
          screenshots.push(buf)
        } catch (e: any) {
          log?.('Drive fallback page screenshot failed', { page: info.index, error: e?.message })
        }
      }
    }

    if (!screenshots.length) {
      if (runId) logEmit(runId, 'Unable to capture pages', {})
      return { pdf: null, images: [] }
    }

    try {
      const pdfDoc = await PDFDocument.create()
      for (const imgBuf of screenshots) {
        try {
          const img = await pdfDoc.embedPng(imgBuf)
          const page = pdfDoc.addPage([img.width, img.height])
          page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
        } catch {}
      }
      const pdfBytes = await pdfDoc.save()
      const out = Buffer.from(pdfBytes)
      log?.('Drive fallback PDF assembled', { pages: screenshots.length, bytes: out.length })
      if (runId)
        logEmit(runId, `Successfully processed ${screenshots.length} pages`, {
          pages: screenshots.length,
          bytes: out.length,
        })
      return { pdf: out, images: screenshots }
    } catch (e: any) {
      log?.('Drive fallback: PDF assembly failed (continuing with images only)', {
        error: e?.message,
        pages: screenshots.length,
      })
      if (runId)
        logEmit(runId, `Successfully processed ${screenshots.length} pages`, {
          pages: screenshots.length,
          note: 'images-only',
        })
      return { pdf: null, images: screenshots }
    }
  } catch (e: any) {
    log?.('Drive fallback error', { error: e?.message })
    if (runId) logEmit(runId, 'Document processing failed', { error: e?.message })
    if (process.env.NODE_ENV === 'development') {
      try {
        const fileIdMatch = url.match(
          /drive\.google\.com\/(?:file\/d\/|uc\?export=download&id=)([^&/]+)/
        )
        const viewerUrl = fileIdMatch
          ? `https://drive.google.com/file/d/${fileIdMatch[1]}/view`
          : url
        const platform = process.platform
        let cmd: string
        if (platform === 'win32') cmd = `start "" "${viewerUrl}"`
        else if (platform === 'darwin') cmd = `open "${viewerUrl}"`
        else cmd = `xdg-open "${viewerUrl}"`
        const { exec } = await import('child_process')
        exec(cmd, err => {
          if (err) log?.('Dev browser open failed', { error: err.message })
        })
        log?.('Dev fallback opened external browser (final)', { viewerUrl })
        if (runId)
          logEmit(runId, 'Opened in external browser for manual review', { url: viewerUrl })
      } catch {}
    }
    return { pdf: null, images: [] }
  } finally {
    if (page) {
      try {
        await page.close()
      } catch {}
    }
  }
}

function logEmit(runId: string, step: string, detail?: any) {
  const hasSpace = /\s/.test(step)
  const isCamelLike = /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/.test(step)
  const normalizedStep = hasSpace ? step.toLowerCase() : isCamelLike ? step : step.toLowerCase()
  try {
    console.log(
      `[paperProgressEmit] runId=${runId} step=${normalizedStep} detail=${detail ? JSON.stringify(detail) : '{}'}`
    )
  } catch {
    console.log(`[paperProgressEmit] runId=${runId} step=${normalizedStep} detail=[unserializable]`)
  }
  try {
    paperProgress.emitStep(runId, normalizedStep, detail)
  } catch (e) {
    console.error(`[paperProgressEmit][ERROR] runId=${runId} step=${normalizedStep}`, e)
  }
}

interface RawPaperMeta {
  title: string
  url: string
  source: string
  metadata: string
  examType: string
  year: string
}

interface PaperChunk {
  chunkId: string
  paperId: string
  text: string
  embedding: number[]
  relevanceHints?: string[]
}

interface IndexedPaper extends RawPaperMeta {
  id: string
  text: string
  extractedQuestions: string[]
  chunks: PaperChunk[]
  questionEmbeddings?: number[][]
  pdfSize?: number
  pdfBuffer?: Buffer
}

interface PaperIndexMeta {
  id: string
  createdAt: number
  courseCode: string
  examType?: string
  year?: string
  questionFocus?: string
  papers: IndexedPaper[]
  chunkCount: number
}

const paperIndexes: Map<string, PaperIndexMeta> = new Map()

function safeJson(v: any) {
  try {
    return JSON.stringify(v, (k, val) =>
      typeof val === 'string' && val.length > 400 ? val.slice(0, 400) + '…' : val
    )
  } catch {
    return '[unserializable]'
  }
}

function createLogger(_enabled?: boolean): Logger {
  const logs: string[] = []
  const fn = (msg: string, data?: any) => {
    const line = `[paper-agent] ${new Date().toISOString()} - ${msg}${
      data !== undefined ? ` :: ${safeJson(data)}` : ''
    }`
    logs.push(line)
    console.log(line)
  }
  ;(fn as Logger).getLogs = () => logs
  return fn as Logger
}

function generateId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

async function resolveCourseCode(input: string, log?: Logger): Promise<string | null> {
  if (!input) return null
  const trimmed = input.trim().toUpperCase()
  if (/^[A-Z]{4}\d{3}[A-Z]?$/.test(trimmed)) {
    log?.('Resolved via direct pattern', { input, resolved: trimmed })
    return trimmed
  }
  const mapped = getCourseCode(input)
  if (mapped) {
    log?.('Resolved via getCourseCode map', { input, mapped })
    return mapped
  }
  const matches = getAllCourseMatches(input)
  if (matches.length > 0) {
    log?.('Resolved via fuzzy course match', { input, candidate: matches[0] })
    return matches[0].code
  }
  log?.('Failed to resolve course code', { input })
  return null
}

async function downloadPdf(
  url: string,
  log?: Logger,
  runId?: string
): Promise<{ pdf: Buffer | null; images?: Buffer[] }> {
  try {
    const transformed = toDirectDrive(url)
    if (transformed !== url) log?.('Transformed Google Drive URL', { original: url, transformed })
    const resp = await fetch(transformed, {
      headers: { Accept: 'application/pdf' },
      signal: AbortSignal.timeout(10000),
    })
    if (!resp.ok) {
      log?.('PDF download failed', { url: transformed, status: resp.status })
    } else {
      const ctype = resp.headers.get('content-type') || ''
      const arr = await resp.arrayBuffer()
      if (ctype.includes('pdf') && arr.byteLength > 8000) {
        log?.('PDF downloaded', { url: transformed, bytes: arr.byteLength })
        return { pdf: Buffer.from(arr) } // return bytes; parse first
      }
      log?.('Non-PDF or tiny response, will attempt Drive fallback', {
        ctype,
        bytes: arr.byteLength,
      })
    }
    if (/drive\.google\.com/.test(url)) {
      try {
        return await driveHeadlessFallback(url, log, runId)
      } catch (fallbackError: any) {
        log?.('Drive fallback failed completely', { url, error: fallbackError?.message })
        if (runId)
          logEmit(runId, 'Unable to access document', { url, error: fallbackError?.message })
        return { pdf: null, images: [] }
      }
    }
    return { pdf: null }
  } catch (e: any) {
    log?.('PDF download exception', { url, error: e?.message })
    if (/drive\.google\.com/.test(url)) {
      try {
        return await driveHeadlessFallback(url, log, runId)
      } catch (fallbackError: any) {
        log?.('Drive fallback failed completely after exception', {
          url,
          error: fallbackError?.message,
        })
        if (runId)
          logEmit(runId, 'Unable to access document', { url, error: fallbackError?.message })
        return { pdf: null, images: [] }
      }
    }
    return { pdf: null }
  }
}

function pickGeminiModel(opts: { pdf?: boolean; ocr?: boolean; fast?: boolean } = {}) {
  if (opts.ocr || opts.pdf) return 'gemini-2.5-flash'
  if (opts.fast) return 'gemini-2.5-flash'
  return 'gemini-2.5-flash'
}

async function extractTextFromPdf(
  pdfData: Buffer,
  log?: Logger,
  runId?: string,
  pageImages?: Buffer[]
): Promise<string> {
  if (runId) logEmit(runId, 'Extracting text from document', {})

  const hasPdfBytes = !!pdfData && pdfData.length > 1500
  if (hasPdfBytes) {
    try {
      if (runId)
        logEmit(runId, 'Reading document structure', { bytes: pdfData.length, method: 'pdf-parse' })
      const mod: any = await import('pdf-parse')
      const pdfParseFn = (mod?.default ?? mod) as (data: Buffer) => Promise<any> // robust import
      const res = await pdfParseFn(Buffer.isBuffer(pdfData) ? pdfData : Buffer.from(pdfData))
      if (res && res.text) {
        log?.('pdf-parse extraction success', { chars: res.text.length, pages: res.numpages })
        if (runId)
          logEmit(runId, `Successfully read ${res.numpages} pages`, {
            chars: res.text.length,
            pages: res.numpages,
          })
        if (runId) logEmit(runId, 'Document processing complete', { method: 'pdf-parse' })
        return res.text
      }
      log?.('pdf-parse produced empty text, falling back to OCR')
    } catch (err: any) {
      log?.('pdf-parse failed, attempting pdfjs-dist extraction before OCR', {
        error: err?.message,
      })
      if (runId) logEmit(runId, 'Switching extraction strategy', { error: err?.message })
      // Fallback 1: Use pdfjs-dist (legacy build) to extract text in Node (avoids OCR + browser)
      try {
        // Provide minimal DOM polyfills to satisfy pdfjs-dist in Node
        const g: any = globalThis as any
        if (!g.DOMMatrix) g.DOMMatrix = class {} as any
        if (!g.ImageData) g.ImageData = class {} as any
        if (!g.Path2D) g.Path2D = class {} as any
        // Use pdfjs-dist legacy ESM build which is compatible with Node
        const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
        const getDocument = (pdfjs as any).getDocument || (pdfjs as any).default?.getDocument
        if (!getDocument) throw new Error('pdfjs-dist getDocument not available')
        const task = getDocument({
          data: new Uint8Array(pdfData),
          isEvalSupported: false,
          disableFontFace: true,
        })
        const doc = await task.promise
        const maxPages = Math.min(doc.numPages || 0, 25)
        let out: string[] = []
        for (let p = 1; p <= maxPages; p++) {
          const page = await doc.getPage(p)
          const tc = await page.getTextContent()
          const text = (tc.items || []).map((it: any) => it.str || '').join(' ')
          if (text && text.trim().length > 0) out.push(text)
        }
        const combined = out.join('\n').replace(/\s+/g, ' ').trim()
        if (combined.length > 100) {
          log?.('pdfjs-dist extraction success', { pages: maxPages, chars: combined.length })
          if (runId)
            logEmit(runId, `Successfully read ${maxPages} pages`, {
              chars: combined.length,
              method: 'pdfjs-dist',
            })
          if (runId) logEmit(runId, 'Document processing complete', { method: 'pdfjs-dist' })
          return combined
        }
        log?.('pdfjs-dist produced little text, will try OCR next', { chars: combined.length })
      } catch (e: any) {
        log?.('pdfjs-dist extraction failed', { error: e?.message })
      }
      // Fallback 2: OCR below
      if (runId)
        logEmit(runId, 'Switching to advanced text recognition', {
          note: 'pdfjs-dist fallback did not yield enough text',
        })
    }
  }

  // OCR path (only if we have images)
  if (pageImages && pageImages.length) {
    try {
      if (runId)
        logEmit(runId, `Scanning ${pageImages.length} pages with AI vision`, {
          pages: pageImages.length,
        })
      const modelId = pickGeminiModel({ pdf: true, ocr: true })
      const limited = pageImages.slice(0, 5)
      const contentParts: any[] = [
        {
          type: 'text',
          text: 'You will receive exam paper page images. Perform OCR and return ONLY the readable question text. Preserve numbering (1, 1(a), (i), etc.). Separate distinct questions with a blank line. No extra commentary.',
        },
      ]
      for (const img of limited) {
        contentParts.push({ type: 'image', image: img.toString('base64'), mimeType: 'image/png' })
      }
      const ocrRes: any = await rateLimitedAI.google.generateText({
        model: { modelId },
        messages: [{ role: 'user', content: contentParts }],
      })
      const txt = (ocrRes && (ocrRes.text || (ocrRes as any).outputText)) || ''
      log?.('Gemini OCR (image) extraction result', {
        chars: txt.length,
        model: modelId,
        pagesUsed: limited.length,
      })
      if (runId)
        logEmit(runId, `AI vision successfully read ${txt.length} characters`, {
          chars: txt.length,
          model: modelId,
          pages: limited.length,
        })
      if (runId) logEmit(runId, 'Document processing complete', { method: 'gemini-image-ocr' })
      return txt
    } catch (e: any) {
      log?.('Gemini OCR image fallback failed', { error: e?.message })
      if (runId) logEmit(runId, 'Text recognition failed', { error: e?.message })
    }
  }
  return ''
}

function splitIntoChunks(text: string, targetSize = 1000, overlapPct = 0.25): string[] {
  const clean = text.replace(/\r/g, '').trim()
  if (clean.length <= targetSize) return [clean]
  const paras = clean.split(/\n{2,}/)
  const sentences: string[] = []
  for (const p of paras) {
    const parts = p
      .split(/(?<=[\.!?]|\)|\:)(?:\s+|$)/)
      .map(s => s.trim())
      .filter(Boolean)
    sentences.push(...parts)
  }
  const chunks: string[] = []
  let buf: string[] = []
  let size = 0
  const target = Math.max(400, targetSize)
  for (const s of sentences) {
    const add = (buf.length ? ' ' : '') + s
    if (size + add.length > target && buf.length) {
      chunks.push(buf.join(' ').trim())
      const prev = chunks[chunks.length - 1]
      const overlap = Math.floor(target * overlapPct)
      const tail = prev.slice(Math.max(0, prev.length - overlap))
      buf = tail ? [tail] : []
      size = tail.length
    }
    buf.push(s)
    size += add.length
  }
  if (buf.length) chunks.push(buf.join(' ').trim())
  return chunks.filter(c => c.length > 40)
}

function extractQuestions(text: string, log?: Logger): string[] {
  const lines = text
    .split(/\n+/)
    .map(l => l.trim())
    .filter(Boolean)
  const qs = new Set<string>()
  const cueWords = ['determine', 'prove', 'show that', 'find', 'evaluate', 'compute', 'explain']
  for (const line of lines) {
    const lower = line.toLowerCase()
    const isNumbered = /^\d+\./.test(line) || /^\([a-zA-Z0-9]+\)/.test(line)
    const endsWithQ = /\?$/.test(line)
    const hasCue = cueWords.some(c => lower.includes(c))
    if ((isNumbered || endsWithQ || hasCue) && line.length <= 500 && line.length >= 8) {
      qs.add(line)
    }
  }
  const arr = Array.from(qs).slice(0, 400)
  log?.('Extracted question candidates', { count: arr.length })
  return arr
}

function cosine(a: number[], b: number[]): number {
  let dot = 0,
    as = 0,
    bs = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    as += a[i] * a[i]
    bs += b[i] * b[i]
  }
  return dot / (Math.sqrt(as) * Math.sqrt(bs) + 1e-8)
}

export async function indexPastPapers(options: {
  course: string
  examType?: string
  year?: string
  maxPapers?: number
  questionFocus?: string
  debug?: boolean
  runId?: string
  maxProcessingMs?: number
  headlessOnly?: boolean
}) {
  const log = createLogger(options.debug || process.env.PAPER_AGENT_DEBUG === 'true')
  const useDB = !!process.env.DATABASE_URL2
  const storePdf =
    process.env.PAPER_AGENT_STORE_PDF === '1' || process.env.NODE_ENV === 'development'
  if (useDB) {
    try {
      await ensurePaperSchema()
    } catch (e: any) {
      log('DB schema ensure failed (continuing in-memory)', { error: e?.message })
    }
  }
  const courseCode = await resolveCourseCode(options.course, log)
  if (options.runId)
    logEmit(options.runId, `Searching for ${courseCode || options.course} papers`, {
      input: options.course,
      courseCode,
    })
  if (!courseCode) {
    await cleanupSharedBrowser(log)
    return {
      success: false,
      error: 'Could not resolve course code',
      suggestion: 'Provide a valid VIT course code.',
      logs: log.getLogs(),
    }
  }
  const all = await fetchAllPapers(courseCode, options.examType, options.year, log)
  if (options.runId)
    logEmit(options.runId, `Found ${all.length} papers across all sources`, { count: all.length })
  log('Total papers after fetch', { count: all.length })

  const maxPapers = options.maxPapers ?? 4
  const selected = all.slice(0, maxPapers)
  if (options.runId)
    logEmit(options.runId, `Processing ${selected.length} papers for optimal speed`, {
      selected: selected.length,
      maxAllowed: maxPapers,
    })
  log('Selected subset for processing', { selected: selected.length })
  if (selected.length === 0) {
    await cleanupSharedBrowser(log)
    return { success: false, error: 'No papers found to index', logs: log.getLogs() }
  }

  const indexed: IndexedPaper[] = []
  const persistedPaperIds: string[] = []
  const contentHashes = new Set<string>()
  const startTime = Date.now()
  const MAX_PROCESSING_TIME = options.maxProcessingMs ?? 45000
  let attemptedPapers = 0
  let stopAll = false

  const processOne = async (p: RawPaperMeta) => {
    if (stopAll) return
    attemptedPapers++

    if (Date.now() - startTime > MAX_PROCESSING_TIME) {
      log('Approaching timeout limit, stopping paper processing', {
        processed: indexed.length,
        remaining: selected.length - attemptedPapers,
        timeElapsed: Date.now() - startTime,
      })
      if (options.runId)
        logEmit(options.runId, 'Optimizing for speed - wrapping up processing', {
          processed: indexed.length,
          timeElapsed: Date.now() - startTime,
        })
      stopAll = true
      return
    }

    if (attemptedPapers > 3 && indexed.length === 0) {
      log('No papers successfully processed after 3 attempts, bailing out early')
      if (options.runId)
        logEmit(
          options.runId,
          'Having trouble accessing papers - may need to try different sources',
          { attempted: attemptedPapers }
        )
      stopAll = true
      return
    }

    if (options.runId)
      logEmit(options.runId, `Processing: ${p.title}`, { title: p.title, url: p.url })
    log('Processing paper', { title: p.title, url: p.url })

    if (useDB) {
      try {
        const existing = await findPaperByUrl(p.url)
        if (existing) {
          if (options.runId)
            logEmit(options.runId, 'Using cached paper from database', { title: p.title })
          log('Reusing existing paper from DB, skipping re-download', { title: p.title })
          const loaded = await loadChunksAndQuestions([existing.id])
          const chunks: PaperChunk[] = (loaded.chunks || [])
            .sort((a: any, b: any) => a.chunk_index - b.chunk_index)
            .map((c: any) => ({
              chunkId: generateId('chunk'),
              paperId: p.url,
              text: c.text,
              embedding: c.embedding || [],
            }))
          const questionEmbeddings: number[][] | undefined = (loaded.questions || [])
            .sort((a: any, b: any) => a.question_index - b.question_index)
            .map((q: any) => q.embedding || [])
          persistedPaperIds.push(existing.id)
          indexed.push({
            id: existing.id,
            ...p,
            text: chunks.map(c => c.text).join('\n\n'),
            extractedQuestions: (existing.extracted_questions as any) || [],
            chunks,
            questionEmbeddings,
          })
          return
        }
      } catch (reuseErr: any) {
        log('DB reuse check failed (continuing with fresh processing)', {
          error: reuseErr?.message,
        })
      }
    }

    // Headless-only path: capture screenshots via browser and OCR them, skipping direct PDF parsing.
    if (options.headlessOnly) {
      try {
        const cap = await driveHeadlessFallback(p.url, log, options.runId)
        if (!cap?.images?.length) {
          log('Headless capture produced no images', { url: p.url })
          if (options.runId) logEmit(options.runId, 'Unable to access document', { url: p.url })
          return
        }
        let contentHashRef: string | undefined
        if (cap.pdf) {
          try {
            const h = await computeHash(cap.pdf)
            if (contentHashes.has(h)) return
            contentHashes.add(h)
            contentHashRef = h
          } catch {}
        }
        const text = await extractTextFromPdf(Buffer.alloc(0), log, options.runId, cap.images)
        if (!text || text.length < 50) {
          log('Skipping paper due to insufficient text post-OCR', { chars: text?.length || 0 })
          if (options.runId)
            logEmit(options.runId, 'Paper appears empty or unreadable', { title: p.title })
          return
        }

        const questions = extractQuestions(text, log)
        if (options.runId)
          logEmit(options.runId, `Found ${questions.length} practice questions`, {
            title: p.title,
            questions: questions.length,
          })
        const chunksRaw = splitIntoChunks(text)
        log('Chunking complete', { chunks: chunksRaw.length })
        if (options.runId)
          logEmit(options.runId, `Split into ${chunksRaw.length} searchable sections`, {
            title: p.title,
            chunks: chunksRaw.length,
          })

        const embeddingResult: any = await rateLimitedAI.google.embed({ values: chunksRaw })
        log('Embedding complete', { embeddings: embeddingResult.embeddings?.length })
        if (options.runId) logEmit(options.runId, 'Processing content with AI', { title: p.title })

        let questionEmbeddings: number[][] | undefined
        if (questions.length) {
          try {
            const qeRes: any = await rateLimitedAI.google.embed({ values: questions })
            questionEmbeddings = qeRes.embeddings || []
            log('Question embeddings complete', { count: (questionEmbeddings || []).length })
            if (options.runId)
              logEmit(
                options.runId,
                `Indexed ${(questionEmbeddings || []).length} questions for smart search`,
                { title: p.title, count: (questionEmbeddings || []).length }
              )
          } catch (e: any) {
            log('Question embeddings failed', { error: e?.message })
            if (options.runId)
              logEmit(options.runId, 'Question indexing incomplete', { title: p.title })
          }
        }

        const chunks: PaperChunk[] = chunksRaw.map((t, i) => ({
          chunkId: generateId('chunk'),
          paperId: p.url,
          text: t,
          embedding: embeddingResult.embeddings[i] || [],
        }))

        const paperId = useDB
          ? await insertPaper({
              courseCode,
              examType: p.examType,
              year: p.year,
              title: p.title,
              source: p.source,
              url: p.url,
              contentHash: contentHashRef,
              extractedQuestions: questions,
            })
          : generateId('paper')

        if (useDB) {
          await upsertChunks(
            paperId,
            chunks.map((c, i) => ({ index: i, text: c.text, embedding: c.embedding }))
          )
          if (questionEmbeddings?.length)
            await upsertQuestionEmbeddings(
              paperId,
              questionEmbeddings.map((qe, i) => ({
                index: i,
                question: questions[i],
                embedding: qe,
              }))
            )
          persistedPaperIds.push(paperId)
        }

        indexed.push({
          id: paperId,
          ...p,
          text,
          extractedQuestions: questions,
          chunks,
          questionEmbeddings,
          pdfSize: cap.pdf ? cap.pdf.length : undefined,
          pdfBuffer: storePdf && cap.pdf ? cap.pdf : undefined,
        })
        return
      } catch (e: any) {
        log('Headless-only path failed', { error: e?.message })
        return
      }
    }

    const PAPER_TIMEOUT = 15000
    let download: { pdf: Buffer | null; images?: Buffer[] }
    try {
      const downloadPromise = downloadPdf(p.url, log, options.runId)
      const timeoutPromise = new Promise<{ pdf: Buffer | null; images?: Buffer[] }>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Paper processing timeout after ${PAPER_TIMEOUT}ms`)),
          PAPER_TIMEOUT
        )
      )
      download = await Promise.race([downloadPromise, timeoutPromise])
    } catch (timeoutError: any) {
      log('Paper processing timeout, skipping', { url: p.url, error: timeoutError.message })
      if (options.runId)
        logEmit(options.runId, '⏱Taking too long, moving to next paper', { url: p.url })
      return
    }

    if (!download.pdf && !(download.images && download.images.length)) {
      log('Skipping paper due to download failure', { url: p.url })
      if (options.runId) logEmit(options.runId, 'Unable to download this paper', { url: p.url })
      return
    }

    if (download.pdf && options.runId) {
      logEmit(options.runId, `Downloaded paper (${Math.round(download.pdf.length / 1024)}KB)`, {
        url: p.url,
        bytes: download.pdf.length,
      })
    }

    let contentHashRef: string | undefined
    try {
      if (download.pdf) {
        const h = await computeHash(download.pdf)
        if (contentHashes.has(h)) {
          log('Skipping paper due to duplicate content hash', { title: p.title })
          if (options.runId) logEmit(options.runId, 'Skipping duplicate paper', { title: p.title })
          return
        }
        contentHashes.add(h)
        contentHashRef = h
      }
    } catch (e: any) {
      log('Hash computation failed (continuing)', { error: e?.message })
    }

    // --- try to read text ---
    let text = download.pdf
      ? await extractTextFromPdf(download.pdf, log, options.runId, download.images)
      : await extractTextFromPdf(Buffer.alloc(0), log, options.runId, download.images)

    // *** SECOND-CHANCE FALLBACK ***
    if (!text || text.length < 50) {
      if (/drive\.google\.com/i.test(p.url)) {
        log('Primary parse produced little text — attempting headless capture + OCR', {
          url: p.url,
        })
        try {
          const cap = await driveHeadlessFallback(p.url, log, options.runId)
          if (cap?.images?.length) {
            const ocrText = await extractTextFromPdf(
              Buffer.alloc(0),
              log,
              options.runId,
              cap.images
            )
            if (ocrText && ocrText.length >= 50) {
              text = ocrText
              log('Fallback OCR succeeded', { chars: text.length })
            } else {
              log('Fallback OCR returned too little text', { chars: ocrText?.length || 0 })
            }
          } else {
            log('Headless capture produced no images')
          }
        } catch (e: any) {
          log('Headless capture/OCR fallback failed', { error: e?.message })
        }
      } else if (/res\.cloudinary\.com\/.*\/raw\/upload\/.*\.pdf/i.test(p.url)) {
        // Cloudinary-specific lightweight OCR: request page images directly via Cloudinary transformations
        try {
          log('Attempting cloudinary direct page images + OCR', { url: p.url })
          const images: Buffer[] = []
          {
            const pageUrls = toCloudinaryPageImageUrls(p.url, 5) || []
            for (const u of pageUrls) {
              const buf = await fetchAsBuffer(u, 8000, { Accept: 'image/png,image/*;q=0.8' })
              if (buf) images.push(buf)
            }
          }
          if (!images.length) {
            const fetchUrls = toCloudinaryFetchPageImageUrls(p.url, 5) || []
            for (const u of fetchUrls) {
              const buf = await fetchAsBuffer(u, 10000, { Accept: 'image/png,image/*;q=0.8' })
              if (buf) images.push(buf)
            }
          }
          if (images.length) {
            const ocrText = await extractTextFromPdf(Buffer.alloc(0), log, options.runId, images)
            if (ocrText && ocrText.length >= 50) {
              text = ocrText
              log('Cloudinary OCR succeeded', { chars: text.length, pages: images.length })
            } else {
              log('Cloudinary OCR returned too little text', { chars: ocrText?.length || 0 })
            }
          } else {
            log('Cloudinary page images not available, falling back to headless')
          }
        } catch (e: any) {
          log('Cloudinary OCR path failed (continuing to headless)', { error: e?.message })
        }
        if (!text || text.length < 50) {
          try {
            log('Attempting generic headless capture + OCR', { url: p.url })
            const cap = await genericHeadlessPdfToImages(p.url, log, options.runId)
            if (cap?.images?.length) {
              const ocrText = await extractTextFromPdf(
                Buffer.alloc(0),
                log,
                options.runId,
                cap.images
              )
              if (ocrText && ocrText.length >= 50) {
                text = ocrText
                log('Generic fallback OCR succeeded', { chars: text.length })
              } else {
                log('Generic fallback OCR returned too little text', {
                  chars: ocrText?.length || 0,
                })
              }
            } else {
              log('Generic headless capture produced no images')
            }
          } catch (e: any) {
            log('Generic headless/OCR fallback failed', { error: e?.message })
          }
        }
      } else {
        // Non-Drive/Non-Cloudinary: generic headless OCR
        try {
          log('Attempting generic headless capture + OCR', { url: p.url })
          const cap = await genericHeadlessPdfToImages(p.url, log, options.runId)
          if (cap?.images?.length) {
            const ocrText = await extractTextFromPdf(
              Buffer.alloc(0),
              log,
              options.runId,
              cap.images
            )
            if (ocrText && ocrText.length >= 50) {
              text = ocrText
              log('Generic fallback OCR succeeded', { chars: text.length })
            } else {
              log('Generic fallback OCR returned too little text', { chars: ocrText?.length || 0 })
            }
          } else {
            log('Generic headless capture produced no images')
          }
        } catch (e: any) {
          log('Generic headless/OCR fallback failed', { error: e?.message })
        }
      }
    }

    if (!text || text.length < 50) {
      log('Skipping paper due to insufficient text', { chars: text.length })
      if (options.runId)
        logEmit(options.runId, 'Paper appears empty or unreadable', { title: p.title })
      return
    }

    const questions = extractQuestions(text, log)
    if (options.runId)
      logEmit(options.runId, `Found ${questions.length} practice questions`, {
        title: p.title,
        questions: questions.length,
      })
    const chunksRaw = splitIntoChunks(text)
    log('Chunking complete', { chunks: chunksRaw.length })
    if (options.runId)
      logEmit(options.runId, `Split into ${chunksRaw.length} searchable sections`, {
        title: p.title,
        chunks: chunksRaw.length,
      })

    const embeddingResult: any = await rateLimitedAI.google.embed({ values: chunksRaw })
    log('Embedding complete', { embeddings: embeddingResult.embeddings?.length })
    if (options.runId) logEmit(options.runId, 'Processing content with AI', { title: p.title })

    let questionEmbeddings: number[][] | undefined
    if (questions.length) {
      try {
        const qeRes: any = await rateLimitedAI.google.embed({ values: questions })
        questionEmbeddings = qeRes.embeddings || []
        log('Question embeddings complete', { count: (questionEmbeddings || []).length })
        if (options.runId)
          logEmit(
            options.runId,
            `Indexed ${(questionEmbeddings || []).length} questions for smart search`,
            { title: p.title, count: (questionEmbeddings || []).length }
          )
      } catch (e: any) {
        log('Question embeddings failed', { error: e?.message })
        if (options.runId)
          logEmit(options.runId, 'Question indexing incomplete', { title: p.title })
      }
    }

    const chunks: PaperChunk[] = chunksRaw.map((t, i) => ({
      chunkId: generateId('chunk'),
      paperId: p.url,
      text: t,
      embedding: embeddingResult.embeddings[i] || [],
    }))

    const paperId = useDB
      ? await insertPaper({
          courseCode,
          examType: p.examType,
          year: p.year,
          title: p.title,
          source: p.source,
          url: p.url,
          contentHash: contentHashRef,
          extractedQuestions: questions,
        })
      : generateId('paper')

    if (useDB) {
      await upsertChunks(
        paperId,
        chunks.map((c, i) => ({ index: i, text: c.text, embedding: c.embedding }))
      )
      if (questionEmbeddings?.length)
        await upsertQuestionEmbeddings(
          paperId,
          questionEmbeddings.map((qe, i) => ({ index: i, question: questions[i], embedding: qe }))
        )
      persistedPaperIds.push(paperId)
    }

    indexed.push({
      id: paperId,
      ...p,
      text,
      extractedQuestions: questions,
      chunks,
      questionEmbeddings,
      pdfSize: download.pdf ? download.pdf.length : undefined,
      pdfBuffer: storePdf && download.pdf ? download.pdf : undefined,
    })
  }

  // Limit concurrency to avoid multiple simultaneous headless/ocr fallbacks in serverless
  const CONCURRENCY = Math.min(1, selected.length)
  let idx = 0
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (!stopAll && idx < selected.length) {
      if (Date.now() - startTime > MAX_PROCESSING_TIME) {
        log('Approaching timeout limit, stopping paper processing', {
          processed: indexed.length,
          remaining: selected.length - attemptedPapers,
          timeElapsed: Date.now() - startTime,
        })
        if (options.runId)
          logEmit(options.runId, 'Optimizing for speed - wrapping up processing', {
            processed: indexed.length,
            timeElapsed: Date.now() - startTime,
          })
        stopAll = true
        break
      }
      const p = selected[idx++]
      await processOne(p)
    }
  })
  await Promise.all(workers)

  if (indexed.length === 0) {
    await cleanupSharedBrowser(log)
    return { success: false, error: 'Failed to process any papers', logs: log.getLogs() }
  }

  let indexId = generateId('ppidx')
  if (useDB) {
    try {
      const dbIndexId = await createIndexRecord(courseCode, options.examType, options.year)
      if (persistedPaperIds.length) await linkIndexPapers(dbIndexId, persistedPaperIds)
      indexId = dbIndexId
      log('Index persisted to DB', { indexId, papers: persistedPaperIds.length })
    } catch (e: any) {
      log('Failed to persist index to DB (continuing)', { error: e?.message })
    }
  }
  const chunkCount = indexed.reduce((s, p) => s + p.chunks.length, 0)
  paperIndexes.set(indexId, {
    id: indexId,
    createdAt: Date.now(),
    courseCode,
    examType: options.examType,
    year: options.year,
    questionFocus: options.questionFocus,
    papers: indexed,
    chunkCount,
  })
  log('Index stored', { indexId, papers: indexed.length, chunkCount })
  if (options.runId)
    logEmit(
      options.runId,
      `Successfully indexed ${indexed.length} papers with ${chunkCount} searchable sections!`,
      { indexId, papers: indexed.length, chunks: chunkCount }
    )

  await cleanupSharedBrowser(log)
  if (options.runId)
    logEmit(options.runId, 'done', { status: 'complete', indexId, papers: indexed.length })

  return {
    success: true,
    indexId,
    courseCode,
    papersIndexed: indexed.length,
    chunkCount,
    sampleQuestions: indexed.flatMap(p => p.extractedQuestions.slice(0, 3)).slice(0, 10),
    runId: options.runId,
    logs: log.getLogs(),
  }
}

export async function askIndexedPaperQuestion(
  indexId: string,
  question: string,
  debug?: boolean,
  runId?: string
) {
  const log = createLogger(debug || process.env.PAPER_AGENT_DEBUG === 'true')
  let index = paperIndexes.get(indexId)
  if (!index) {
    const useDB = !!process.env.DATABASE_URL2
    if (useDB) {
      try {
        const meta = await getIndexMetaById(indexId)
        if (meta) {
          const paperIds = await getIndexPaperIds(indexId)
          const papers = await getPapersByIds(paperIds)
          const loaded = await loadChunksAndQuestions(paperIds)
          const chunksByPaper = new Map<string, any[]>(paperIds.map(id => [id, []]))
          for (const c of loaded.chunks as any[]) {
            const arr = chunksByPaper.get(c.paper_id)!
            arr.push(c)
          }
          const qByPaper = new Map<string, any[]>(paperIds.map(id => [id, []]))
          for (const q of loaded.questions as any[]) {
            const arr = qByPaper.get(q.paper_id)!
            arr.push(q)
          }
          const rebuilt: IndexedPaper[] = papers.map(p => {
            const chs = (chunksByPaper.get(p.id) || [])
              .sort((a: any, b: any) => a.chunk_index - b.chunk_index)
              .map((c: any) => ({
                chunkId: generateId('chunk'),
                paperId: p.url || p.id,
                text: c.text,
                embedding: c.embedding || [],
              }))
            const qes = (qByPaper.get(p.id) || [])
              .sort((a: any, b: any) => a.question_index - b.question_index)
              .map((q: any) => q.embedding || [])
            return {
              id: p.id,
              title: p.title,
              url: p.url || '',
              source: '',
              metadata: '',
              examType: p.exam_type || '',
              year: p.year || '',
              text: chs.map(c => c.text).join('\n\n'),
              extractedQuestions: (p.extracted_questions as any) || [],
              chunks: chs,
              questionEmbeddings: qes.length ? qes : undefined,
            }
          })
          index = {
            id: indexId,
            createdAt: new Date(meta.created_at).getTime(),
            courseCode: meta.course_code,
            examType: meta.exam_type || undefined,
            year: meta.year || undefined,
            questionFocus: undefined,
            papers: rebuilt,
            chunkCount: rebuilt.reduce((s, p) => s + p.chunks.length, 0),
          }
          paperIndexes.set(indexId, index)
          log('Rehydrated index from DB', { indexId, papers: index.papers.length })
        }
      } catch (e: any) {
        log('Failed to rehydrate index from DB', { error: e?.message })
      }
    }
  }
  if (!index) return { success: false, error: 'Index not found or expired', logs: log.getLogs() }
  log('Starting Q&A', { indexId, questionLen: question.length })
  const embedRes: any = await rateLimitedAI.google.embed({ value: question })
  const qEmb = embedRes.embedding || embedRes.embeddings?.[0]
  if (!qEmb) return { success: false, error: 'Failed to embed question', logs: log.getLogs() }
  const scored: { chunk: PaperChunk; score: number; paper: IndexedPaper }[] = []
  for (const paper of index.papers) {
    for (const chunk of paper.chunks) {
      if (!chunk.embedding?.length) continue
      const score = cosine(qEmb, chunk.embedding)
      scored.push({ chunk, score, paper })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, 6)
  log('Top chunks selected', { count: top.length })
  const context = top
    .map(
      t =>
        `Source: ${t.paper.title} (${t.paper.year} ${t.paper.examType})\n${t.chunk.text.substring(0, 1000)}`
    )
    .join('\n\n---\n\n')
  const prompt = `You are a precise assistant answering questions about VIT past exam papers.\nQuestion: ${question}\nUse ONLY the provided context. Quote specific question numbers or lines if relevant. If unknown, say you cannot find it.\nContext:\n${context}`
  const answer = await rateLimitedAI.google.generateText({
    model: { modelId: pickGeminiModel({ fast: true }) },
    prompt,
  })
  log('Answer generated')
  return {
    success: true,
    answer: (answer as any).text,
    sources: Array.from(
      new Set(
        top.map(t => ({
          title: t.paper.title,
          url: t.paper.url,
          year: t.paper.year,
          examType: t.paper.examType,
          score: Number(t.score.toFixed(3)),
        }))
      )
    ).slice(0, 6),
    runId,
    logs: log.getLogs(),
  }
}

export async function smartPaperSearchByQuestion(opts: {
  course: string
  question: string
  examType?: string
  year?: string
  maxPapers?: number
  debug?: boolean
  runId?: string
}) {
  const log = createLogger(opts.debug || process.env.PAPER_AGENT_DEBUG === 'true')
  console.log(
    `[smartPaperSearchByQuestion] Starting with runId: "${opts.runId}" for course: ${opts.course}`
  )
  log('Smart paper search start', {
    course: opts.course,
    question: opts.question,
    runId: opts.runId,
  })
  if (opts.runId) {
    console.log(`[smartPaperSearchByQuestion] Emitting start event for runId: ${opts.runId}`)
    logEmit(opts.runId, 'Starting smart paper search', {
      course: opts.course,
      question: opts.question,
    })
  } else {
    console.log(
      `[smartPaperSearchByQuestion] WARNING: No runId provided! Cannot emit progress events.`
    )
  }
  const indexResult = await indexPastPapers({
    course: opts.course,
    examType: opts.examType,
    year: opts.year,
    maxPapers: opts.maxPapers || 3,
    questionFocus: opts.question,
    debug: opts.debug,
    runId: opts.runId,
  })
  if (!indexResult.success) {
    if (opts.runId) logEmit(opts.runId, 'done', { status: 'failed' })
    return { ...indexResult, runId: opts.runId, logs: (indexResult as any).logs }
  }
  const useDB = !!process.env.DATABASE_URL2
  let index = paperIndexes.get(indexResult.indexId!)!
  const embedRes: any = await rateLimitedAI.google.embed({ value: opts.question })
  const qEmb = embedRes.embedding || embedRes.embeddings?.[0]
  log('User question embedded')
  if (opts.runId) logEmit(opts.runId, 'Understanding your question with AI', {})
  const stopWords = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'for', 'in', 'on', 'with'])
  const qTokens = opts.question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t && !stopWords.has(t))
  log('Tokenized question', { tokens: qTokens })
  function questionMatchScore(candidate: string): number {
    const cTokens = candidate
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(t => t && !stopWords.has(t))
    if (cTokens.length === 0 || qTokens.length === 0) return 0
    let overlap = 0
    for (const t of qTokens) if (cTokens.includes(t)) overlap++
    return overlap / qTokens.length
  }
  const paperScores: {
    paper: IndexedPaper
    score: number
    matchedQuestions: string[]
    chunkScore: number
    questionScore: number
  }[] = []
  if (useDB) {
    try {
      const semantic = await semanticRankQuestion(
        indexResult.courseCode!,
        qEmb,
        20,
        opts.examType,
        opts.year
      )
      const qScores = await questionEmbeddingScores(
        indexResult.courseCode!,
        qEmb,
        opts.examType,
        opts.year
      )
      let urlMap: Map<string, string> | null = null
      try {
        const coursePapers = await getCoursePapers(indexResult.courseCode!)
        urlMap = new Map(coursePapers.map(p => [p.id, p.url || '']))
      } catch (e: any) {
        log('Failed to fetch course papers for url map (continuing)', { error: e?.message })
      }
      const qScoreMap = new Map(qScores.map(r => [r.paper_id, Number(r.question_score) || 0]))
      const merged = semantic.map(s => ({
        paper_id: s.paper_id,
        title: s.title,
        examType: s.exam_type,
        year: s.year,
        chunkScore: Number(s.chunk_score) || 0,
        questionScore: qScoreMap.get(s.paper_id) || 0,
        url: urlMap?.get(s.paper_id),
      }))
      const ranked = merged
        .map(m => ({ ...m, score: 0.75 * m.chunkScore + 0.25 * m.questionScore }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
      log('Ranking complete (db)', { papersRanked: ranked.length })
      if (opts.runId) {
        logEmit(opts.runId, 'Found the most relevant papers for you!', { papers: ranked.length })
        logEmit(opts.runId, 'Search complete', {})
      }
      return {
        success: true,
        indexId: indexResult.indexId,
        courseCode: indexResult.courseCode,
        rankedPapers: ranked.map(r => ({
          title: r.title,
          url: r.url,
          year: r.year,
          examType: r.examType,
          score: Number(r.score.toFixed(3)),
          chunkScore: Number(r.chunkScore.toFixed(3)),
          questionScore: Number(r.questionScore.toFixed(3)),
          matchedQuestions: [],
        })),
        runId: opts.runId,
        logs: [...(indexResult as any).logs, ...log.getLogs()],
      }
    } catch (e: any) {
      log('DB ranking failed, falling back to in-memory', { error: e?.message })
    }
  }
  for (const paper of index!.papers) {
    let bestChunkScore = 0
    for (const ch of paper.chunks) {
      if (!ch.embedding?.length) continue
      const s = cosine(qEmb, ch.embedding)
      if (s > bestChunkScore) bestChunkScore = s
    }
    let bestQuestionScore = 0
    if (paper.questionEmbeddings) {
      for (const qe of paper.questionEmbeddings) {
        if (!qe?.length) continue
        const qs = cosine(qEmb, qe)
        if (qs > bestQuestionScore) bestQuestionScore = qs
      }
    }
    const scoredQs = paper.extractedQuestions
      .map(q => ({ q, ms: questionMatchScore(q) }))
      .filter(o => o.ms >= 0.3)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 5)
    const partialBoost = scoredQs.length ? Math.min(0.1 + scoredQs[0].ms * 0.2, 0.25) : 0
    const composite = 0.7 * bestChunkScore + 0.25 * bestQuestionScore + partialBoost
    paperScores.push({
      paper,
      score: composite,
      chunkScore: bestChunkScore,
      questionScore: bestQuestionScore,
      matchedQuestions: scoredQs.map(o => `${o.q} [match=${o.ms.toFixed(2)}]`),
    })
  }
  paperScores.sort((a, b) => b.score - a.score)
  log('Ranking complete', { papersRanked: paperScores.length })
  if (opts.runId) {
    logEmit(opts.runId, 'Found the most relevant papers for you!', { papers: paperScores.length })
    logEmit(opts.runId, 'Search complete', {})
  }
  if (opts.runId)
    logEmit(opts.runId, 'done', {
      status: 'complete',
      indexId: index.id,
      papers: paperScores.length,
    })
  return {
    success: true,
    indexId: index.id,
    courseCode: index.courseCode,
    rankedPapers: paperScores.slice(0, 10).map(p => ({
      title: p.paper.title,
      url: p.paper.url,
      year: p.paper.year,
      examType: p.paper.examType,
      score: Number(p.score.toFixed(3)),
      chunkScore: Number(p.chunkScore.toFixed(3)),
      questionScore: Number(p.questionScore.toFixed(3)),
      matchedQuestions: p.matchedQuestions,
    })),
    runId: opts.runId,
    logs: [...(indexResult as any).logs, ...log.getLogs()],
  }
}

export function getPaperIndexMeta(indexId: string) {
  const idx = paperIndexes.get(indexId)
  if (!idx) return null
  return {
    id: idx.id,
    createdAt: idx.createdAt,
    courseCode: idx.courseCode,
    examType: idx.examType,
    year: idx.year,
    papers: idx.papers.length,
    chunkCount: idx.chunkCount,
  }
}

export function _debug_listPaperIndexes() {
  return Array.from(paperIndexes.values()).map(p => ({
    id: p.id,
    course: p.courseCode,
    papers: p.papers.length,
    chunks: p.chunkCount,
    createdAt: p.createdAt,
  }))
}

// --- CLI entrypoint (standalone usage) ---
// Allows running this file directly: `tsx lib/agents/paper-agent.ts --course CSE1001 --all`
const __maybeCli = (async () => {
  try {
    // Only run when executed directly, not when imported (robust under tsx + Windows)
    let isMain = false
    try {
      const { fileURLToPath } = await import('url')
      if (typeof import.meta === 'object' && (import.meta as any)?.url) {
        const thisFile = fileURLToPath((import.meta as any).url)
          .replace(/\\/g, '/')
          .toLowerCase()
        const argvNorm = (process.argv || []).map(a => (a || '').replace(/\\/g, '/').toLowerCase())
        // tsx keeps the target file path in argv; detect presence
        if (argvNorm.some(a => a.endsWith('/lib/agents/paper-agent.ts'))) {
          isMain = true
        }
        // Fallback: tsx may pass absolute path to this file at argv[2]
        if (!isMain && argvNorm.includes(thisFile)) isMain = true
      }
    } catch {}
    if (!isMain) return

    // Load env if present
    try {
      ;(await import('dotenv')).config()
    } catch {}

    // Prefer system browser for local runs
    process.env.PAPER_AGENT_USE_SYSTEM_BROWSER = process.env.PAPER_AGENT_USE_SYSTEM_BROWSER || '1'

    const args = process.argv.slice(2)
    const opts: any = {}
    const positionals: string[] = []
    for (let i = 0; i < args.length; i++) {
      const a = args[i]
      const next = () => args[++i]
      switch (a) {
        case '-c':
        case '--course':
          opts.course = next()
          break
        case '-e':
        case '--examType':
          opts.examType = next()
          break
        case '-y':
        case '--year':
          opts.year = next()
          break
        case '--max':
          opts.maxPapers = Number(next())
          break
        case '--all':
          opts.maxPapers = Number.MAX_SAFE_INTEGER
          break
        case '--max-ms':
          opts.maxProcessingMs = Number(next())
          break
        case '--headless-only':
          opts.headlessOnly = true
          break
        case '--no-headless-only':
          opts.headlessOnly = false
          break
        case '--debug':
          opts.debug = true
          process.env.PAPER_AGENT_DEBUG = 'true'
          break
        case '--store-pdf':
          process.env.PAPER_AGENT_STORE_PDF = '1'
          break
        case '-h':
        case '--help':
          console.log(
            `\nUsage: tsx lib/agents/paper-agent.ts --course <code|name> [options]\n\nOptions:\n  -c, --course <code|name>   Course code or name (required)\n  -e, --examType <type>      Filter by exam type (CAT1,CAT2,FAT,...)\n  -y, --year <year>          Filter by year (e.g., 2023)\n      --all                  Process all discovered papers\n      --max <n>              Limit number of papers to process\n      --max-ms <ms>          Increase overall processing time budget\n      --headless-only        Use browser screenshots + OCR only (default)\n      --no-headless-only     Allow direct PDF parsing\n      --store-pdf            Keep downloaded PDFs in memory (dev aid)\n      --debug                Verbose logging\n  -h, --help                 Show this help\n`
          )
          process.exit(0)
        default:
          if (a.startsWith('-')) {
            // ignore unknown flag
          } else {
            positionals.push(a)
          }
      }
    }

    if (!opts.course && positionals.length > 0) {
      opts.course = positionals[0]
    }

    // Default to headless-only for CLI runs unless explicitly disabled
    if (opts.headlessOnly === undefined) opts.headlessOnly = true

    if (!opts.course) {
      console.error('Error: --course is required. Use -h for help.')
      process.exit(1)
    }

    opts.runId = opts.runId || `${Date.now()}`

    console.log(`[paper-agent] starting standalone indexing for course="${opts.course}"`)
    const res: any = await indexPastPapers(opts)
    if (!res?.success) {
      console.error(`[paper-agent] indexing failed: ${res?.error || 'unknown error'}`)
      if (res?.logs?.length) console.error(res.logs.join('\n'))
      process.exit(2)
    }
    console.log(
      `[paper-agent] indexed ${res?.papers || res?.chunkCount ? `${res?.papers ?? '?'} papers` : 'papers'} | indexId=${res.indexId}`
    )
    if (res?.logs?.length) {
      console.log('\n[paper-agent] log summary:')
      for (const line of res.logs.slice(-50)) console.log(line)
    }
  } catch {}
})()
