import { scrapePapersService } from '../scrapers/papers-scraper'
import { scrapePapersCodeChef } from '../scrapers/papers-codechef'
import { scrapeVITPaperVault } from '../scrapers/vit-papervault'
import { getCourseCode } from '../question-generator'
import { getAllCourseMatches } from '../course-map'
import rateLimitedAI from '../rate-limited-ai'
import {
	ensurePaperSchema,
	insertPaper,
	upsertChunks,
	upsertQuestionEmbeddings,
	semanticRankQuestion,
	questionEmbeddingScores,
	getCoursePapers,
} from '../papers-db'

async function computeHash(buf: Buffer | Uint8Array): Promise<string> {
	try {
		const data = buf instanceof Buffer ? buf : Buffer.from(buf)
		const subtle: any = (globalThis as any).crypto?.subtle
		if (subtle) {
			const hashBuf = await subtle.digest('SHA-256', data)
			return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
		}
		const { createHash } = await import('crypto')
		return createHash('sha256').update(data).digest('hex')
	} catch {
		return Math.random().toString(36).slice(2)
	}
}
import { paperProgress } from '../progress/paper-progress'

function logEmit(runId: string, step: string, detail?: any) {
	try {
		console.log(`[paperProgressEmit] runId=${runId} step=${step} detail=${detail ? JSON.stringify(detail) : '{}'}`)
	} catch {
		console.log(`[paperProgressEmit] runId=${runId} step=${step} detail=[unserializable]`)
	}
	try {
		paperProgress.emitStep(runId, step, detail)
	} catch (e) {
		console.error(`[paperProgressEmit][ERROR] runId=${runId} step=${step}`, e)
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

// In-memory store
const paperIndexes: Map<string, PaperIndexMeta> = new Map()

interface Logger {
	(msg: string, data?: any): void
	getLogs(): string[]
}

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
			.replace(/\([^)]*\)/g, '') // remove parenthetical date parts
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

	// Title similarity clustering (Jaccard) within same examType & year (if provided)
	const final: Annotated[] = []
	for (const p of byKey) {
		const dup = final.find(f =>
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

async function downloadPdf(url: string, log?: Logger): Promise<Buffer | null> {
	try {
		const transformed = toDirectDrive(url)
		if (transformed !== url) log?.('Transformed Google Drive URL', { original: url, transformed })
		const resp = await fetch(transformed, {
			headers: { Accept: 'application/pdf' },
			signal: AbortSignal.timeout(20000),
		})
		if (!resp.ok) {
			log?.('PDF download failed', { url: transformed, status: resp.status })
			return null
		}
		const arr = await resp.arrayBuffer()
		log?.('PDF downloaded', { url: transformed, bytes: arr.byteLength })
		return Buffer.from(arr)
	} catch (e: any) {
		log?.('PDF download exception', { url, error: e?.message })
		return null
	}
}

async function extractTextFromPdf(pdfData: Buffer, log?: Logger): Promise<string> {
	try {
		const pdfParse = await import('pdf-parse') as any
		const res = await pdfParse.default(pdfData)
		if (res && res.text) {
			log?.('pdf-parse extraction success', { chars: res.text.length, pages: res.numpages })
			return res.text
		}
	} catch (err) {
		log?.('pdf-parse failed, falling back to Gemini OCR', { error: (err as any)?.message })
		try {
			const base64 = pdfData.toString('base64').slice(0, 200_000)
			const gen = await rateLimitedAI.google.generateText({
				model: { modelId: 'gemini-2.0-flash-lite-preview-02-05' },
				prompt: `You are an OCR assistant. The following is base64 of a PDF (possibly truncated). Attempt to extract as much readable question paper text as possible. Return plain text without commentary.\n\nBASE64:\n${base64}`,
			})
			const txt = (gen as any).text || ''
			log?.('Gemini OCR extraction result', { chars: txt.length })
			return txt
		} catch {
			return ''
		}
	}
	return ''
}

function splitIntoChunks(text: string, targetSize = 1200, overlap = 100): string[] {
	const clean = text.replace(/\r/g, '')
	if (clean.length <= targetSize) return [clean]
	const chunks: string[] = []
	let i = 0
	while (i < clean.length) {
		const slice = clean.slice(i, i + targetSize)
		chunks.push(slice.trim())
		i += targetSize - overlap
	}
	return chunks.filter(c => c.length > 20)
}

function extractQuestions(text: string, log?: Logger): string[] {
	const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean)
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
}) {
	const log = createLogger(options.debug || process.env.PAPER_AGENT_DEBUG === 'true')
	const useDB = !!process.env.DATABASE_URL2
	if (useDB) {
		try { await ensurePaperSchema() } catch (e: any) { log('DB schema ensure failed (continuing in-memory)', { error: e?.message }) }
	}
	const courseCode = await resolveCourseCode(options.course, log)
	if (options.runId) logEmit(options.runId, 'resolveCourse', { input: options.course, courseCode })
	if (!courseCode) {
		return {
			success: false,
			error: 'Could not resolve course code',
			suggestion: 'Provide a valid VIT course code.',
			logs: log.getLogs(),
		}
	}
	const all = await fetchAllPapers(courseCode, options.examType, options.year, log)
	if (options.runId) logEmit(options.runId, 'fetchedMetadata', { count: all.length })
	log('Total papers after fetch', { count: all.length })
	const selected = all.slice(0, options.maxPapers || 8)
	if (options.runId) logEmit(options.runId, 'selectedSubset', { selected: selected.length })
	log('Selected subset for processing', { selected: selected.length })
	if (selected.length === 0)
		return { success: false, error: 'No papers found to index', logs: log.getLogs() }

	const indexed: IndexedPaper[] = []
	const persistedPaperIds: string[] = []
	const contentHashes = new Set<string>()
	for (const p of selected) {
		if (options.runId) logEmit(options.runId, 'processPaperStart', { title: p.title, url: p.url })
		log('Processing paper', { title: p.title, url: p.url })
		const pdf = await downloadPdf(p.url, log)
		if (!pdf) {
			log('Skipping paper due to download failure', { url: p.url })
			if (options.runId) logEmit(options.runId, 'paperDownloadFailed', { url: p.url })
			continue
		}
		try {
			const h = await computeHash(pdf)
			if (contentHashes.has(h)) {
				log('Skipping paper due to duplicate content hash', { title: p.title })
				if (options.runId) logEmit(options.runId, 'duplicateContent', { title: p.title })
				continue
			}
			contentHashes.add(h)
		} catch (e: any) {
			log('Hash computation failed (continuing)', { error: e?.message })
		}
		const text = await extractTextFromPdf(pdf, log)
		if (!text || text.length < 50) {
			log('Skipping paper due to insufficient text', { chars: text.length })
			if (options.runId) logEmit(options.runId, 'paperTextInsufficient', { title: p.title })
			continue
		}
		const questions = extractQuestions(text, log)
		if (options.runId) logEmit(options.runId, 'extractedQuestions', { title: p.title, questions: questions.length })
		const chunksRaw = splitIntoChunks(text)
		log('Chunking complete', { chunks: chunksRaw.length })
		if (options.runId) logEmit(options.runId, 'chunked', { title: p.title, chunks: chunksRaw.length })
		const embeddingResult: any = await rateLimitedAI.google.embed({ values: chunksRaw })
		log('Embedding complete', { embeddings: embeddingResult.embeddings?.length })
		if (options.runId) logEmit(options.runId, 'chunkEmbeddings', { title: p.title })
		let questionEmbeddings: number[][] | undefined
		if (questions.length) {
			try {
				const qeRes: any = await rateLimitedAI.google.embed({ values: questions })
				questionEmbeddings = qeRes.embeddings || []
				log('Question embeddings complete', { count: (questionEmbeddings || []).length })
				if (options.runId) logEmit(options.runId, 'questionEmbeddings', { title: p.title, count: (questionEmbeddings || []).length })
			} catch (e: any) {
				log('Question embeddings failed', { error: e?.message })
				if (options.runId) logEmit(options.runId, 'questionEmbeddingsFailed', { title: p.title })
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
				contentHash: undefined,
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
		})
	}

	if (indexed.length === 0)
		return { success: false, error: 'Failed to process any papers', logs: log.getLogs() }

	const indexId = generateId('ppidx')
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
	if (options.runId) logEmit(options.runId, 'indexBuilt', { indexId, papers: indexed.length, chunks: chunkCount })

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

export async function askIndexedPaperQuestion(indexId: string, question: string, debug?: boolean, runId?: string) {
	const log = createLogger(debug || process.env.PAPER_AGENT_DEBUG === 'true')
	const index = paperIndexes.get(indexId)
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
			t => `Source: ${t.paper.title} (${t.paper.year} ${t.paper.examType})\n${t.chunk.text.substring(0, 1000)}`
		)
		.join('\n\n---\n\n')
	const prompt = `You are a precise assistant answering questions about VIT past exam papers.\nQuestion: ${question}\nUse ONLY the provided context. Quote specific question numbers or lines if relevant. If unknown, say you cannot find it.\nContext:\n${context}`
	const answer = await rateLimitedAI.google.generateText({
		model: { modelId: 'gemini-2.0-flash-lite-preview-02-05' },
		prompt,
	})
	log('Answer generated')
	return {
		success: true,
		answer: (answer as any).text,
		sources: Array.from(new Set(top.map(t => ({
			title: t.paper.title,
			url: t.paper.url,
			year: t.paper.year,
			examType: t.paper.examType,
			score: Number(t.score.toFixed(3)),
		})))).slice(0, 6),
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
	console.log(`[smartPaperSearchByQuestion] Starting with runId: "${opts.runId}" for course: ${opts.course}`)
	log('Smart paper search start', { course: opts.course, question: opts.question, runId: opts.runId })
	if (opts.runId) {
		console.log(`[smartPaperSearchByQuestion] Emitting start event for runId: ${opts.runId}`)
		logEmit(opts.runId, 'start', { course: opts.course, question: opts.question })
	} else {
		console.log(`[smartPaperSearchByQuestion] WARNING: No runId provided! Cannot emit progress events.`)
	}
	const indexResult = await indexPastPapers({
		course: opts.course,
		examType: opts.examType,
		year: opts.year,
		maxPapers: opts.maxPapers || 6,
		questionFocus: opts.question,
		debug: opts.debug,
		runId: opts.runId,
	})
	if (!indexResult.success) return { ...indexResult, runId: opts.runId, logs: (indexResult as any).logs }
	const useDB = !!process.env.DATABASE_URL2
	let index = paperIndexes.get(indexResult.indexId!)!
	const embedRes: any = await rateLimitedAI.google.embed({ value: opts.question })
	const qEmb = embedRes.embedding || embedRes.embeddings?.[0]
	log('User question embedded')
	if (opts.runId) logEmit(opts.runId, 'questionEmbedded', {})
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
	const paperScores: { paper: IndexedPaper; score: number; matchedQuestions: string[]; chunkScore: number; questionScore: number }[] = []
	if (useDB) {
		try {
			const semantic = await semanticRankQuestion(indexResult.courseCode!, qEmb, 20, opts.examType, opts.year)
			const qScores = await questionEmbeddingScores(indexResult.courseCode!, qEmb, opts.examType, opts.year)
			// fetch url + metadata for mapping paper ids to original URLs
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
				logEmit(opts.runId, 'rankingComplete', { papers: ranked.length })
				logEmit(opts.runId, 'done', {})
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
		if (scoredQs.length === 0) {
			log('No partial question matches for paper', { title: paper.title })
		}
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
		logEmit(opts.runId, 'rankingComplete', { papers: paperScores.length })
		logEmit(opts.runId, 'done', {})
	}
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

