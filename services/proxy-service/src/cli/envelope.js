'use strict'

const { z } = require('zod')

/**
 * cli-top proxy-mode envelope (cmd/proxy_command.go `proxyResponse`, helpers.TableSnapshot,
 * helpers.ProxySelectionRequest, sync `syncResultEntry`). Unknown keys are tolerated so newer
 * cli-top builds that add fields keep working.
 */

const tableSchema = z
  .object({
    headers: z.array(z.string()).default([]),
    rows: z.array(z.array(z.string())).default([]),
    hasIndex: z.boolean().default(false),
  })
  .loose()

const selectionRequestSchema = z
  .object({
    subject: z.string(),
    query: z.string().optional(),
    message: z.string().optional(),
    table: tableSchema,
  })
  .loose()

const errorSchema = z.object({ kind: z.string(), message: z.string().default('') }).loose()

const structuredSchema = z
  .object({
    tables: z.array(tableSchema).optional(),
    selection_requests: z.array(selectionRequestSchema).optional(),
    messages: z.array(z.string()).optional(),
    results: z.array(z.unknown()).optional(),
  })
  .loose()

const syncEntrySchema = z
  .object({
    command: z.string(),
    success: z.boolean(),
    output: z.string().optional(),
    structured_data: structuredSchema.nullish(),
    error: errorSchema.nullish(),
  })
  .loose()

const envelopeSchema = z
  .object({
    success: z.boolean(),
    command: z.string(),
    version: z.string().optional(),
    requested_at: z.string().optional(),
    completed_at: z.string().optional(),
    duration_ms: z.number().optional(),
    reg_no: z.string().optional(),
    flags: z.record(z.string(), z.string()).optional(),
    output: z.string().optional(),
    structured_data: structuredSchema.nullish(),
    error: errorSchema.nullish(),
  })
  .loose()

/**
 * cli-top prints exactly one JSON line, but login failures print human-readable text to stdout
 * *before* it (login.Login runs before output capture). Returns { envelope, preamble } or
 * { envelope: null, preamble, problem } when no valid envelope exists.
 */
function parseEnvelope(stdout) {
  const text = String(stdout || '')
  const lines = text.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line.startsWith('{')) continue
    let json
    try {
      json = JSON.parse(line)
    } catch {
      continue
    }
    const parsed = envelopeSchema.safeParse(json)
    if (!parsed.success) {
      return { envelope: null, preamble: lines.slice(0, i).join('\n').trim(), problem: 'envelope failed validation' }
    }
    return { envelope: parsed.data, preamble: lines.slice(0, i).join('\n').trim() }
  }
  return { envelope: null, preamble: text.trim(), problem: 'no JSON envelope in output' }
}

function parseSyncEntries(structured) {
  const results = Array.isArray(structured?.results) ? structured.results : []
  return results.flatMap(entry => {
    const parsed = syncEntrySchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

module.exports = { parseEnvelope, parseSyncEntries, envelopeSchema, selectionRequestSchema, tableSchema }
