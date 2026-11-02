'use strict'

const fs = require('fs')
const { z } = require('zod')

/**
 * Command catalog built from hub-capabilities.json.
 *
 * Every flag a client may send is allow-listed per command (`params` in the manifest) and
 * validated against PARAMS below, which mirrors the flags cli-top's proxy mode reads
 * (cmd/proxy_command.go executeFeatureCommand + internal/proxyutil canonicalFlagName).
 * Nothing else ever reaches the cli-top argv.
 */

class ValidationError extends Error {
  constructor(message, field, extra = {}) {
    super(message)
    this.name = 'ValidationError'
    this.kind = 'invalid_input'
    this.field = field
    Object.assign(this, extra)
  }
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

const PARAMS = {
  semester: {
    cli: 'semester',
    type: 'index',
    description:
      'Semester option index as listed by VTOP (1 = oldest). Omit for the latest semester; pass "list" to get every semester back as a needs_selection step.',
  },
  classGroup: { cli: 'class-group', type: 'index', description: 'Class group option index (defaults to the first group).' },
  course: {
    cli: 'course',
    type: 'selection',
    description: 'Course option index from a previous needs_selection step.',
  },
  faculty: { cli: 'faculty', type: 'selection', description: 'Faculty option index from a previous needs_selection step.' },
  materials: {
    cli: 'materials',
    type: 'materials',
    description: 'Material option indices/ranges, e.g. "1,3-5" (or [1,3,4,5]); "0" or "all" downloads everything.',
  },
  assignment: { cli: 'assignment', type: 'selection', description: 'DA option index from a previous needs_selection step.' },
  facility: { cli: 'facility', type: 'selection', description: 'Facility option index from a previous needs_selection step.' },
  category: { cli: 'category', type: 'selection', description: 'Curriculum category option index from a previous needs_selection step.' },
  confirm: { cli: 'confirm', type: 'boolean', description: 'Confirm an irreversible action.' },
  apply: { cli: 'apply', type: 'boolean', description: 'Submit a new application instead of showing status.' },
  leaveCode: { cli: 'leave-code', type: 'text', max: 40, description: 'Leave type code as listed by VTOP (e.g. HT1).' },
  visitingPlace: { cli: 'visiting-place', type: 'text', max: 150, description: 'Place you will visit.' },
  reason: { cli: 'reason', type: 'text', max: 500, description: 'Reason for leave.' },
  details: { cli: 'details', type: 'text', max: 500, description: 'Night slip details.' },
  fromDate: { cli: 'from-date', type: 'date', description: 'Start date (YYYY-MM-DD).' },
  fromTime: { cli: 'from-time', type: 'time', description: 'Start time (HH:MM 24h, or hh:MM AM/PM).' },
  toDate: { cli: 'to-date', type: 'date', description: 'End date (YYYY-MM-DD).' },
  toTime: { cli: 'to-time', type: 'time', description: 'End time (HH:MM 24h, or hh:MM AM/PM).' },
  costCentreId: { cli: 'cost-centre-id', type: 'id', description: 'Night slip cost centre id as listed by VTOP.' },
  appliedTo: { cli: 'applied-to', type: 'id', description: 'Night slip approver (warden) id as listed by VTOP.' },
  roomTypeId: { cli: 'room-type-id', type: 'id', description: 'Night slip room type id as listed by VTOP.' },
  buildingId: { cli: 'building-id', type: 'id', description: 'Night slip building id as listed by VTOP.' },
  venue: { cli: 'venue', type: 'text', max: 150, description: 'Night slip venue.' },
  eventId: { cli: 'event-id', type: 'id', description: 'Night slip late-hour event id as listed by VTOP.' },
  commands: { cli: 'commands', type: 'commands', description: 'Comma-separated commands for sync.' },
}

/** Machine formats per param type (shown to clients and in step.format). */
const FORMATS = {
  index: 'positive integer',
  selection: 'positive integer',
  materials: '"1,3-5" | "0" | "all" | [1,3,4]',
  boolean: 'boolean',
  date: 'YYYY-MM-DD (also DD-MM-YYYY)',
  time: 'HH:MM (24h) or hh:MM AM/PM',
  id: 'exact id',
  text: 'text',
  commands: 'comma-separated command names',
}

/** Sentinel for `semester`: an out-of-range index makes cli-top answer with the full semester table. */
const LIST_SEMESTERS = 9999

/** Accepted spellings -> canonical param name (camelCase, kebab-case and cli-top aliases). */
const ALIASES = (() => {
  const map = new Map()
  for (const [name, spec] of Object.entries(PARAMS)) {
    map.set(name.toLowerCase(), name)
    map.set(spec.cli.toLowerCase(), name)
  }
  const extra = {
    s: 'semester',
    g: 'classGroup',
    classgroup: 'classGroup',
    c: 'course',
    f: 'faculty',
    material: 'materials',
    materialselection: 'materials',
    assignments: 'assignment',
    leavecode: 'leaveCode',
    visitingplace: 'visitingPlace',
    fromdate: 'fromDate',
    fromtime: 'fromTime',
    todate: 'toDate',
    totime: 'toTime',
    costcentreid: 'costCentreId',
    costcenterid: 'costCentreId',
    'cost-center-id': 'costCentreId',
    appliedto: 'appliedTo',
    roomtypeid: 'roomTypeId',
    buildingid: 'buildingId',
    eventid: 'eventId',
    x: 'commands',
  }
  for (const [alias, name] of Object.entries(extra)) map.set(alias, name)
  return map
})()

/** Accepted for backwards compatibility but never forwarded. */
const IGNORED_FLAGS = new Set(['fuzzyindex', 'interactivestep', 'debug', 'd'])

const stepSchema = z.object({
  subject: z.string().min(1),
  param: z.string().min(1),
  select: z.enum(['index', 'fuzzy', 'multi']),
  label: z.string().min(1),
})

const entrySchema = z
  .object({
    command: z.string().regex(/^[a-z][a-z-]*$/),
    cliCommand: z.string().regex(/^[a-z][a-z-]*$/).optional(),
    title: z.string(),
    description: z.string(),
    group: z.string(),
    kind: z.enum(['read', 'write', 'download']).default('read'),
    cacheTtlSeconds: z.number().int().nonnegative().default(0),
    sync: z.boolean().default(false),
    selectionIsData: z.boolean().default(false),
    writeWhen: z.string().optional(),
    params: z.array(z.string()).default([]),
    steps: z.array(stepSchema).default([]),
  })
  .loose()

function loadManifest(manifestPath) {
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const entries = z.array(entrySchema).parse(raw)
  for (const entry of entries) {
    for (const param of entry.params) {
      if (!PARAMS[param]) throw new Error(`[catalog] ${entry.command}: unknown param "${param}"`)
    }
    for (const step of entry.steps) {
      if (!entry.params.includes(step.param)) {
        throw new Error(`[catalog] ${entry.command}: step param "${step.param}" missing from params`)
      }
    }
    if (entry.writeWhen && !entry.params.includes(entry.writeWhen)) {
      throw new Error(`[catalog] ${entry.command}: writeWhen "${entry.writeWhen}" missing from params`)
    }
  }
  return entries
}

// ------------------------------------------------------------------ value validation
function asText(value, field, max = 200) {
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value)
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`, field)
  const trimmed = value.trim()
  if (!trimmed) throw new ValidationError(`${field} must not be empty`, field)
  if (trimmed.length > max) throw new ValidationError(`${field} must be at most ${max} characters`, field)
  if (CONTROL_CHARS.test(trimmed)) throw new ValidationError(`${field} contains control characters`, field)
  // cli-top's ParseFlags treats any argument starting with "-" as the next flag.
  if (trimmed.startsWith('-')) throw new ValidationError(`${field} must not start with "-"`, field)
  return trimmed
}

function asIndex(value, field) {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!/^\d{1,4}$/.test(text) || parseInt(text, 10) < 1) {
    throw new ValidationError(`${field} must be a positive integer index`, field)
  }
  return parseInt(text, 10)
}

const MATERIALS_GRAMMAR = /^(0|[1-9]\d{0,3}(-[1-9]\d{0,3})?(,[1-9]\d{0,3}(-[1-9]\d{0,3})?)*)$/

function normalizeValue(name, value) {
  const spec = PARAMS[name]
  switch (spec.type) {
    case 'index':
      if (name === 'semester' && value === 'list') return LIST_SEMESTERS
      return asIndex(value, name)
    case 'selection': {
      // Integer option index. Commands whose cli-top step does its own search (steps[].select
      // "fuzzy") also accept a string, forwarded verbatim to cli-top; see Catalog#normalizeParams.
      if (typeof value === 'number') return asIndex(value, name)
      const text = asText(value, name, 120)
      return /^\d+$/.test(text) ? asIndex(text, name) : text
    }
    case 'materials': {
      if (Array.isArray(value)) value = value.join(',')
      if (typeof value === 'number') value = String(value)
      const text = asText(value, name, 200).replace(/\s+/g, '')
      if (text === 'all') return '0'
      if (!MATERIALS_GRAMMAR.test(text)) {
        throw new ValidationError('materials must look like "1,3-5" (or "0"/"all" for everything)', name)
      }
      return text
    }
    case 'boolean':
      if (value === true || value === false) return value
      if (value === 'true') return true
      if (value === 'false') return false
      throw new ValidationError(`${name} must be a boolean`, name)
    case 'date': {
      const text = asText(value, name, 10)
      if (!/^(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/](\d{4}|\d{2}))$/.test(text)) {
        throw new ValidationError(`${name} must be a date like 2025-11-20`, name)
      }
      return text
    }
    case 'time': {
      const text = asText(value, name, 11).toUpperCase()
      if (!/^\d{1,2}:\d{2}(:\d{2})?(\s?[AP]M)?$/.test(text)) {
        throw new ValidationError(`${name} must be a time like 20:30 or 08:30 PM`, name)
      }
      return text
    }
    case 'id': {
      const text = asText(value, name, 64)
      if (!/^[A-Za-z0-9][A-Za-z0-9 ._/:()-]*$/.test(text)) throw new ValidationError(`${name} has invalid characters`, name)
      return text
    }
    case 'text':
      return asText(value, name, spec.max || 200)
    case 'commands':
      // validated against the catalog in normalizeParams
      if (Array.isArray(value)) value = value.join(',')
      return asText(value, name, 400)
    default:
      throw new ValidationError(`Unsupported flag ${name}`, name)
  }
}

class Catalog {
  constructor(entries) {
    this.entries = new Map(entries.map(entry => [entry.command, { ...entry, cliCommand: entry.cliCommand || entry.command }]))
  }

  static fromFile(manifestPath) {
    return new Catalog(loadManifest(manifestPath))
  }

  list() {
    return [...this.entries.values()]
  }

  names() {
    return [...this.entries.keys()]
  }

  get(command) {
    return typeof command === 'string' ? this.entries.get(command.trim().toLowerCase()) : undefined
  }

  /** Commands that may run inside a cli-top `sync` batch (deduplicated by cliCommand). */
  syncable() {
    return this.list().filter(entry => entry.sync)
  }

  stepFor(entry, subject) {
    const key = String(subject || '').trim().toLowerCase()
    return entry.steps.find(step => step.subject.toLowerCase() === key)
  }

  isWrite(entry, flags) {
    return entry.kind === 'write' || Boolean(entry.writeWhen && flags && flags[entry.writeWhen] === true)
  }

  paramSpec(name) {
    return PARAMS[name]
  }

  /**
   * Validate client flags for a command. Returns canonical param names -> validated values.
   * Only exact machine values are accepted; nothing here interprets natural language.
   */
  normalizeParams(entry, rawFlags = {}) {
    if (rawFlags === null || rawFlags === undefined) rawFlags = {}
    if (typeof rawFlags !== 'object' || Array.isArray(rawFlags)) throw new ValidationError('flags must be an object', 'flags')

    const flags = {}
    for (const [key, value] of Object.entries(rawFlags)) {
      if (value === undefined || value === null || value === '') continue
      const lower = key.toLowerCase()
      if (IGNORED_FLAGS.has(lower)) continue
      const name = ALIASES.get(lower)
      if (!name || !entry.params.includes(name)) {
        throw new ValidationError(
          `Unsupported flag "${key}" for ${entry.command}. Supported: ${entry.params.join(', ') || 'none'}`,
          key
        )
      }
      flags[name] = normalizeValue(name, value)
    }

    if (flags.commands !== undefined) {
      const list = String(flags.commands)
        .split(',')
        .map(item => item.trim().toLowerCase())
        .filter(Boolean)
      const unknown = list.filter(item => !this.get(item) || !this.get(item).sync)
      if (!list.length || unknown.length) {
        throw new ValidationError(`Unsupported sync commands: ${unknown.join(', ') || '(none)'}`, 'commands')
      }
      flags.commands = [...new Set(list.map(item => this.get(item).cliCommand))].join(',')
    }
    // A string is only meaningful where cli-top itself searches (select: "fuzzy"); it is passed
    // through verbatim. Everywhere else a selection flag must be an option index.
    for (const [name, value] of Object.entries(flags)) {
      if (PARAMS[name].type !== 'selection' || typeof value !== 'string') continue
      const step = entry.steps.find(candidate => candidate.param === name)
      if (!step || step.select !== 'fuzzy') {
        throw new ValidationError(`${name} must be a positive integer option index for ${entry.command}`, name)
      }
    }
    return flags
  }

  /** Canonical flags -> cli-top argv (after `proxy <user> <pass> <command>`). */
  toCliArgs(flags) {
    const args = []
    for (const [name, value] of Object.entries(flags)) {
      const spec = PARAMS[name]
      if (!spec || value === undefined || value === null || value === false) continue
      const text = value === true ? 'true' : String(value)
      if (!text || text.startsWith('-') || CONTROL_CHARS.test(text)) {
        throw new ValidationError(`Refusing unsafe value for ${name}`, name)
      }
      args.push(`--${spec.cli}`, text)
    }
    return args
  }
}

module.exports = { Catalog, ValidationError, PARAMS, FORMATS, LIST_SEMESTERS, loadManifest, normalizeValue }
