'use strict'

const crypto = require('crypto')
const { ProxyError, kindInfo, classifyAuthFailure, classifyExecutionError } = require('./cli/errors')
const { parseSyncEntries } = require('./cli/envelope')
const { digestMessages, composeText, buildOptions, publicOption, renderTable } = require('./cli/output')
const { matchOne, matchMany } = require('./workflow/match')
const { ValidationError, normalizeValue, PARAMS } = require('./catalog')
const { TtlCache } = require('./cache')
const { deriveKey } = require('./workflow/token')

const LIST_SEMESTERS = 9999 // out-of-range index: cli-top answers with the full semester table
const MAX_RUNS_PER_REQUEST = 5
const FILTERED_SELECTION = /^(multiple matches|no matches|no valid matches|invalid)/i
const DEFAULT_SYNC = ['profile', 'timetable', 'attendance', 'marks', 'cgpa', 'exams', 'da']
const RETRYABLE_KINDS = new Set(['vtop_unavailable', 'captcha_failed', 'cli_crashed'])
const CANCEL_WORDS = /^(cancel|exit|stop|abort|no|nevermind|never mind)$/i
const CONFIRM_WORDS = /^(confirm|yes|y|ok|okay|proceed|submit|register|true)$/i

const stable = value => JSON.stringify(Object.keys(value).sort().map(key => [key, value[key]]))

/**
 * Orchestrates cli-top runs: validation -> cache -> single-flight -> scheduler -> runner, and the
 * generic multi-step workflow on top (selection steps, missing-input steps, confirmations).
 */
class VtopService {
  constructor({ config, catalog, runner, scheduler, cache, flight, files, tokens, logger }) {
    this.config = config
    this.catalog = catalog
    this.runner = runner
    this.scheduler = scheduler
    this.cache = cache
    this.flight = flight
    this.files = files
    this.tokens = tokens
    this.logger = logger
    this.credKey = deriveKey(config.tokenSecret, 'vtop-proxy/credential-key/v1')
    this.optionCache = new TtlCache({ maxEntries: 2000 })
    this.spawnWindows = new Map() // per-user spawn timestamps (abuse limit)
    this.counters = { spawns: 0, cacheHits: 0, retries: 0, autoSelections: 0 }
  }

  // ---------------------------------------------------------------- helpers
  validateCredentials(username, password) {
    if (typeof username !== 'string' || !this.config.usernamePattern.test(username.trim())) {
      throw new ValidationError('username must be a VTOP registration number (e.g. 21BCE0001)', 'username')
    }
    if (typeof password !== 'string' || !password || password.length > 128 || /[\u0000\r\n]/.test(password)) {
      throw new ProxyError('missing_credentials', 'A valid VTOP password is required.')
    }
    return { username: username.trim().toUpperCase(), password }
  }

  /** Cache / single-flight key component: only callers with the same user AND password share it. */
  credentialKey(creds) {
    return crypto.createHmac('sha256', this.credKey).update(`${creds.username}\u0000${creds.password}`).digest('base64url')
  }

  checkSpawnBudget(userTag) {
    const { perUserLimit, perUserWindowMs } = this.config
    if (!perUserLimit || perUserLimit <= 0) return
    const now = Date.now()
    const recent = (this.spawnWindows.get(userTag) || []).filter(at => now - at < perUserWindowMs)
    if (recent.length >= perUserLimit) {
      const retryAfterMs = perUserWindowMs - (now - recent[0])
      throw new ProxyError('rate_limited', 'VTOP rate limit reached for this user. Please try again in a few minutes.', {
        retryAfterMs,
      })
    }
    recent.push(now)
    this.spawnWindows.set(userTag, recent)
  }

  // ---------------------------------------------------------------- one cli-top run
  /** Spawns cli-top once and normalises the envelope into an "invocation". Never throws for CLI errors. */
  async spawnOnce(entry, args, creds, userTag) {
    this.checkSpawnBudget(userTag)
    this.counters.spawns++
    const timeoutMs = entry.kind === 'download' ? this.config.cliDownloadTimeoutMs : this.config.cliTimeoutMs
    const outcome = await this.runner.run({
      cliCommand: entry.cliCommand,
      args,
      username: creds.username,
      password: creds.password,
      timeoutMs,
    })
    try {
      return await this.normalizeOutcome(entry, outcome, userTag)
    } finally {
      await outcome.cleanup()
    }
  }

  async normalizeOutcome(entry, outcome, userTag) {
    const base = { cliDurationMs: outcome.durationMs }
    if (outcome.spawnError) {
      const missing = ['ENOENT', 'EACCES'].includes(outcome.spawnError.code)
      return { ...base, kind: 'error', error: { kind: missing ? 'cli_unavailable' : 'internal_error', message: kindInfo(missing ? 'cli_unavailable' : 'internal_error').message } }
    }
    if (outcome.timedOut) {
      const kind = outcome.overflow ? 'protocol_error' : 'timeout'
      return { ...base, kind: 'error', error: { kind, message: kindInfo(kind).message } }
    }
    const env = outcome.envelope
    if (!env) {
      if (/decommissioned/i.test(outcome.preamble)) {
        return { ...base, kind: 'error', error: { kind: 'cli_unavailable', message: 'This cli-top version has been decommissioned by its maintainers (kill switch). Update the proxy binary.' } }
      }
      const crashed = outcome.exitCode !== 0 || outcome.signal
      const kind = crashed ? 'cli_crashed' : 'protocol_error'
      this.logger.warn(`[service] ${entry.cliCommand}: ${outcome.problem}; exit=${outcome.exitCode} signal=${outcome.signal}`)
      return { ...base, kind: 'error', error: { kind, message: kindInfo(kind).message } }
    }

    const shaped = this.shapeEnvelope(env, outcome.scrub)
    const stored = outcome.downloads.length ? await this.files.ingest(outcome.downloads, { owner: userTag }) : []
    const inv = {
      ...base,
      ...shaped,
      version: env.version || null,
      regNo: env.reg_no || null,
      cliFlags: env.flags || null,
      storedFiles: stored,
    }
    return this.classify(inv, env, outcome.preamble)
  }

  shapeEnvelope(env, scrub = text => text) {
    const structured = env.structured_data || {}
    const messages = structured.messages || (env.output ? env.output.split('\n') : [])
    const { lines, links } = digestMessages(messages, scrub)
    const tables = structured.tables || []
    const selections = structured.selection_requests || []
    const scrubbedStructured = env.structured_data
      ? { ...env.structured_data, ...(structured.messages ? { messages: structured.messages.map(scrub) } : {}) }
      : null
    return { lines, links, tables, selections, structured: scrubbedStructured, text: composeText(lines, tables) }
  }

  classify(inv, env, preamble) {
    const error = env.error
    if (error && error.kind === 'selection_required' && inv.selections.length) {
      return { ...inv, kind: 'selection', selection: inv.selections[0] }
    }
    if (error) {
      let kind
      switch (error.kind) {
        case 'auth_failed':
          kind = classifyAuthFailure(error.message, preamble)
          break
        case 'execution_error':
          kind = classifyExecutionError(error.message)
          break
        case 'invalid_flags':
          kind = 'invalid_input'
          break
        case 'encoding_error':
          kind = 'protocol_error'
          break
        case 'partial_failure':
          return { ...inv, kind: 'ok', partial: true }
        default:
          kind = 'execution_error'
      }
      const message = ['invalid_input', 'conflict', 'not_found', 'execution_error', 'unsupported_command'].includes(kind)
        ? error.message || kindInfo(kind).message
        : kindInfo(kind).message
      return { ...inv, kind: 'error', error: { kind, message, detail: error.message } }
    }
    // cli-top features often print "Error ...: x" and return nil (success=true). With nothing
    // else to show, surface that as an error instead of an empty success.
    if (!inv.tables.length && !inv.storedFiles.length) {
      const failure = inv.lines.find(line => /^(Error|Failed|Unable)\b/.test(line))
      if (failure) {
        const detail = failure.replace(/^[^:]*:\s*/, '')
        const kind = classifyExecutionError(detail)
        return { ...inv, kind: 'error', error: { kind, message: failure, detail } }
      }
    }
    return { ...inv, kind: 'ok' }
  }

  /** Cache -> single-flight -> scheduler -> spawn, with retry for transient failures. */
  async invoke(entry, flags, creds, { fresh = false, signal } = {}) {
    const userTag = this.tokens.userTag(creds.username)
    const args = this.catalog.toCliArgs(flags)
    const write = this.catalog.isWrite(entry, flags)
    const key = `${this.credentialKey(creds)}|${entry.cliCommand}|${stable(flags)}`
    const cacheable = this.config.cacheEnabled && !write && entry.cacheTtlSeconds > 0

    if (cacheable && !fresh) {
      const hit = this.cache.get(key)
      if (hit) {
        this.counters.cacheHits++
        const storedFiles = (hit.value.storedFiles || []).filter(file => this.files.isAlive(file.id))
        return { ...hit.value, storedFiles, cached: true, cachedAt: new Date(hit.storedAt).toISOString(), queuedMs: 0 }
      }
    }

    const attemptOnce = () =>
      this.scheduler
        .schedule(userTag, () => this.spawnOnce(entry, args, creds, userTag), { signal })
        .then(({ value, queuedMs }) => ({ ...value, queuedMs }))

    const run = async () => {
      let attempts = 0
      for (;;) {
        attempts++
        const inv = await attemptOnce()
        const retry =
          !write &&
          inv.kind === 'error' &&
          RETRYABLE_KINDS.has(inv.error.kind) &&
          attempts <= this.config.retryAttempts
        if (!retry) return { ...inv, attempts }
        this.counters.retries++
        await new Promise(resolve => setTimeout(resolve, 400 * attempts))
      }
    }

    const inv = write ? await run() : await this.flight.run(key, run)
    if (inv.kind === 'ok' && cacheable && !inv.partial) {
      this.cache.set(key, inv, entry.cacheTtlSeconds * 1000, userTag)
    }
    if (inv.kind === 'ok' && write) this.cache.invalidateTag(userTag)
    return inv
  }

  // ---------------------------------------------------------------- results
  baseResult(entry, inv, state) {
    const files = (inv && inv.storedFiles ? inv.storedFiles : []).map(meta => this.files.describe(meta))
    const result = {
      command: entry.command,
      cliCommand: entry.cliCommand,
      data: inv ? inv.text : '',
      output: inv ? inv.text : '',
      structured_data: inv ? inv.structured : null,
      tables: inv ? inv.tables : [],
      messages: inv ? inv.lines : [],
      links: inv ? inv.links : [],
      files,
      raw: false,
      progress: state ? state.history : [],
      meta: {
        version: inv ? inv.version : null,
        regNo: inv ? inv.regNo : null,
        cliDurationMs: inv ? inv.cliDurationMs || null : null,
        queuedMs: inv ? inv.queuedMs || 0 : 0,
        cached: Boolean(inv && inv.cached),
        cachedAt: inv && inv.cachedAt ? inv.cachedAt : null,
        shared: Boolean(inv && inv.shared),
        attempts: inv ? inv.attempts || 1 : 0,
        runs: state ? state.runs : 0,
        autoSelected: state ? state.autoSelected : [],
        flags: state ? state.flags : {},
      },
    }
    if (inv && inv.storedFiles && inv.storedFiles.length > 1) {
      const bundle = this.files.createBundle(inv.storedFiles, `${entry.command}-${new Date().toISOString().slice(0, 10)}`)
      result.bundle = this.files.describeBundle(bundle)
    }
    return result
  }

  errorResult(entry, error, inv, state) {
    const info = kindInfo(error.kind)
    return {
      ...(entry ? this.baseResult(entry, inv, state) : { command: null, data: '', output: '', meta: {} }),
      success: false,
      status: 'error',
      error: error.message || info.message,
      errorKind: error.kind,
      retryable: info.retryable,
      requiresCredentials: info.requiresCredentials,
      httpStatus: info.status,
      message: error.message || info.message,
      ...(error.field ? { field: error.field } : {}),
      ...(error.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}),
    }
  }

  completedResult(entry, inv, state) {
    const result = this.baseResult(entry, inv, state)
    const message = result.files.length
      ? `Downloaded ${result.files.length} file${result.files.length === 1 ? '' : 's'} from VTOP.`
      : inv.lines.find(line => /success|submitted|completed/i.test(line)) || `Fetched ${entry.title} from VTOP.`
    return { ...result, success: true, status: 'completed', message, httpStatus: 200 }
  }

  pendingResult(entry, inv, state, status, step, options) {
    const { token, jti } = this.tokens.seal({
      u: this.tokens.userTag(state.creds.username),
      un: state.creds.username, // encrypted inside the token; lets clients continue without resending it
      c: entry.command,
      f: state.flags,
      h: state.hints,
      cf: state.confirmed || undefined,
      s: { param: step.id, kind: step.kind, select: step.select, label: step.label },
      hist: state.history,
    })
    if (options) this.optionCache.set(jti, options, this.config.workflowTtlSeconds * 1000)
    const result = this.baseResult(entry, inv, state)
    const optionTable = step.options && step.options.length
      ? renderTable({ headers: ['INDEX', 'OPTION', 'DETAILS'], rows: step.options.map(o => [o.id, o.label, o.description || '']) })
      : ''
    const text = [step.prompt, optionTable].filter(Boolean).join('\n\n')
    return {
      ...result,
      success: true,
      status,
      step,
      continuation: token,
      message: step.prompt,
      data: text,
      output: text,
      httpStatus: 200,
    }
  }

  // ---------------------------------------------------------------- workflow
  async execute({ command, username, password, flags, select, confirm, fresh, signal }) {
    const entry = this.catalog.get(command)
    if (!entry || entry.command === 'sync') {
      return this.errorResult(null, new ProxyError('unsupported_command', `Unsupported command: ${command}`))
    }
    try {
      const creds = this.validateCredentials(username, password)
      const { flags: normalized, hints } = this.catalog.normalizeParams(entry, flags, select)
      const state = { creds, flags: normalized, hints, confirmed: confirm === true, history: [], autoSelected: [], runs: 0 }
      return await this.drive(entry, state, { fresh, signal })
    } catch (error) {
      return this.errorResult(entry, toProxyError(error, this.logger))
    }
  }

  async continueWorkflow({ continuation, choice, username, password, confirm, signal }) {
    let entry
    try {
      const body = this.tokens.open(continuation, username ? String(username).trim().toUpperCase() : null)
      const creds = this.validateCredentials(username || body.un, password)
      entry = this.catalog.get(body.c)
      if (!entry) throw new ProxyError('token_invalid')
      const state = {
        creds,
        flags: body.f || {},
        hints: body.h || {},
        confirmed: Boolean(body.cf) || confirm === true,
        history: body.hist || [],
        autoSelected: [],
        runs: 0,
      }
      const step = body.s || {}
      const raw = Array.isArray(choice) ? choice.map(String).join(',') : choice === undefined || choice === null ? '' : String(choice).trim()
      if (CANCEL_WORDS.test(raw)) {
        return { ...this.baseResult(entry, null, state), success: true, status: 'cancelled', message: 'Cancelled.', httpStatus: 200 }
      }
      const cachedOptions = this.optionCache.get(body.jti)
      const options = cachedOptions ? cachedOptions.value : null

      if (step.kind === 'confirm') {
        if (!(CONFIRM_WORDS.test(raw) || choice === true || confirm === true)) {
          return { ...this.baseResult(entry, null, state), success: true, status: 'cancelled', message: 'Not confirmed; nothing was submitted.', httpStatus: 200 }
        }
        state.confirmed = true
        if (step.param === 'confirm') state.flags.confirm = true
        state.history.push({ step: step.param, label: step.label, choice: 'Confirmed' })
      } else if (step.kind === 'input') {
        if (!raw) throw new ValidationError(`A value for ${step.label} is required`, step.param)
        const value = options && options.length ? resolveInputOption(options, raw) : raw
        state.flags[step.param] = normalizeValue(step.param, value)
        state.history.push({ step: step.param, label: step.label, choice: String(value) })
      } else if (step.kind === 'select') {
        if (!raw) throw new ValidationError('choice is required', 'choice')
        const pending = this.applySelection(entry, state, step, raw, options)
        if (pending) return pending
      } else {
        throw new ProxyError('token_invalid')
      }
      return await this.drive(entry, state, { signal })
    } catch (error) {
      return this.errorResult(entry, toProxyError(error, this.logger))
    }
  }

  /** Applies a client's choice for a selection step. Returns a result only if it needs re-asking. */
  applySelection(entry, state, step, raw, options) {
    const param = step.param
    if (step.select === 'multi') {
      let selection
      try {
        selection = normalizeValue(param, raw)
      } catch {
        const matched = options ? matchMany(options, raw) : {}
        if (!matched.selection) {
          if (!options) {
            state.hints[param] = raw
            return null
          }
          return this.reask(entry, state, step, options, `Nothing matched "${raw}". Choose option numbers (e.g. 1,3-5) or "all".`)
        }
        selection = matched.selection
      }
      state.flags[param] = selection
      state.history.push({ step: param, label: step.label, choice: describeSelection(selection, options) })
      return null
    }
    if (/^\d+$/.test(raw)) {
      const index = parseInt(raw, 10)
      if (options && !options.some(option => option.index === index)) {
        return this.reask(entry, state, step, options, `Option ${raw} doesn't exist; choose one of the listed options.`)
      }
      state.flags[param] = index
      const option = options && options.find(candidate => candidate.index === index)
      state.history.push({ step: param, label: step.label, choice: option ? option.label : raw })
      return null
    }
    if (!options) {
      state.hints[param] = raw
      return null
    }
    const matched = matchOne(options, raw, { param })
    if (matched.option) {
      state.flags[param] = matched.option.index
      state.history.push({ step: param, label: step.label, choice: matched.option.label })
      return null
    }
    const narrowed = matched.ranked.length ? matched.ranked : options
    return this.reask(entry, state, step, options, `"${raw}" matches ${matched.ranked.length ? 'several' : 'no'} options; pick one by number.`, narrowed)
  }

  reask(entry, state, step, options, prompt, shown = options) {
    const view = { id: step.param, kind: 'select', select: step.select, label: step.label, multiple: step.select === 'multi', prompt, options: shown.map(publicOption) }
    return this.pendingResult(entry, null, state, 'needs_selection', view, options)
  }

  /** The workflow loop: run cli-top, resolve what it asks for from hints, or hand it to the client. */
  async drive(entry, state, { fresh, signal } = {}) {
    let inv = null
    while (state.runs < MAX_RUNS_PER_REQUEST) {
      if (this.catalog.isWrite(entry, state.flags) && entry.writeWhen === 'apply' && !state.confirmed) {
        return this.pendingResult(entry, null, state, 'needs_confirmation', confirmationStep(entry, state.flags), null)
      }
      if (state.hints.semester && state.flags.semester === undefined && entry.steps.some(s => s.param === 'semester')) {
        if (/^(latest|current|this|now)( semester)?$/i.test(state.hints.semester.trim())) delete state.hints.semester
        else state.flags.semester = LIST_SEMESTERS
      }
      // "all" / explicit indices need no table: send them up front and save a VTOP round trip.
      for (const step of entry.steps) {
        const hint = state.hints[step.param]
        if (step.select !== 'multi' || !hint || state.flags[step.param] !== undefined) continue
        const direct = matchMany([], hint)
        if (direct.selection) {
          delete state.hints[step.param]
          this.autoSelect(state, step, direct.selection, describeSelection(direct.selection, null), hint)
        }
      }

      state.runs++
      inv = await this.invoke(entry, state.flags, state.creds, { fresh, signal })

      if (inv.kind === 'ok') {
        if (state.flags.semester === LIST_SEMESTERS) delete state.flags.semester // only one semester exists
        return this.completedResult(entry, inv, state)
      }

      if (inv.kind === 'error') {
        const pending = this.inputStepFromError(entry, inv, state)
        if (pending) return pending
        return this.errorResult(entry, inv.error, inv, state)
      }

      // ---- selection requested
      const selection = inv.selection
      const step = this.catalog.stepFor(entry, selection.subject)
      if (!step) {
        this.logger.warn(`[service] ${entry.command}: unmapped selection subject "${selection.subject}"`)
        return this.completedResult(entry, inv, state)
      }
      const options = buildOptions(selection.table)
      const current = state.flags[step.param]
      if (FILTERED_SELECTION.test(selection.message || '') && current !== undefined && current !== LIST_SEMESTERS) {
        // cli-top's own fuzzy match was ambiguous (or the index was out of range). The rows it
        // returned are re-numbered, so re-run without the flag to get stable indices and match here.
        if (typeof current === 'string') state.hints[step.param] = state.hints[step.param] || current
        delete state.flags[step.param]
        continue
      }
      if (current === LIST_SEMESTERS) delete state.flags[step.param]

      let unmatched = null
      let shown = options
      const hint = state.hints[step.param]
      if (hint) {
        delete state.hints[step.param]
        if (step.select === 'multi') {
          const matched = matchMany(options, hint)
          if (matched.selection) {
            this.autoSelect(state, step, matched.selection, describeSelection(matched.selection, options), hint)
            continue
          }
        } else {
          const matched = matchOne(options, hint, { param: step.param })
          if (matched.option) {
            this.autoSelect(state, step, matched.option.index, matched.option.label, hint)
            continue
          }
          if (matched.ranked.length) shown = [...matched.ranked, ...options.filter(o => !matched.ranked.includes(o))]
        }
        unmatched = hint
      }

      const prompt = unmatched
        ? `Couldn't pick a ${step.label.toLowerCase()} for "${unmatched}" automatically. Choose one:`
        : step.select === 'multi'
          ? `Choose ${step.label.toLowerCase()} to download (numbers/ranges like 1,3-5, or "all").`
          : `Choose a ${step.label.toLowerCase()}.`
      const view = {
        id: step.param,
        kind: 'select',
        select: step.select,
        label: step.label,
        multiple: step.select === 'multi',
        ...(step.select === 'multi' ? { allowAll: true } : {}),
        prompt,
        ...(unmatched ? { unmatchedHint: unmatched } : {}),
        options: shown.map(publicOption),
      }
      return this.pendingResult(entry, inv, state, 'needs_selection', view, options)
    }
    return this.errorResult(entry, { kind: 'execution_error', message: 'The VTOP workflow did not converge; please choose options manually.' }, inv, state)
  }

  autoSelect(state, step, value, label, hint) {
    state.flags[step.param] = value
    state.history.push({ step: step.param, label: step.label, choice: label, auto: true })
    state.autoSelected.push({ step: step.param, hint, choice: label })
    this.counters.autoSelections++
  }

  /** cli-top apply flows report missing/invalid fields as errors; turn them into input steps. */
  inputStepFromError(entry, inv, state) {
    const detail = inv.error.detail || inv.error.message || ''
    if (/registration confirmation required/i.test(detail) && entry.params.includes('confirm')) {
      return this.pendingResult(entry, inv, state, 'needs_confirmation', {
        id: 'confirm',
        kind: 'confirm',
        label: 'Confirm registration',
        prompt: 'Register for the selected facility? This submits the registration on VTOP.',
        options: [
          { id: 'confirm', index: 1, label: 'Confirm' },
          { id: 'cancel', index: 2, label: 'Cancel' },
        ],
      }, null)
    }
    const match = detail.match(/^(missing|invalid) --([a-z-]+)(?: "[^"]*")?(?:;\s*available \w+ values:\s*(.+))?/i)
    if (!match) return null
    const param = Object.keys(PARAMS).find(name => PARAMS[name].cli === match[2].toLowerCase())
    if (!param || !entry.params.includes(param)) return null
    const options = match[3] ? parseFormOptions(match[3]) : null
    delete state.flags[param]
    const spec = PARAMS[param]
    const view = {
      id: param,
      kind: 'input',
      label: humanize(param),
      inputType: options ? 'choice' : spec.type,
      prompt: options
        ? `Choose ${humanize(param).toLowerCase()}.`
        : `${match[1].toLowerCase() === 'missing' ? 'Provide' : 'Correct'} ${humanize(param).toLowerCase()}: ${detail}`,
      ...(spec.description ? { description: spec.description } : {}),
      ...(options ? { options: options.map(publicOption) } : {}),
    }
    return this.pendingResult(entry, inv, state, 'needs_input', view, options)
  }

  // ---------------------------------------------------------------- sync
  /**
   * Batch refresh. Cached commands are answered immediately (and streamed first when `onEntry`
   * is given); the rest run in ONE cli-top `sync` invocation, i.e. one VTOP login.
   */
  async sync({ username, password, commands, flags, fresh, onEntry, signal }) {
    const started = Date.now()
    const creds = this.validateCredentials(username, password)
    const requested = Array.isArray(commands) && commands.length ? commands : DEFAULT_SYNC
    const entries = requested.map(name => {
      const entry = this.catalog.get(String(name))
      if (!entry || !entry.sync) throw new ValidationError(`Unsupported sync command: ${name}`, 'commands')
      return entry
    })
    const syncEntry = this.catalog.get('sync')
    const { flags: shared } = this.catalog.normalizeParams(syncEntry, flags || {})
    delete shared.commands
    const userTag = this.tokens.userTag(creds.username)
    const ck = this.credentialKey(creds)
    const results = []
    const emit = entry => {
      results.push(entry)
      if (onEntry) onEntry(entry)
    }

    const pending = []
    for (const entry of entries) {
      const own = Object.fromEntries(Object.entries(shared).filter(([key]) => entry.params.includes(key)))
      const key = `${ck}|${entry.cliCommand}|${stable(own)}`
      const hit = !fresh && this.config.cacheEnabled ? this.cache.get(key) : undefined
      if (hit) {
        this.counters.cacheHits++
        emit(this.syncEntry(entry, { ...hit.value, cached: true, cachedAt: new Date(hit.storedAt).toISOString() }))
      } else pending.push({ entry, key })
    }

    if (pending.length) {
      const cliCommands = [...new Set(pending.map(p => p.entry.cliCommand))]
      const run = () =>
        this.scheduler
          .schedule(userTag, () => this.spawnSync(syncEntry, cliCommands, shared, creds, userTag), { signal })
          .then(({ value }) => value)
      const outcome = await this.flight.run(`${ck}|sync|${cliCommands.join(',')}|${stable(shared)}`, run)
      for (const { entry, key } of pending) {
        const inv = outcome.error ? { kind: 'error', error: outcome.error } : outcome.byCommand.get(entry.cliCommand)
        const normalized = inv || { kind: 'error', error: { kind: 'protocol_error', message: 'cli-top returned no result for this command' } }
        if (normalized.kind === 'ok' && entry.cacheTtlSeconds > 0 && this.config.cacheEnabled) {
          this.cache.set(key, normalized, entry.cacheTtlSeconds * 1000, userTag)
        }
        emit(this.syncEntry(entry, normalized))
      }
    }
    const firstError = results.find(r => !r.success)
    return {
      success: results.every(r => r.success),
      startedAt: new Date(started).toISOString(),
      durationMs: Date.now() - started,
      results,
      ...(firstError && results.every(r => !r.success) ? { error: firstError.error, errorKind: firstError.errorKind } : {}),
    }
  }

  async spawnSync(syncEntry, cliCommands, shared, creds, userTag) {
    this.checkSpawnBudget(userTag)
    this.counters.spawns++
    const outcome = await this.runner.run({
      cliCommand: 'sync',
      args: this.catalog.toCliArgs({ ...shared, commands: cliCommands.join(',') }),
      username: creds.username,
      password: creds.password,
      timeoutMs: this.config.cliTimeoutMs * 2,
    })
    try {
      const top = await this.normalizeOutcome(syncEntry, outcome, userTag)
      if (top.kind === 'error') return { error: top.error }
      const byCommand = new Map()
      for (const raw of parseSyncEntries(outcome.envelope.structured_data)) {
        const shaped = this.shapeEnvelope({ output: raw.output, structured_data: raw.structured_data }, outcome.scrub)
        const inv = this.classify(
          { ...shaped, version: top.version, regNo: top.regNo, storedFiles: [], cliDurationMs: top.cliDurationMs },
          { error: raw.error },
          ''
        )
        byCommand.set(raw.command, inv)
      }
      return { byCommand }
    } finally {
      await outcome.cleanup()
    }
  }

  syncEntry(entry, inv) {
    // For commands whose first selection table *is* the data (da subjects), a pending
    // selection is a successful snapshot.
    const asData = inv.kind === 'selection' && entry.selectionIsData
    if (inv.kind === 'ok' || asData) {
      const result = { ...this.baseResult(entry, inv, null), success: true, status: asData ? 'needs_selection' : 'completed', message: `Fetched ${entry.title} from VTOP.` }
      return {
        command: entry.command,
        success: true,
        cached: Boolean(inv.cached),
        result,
        output: result.output,
        structured_data: result.structured_data,
      }
    }
    const error = inv.kind === 'selection' ? { kind: 'invalid_input', message: 'This command needs a selection; run it individually.' } : inv.error
    return {
      command: entry.command,
      success: false,
      cached: false,
      error: error.message,
      errorKind: error.kind,
      retryable: kindInfo(error.kind).retryable,
    }
  }

  stats() {
    return {
      ...this.counters,
      cache: this.cache.stats(),
      singleFlight: this.flight.stats(),
      scheduler: this.scheduler.stats(),
      files: this.files.stats(),
    }
  }
}

// ---------------------------------------------------------------- small helpers
function toProxyError(error, logger) {
  if (error instanceof ProxyError || error instanceof ValidationError) return error
  logger.error('[service] unexpected error:', error)
  return new ProxyError('internal_error')
}

function humanize(param) {
  return param.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase())
}

function describeSelection(selection, options) {
  if (selection === '0') return 'All materials'
  if (!options) return `Items ${selection}`
  const wanted = new Set()
  for (const part of String(selection).split(',')) {
    const [a, b] = part.split('-').map(n => parseInt(n, 10))
    for (let i = a; i <= (b || a); i++) wanted.add(i)
  }
  const labels = options.filter(option => wanted.has(option.index)).map(option => option.label)
  return labels.length > 3 ? `${labels.slice(0, 3).join(', ')} +${labels.length - 3} more` : labels.join(', ') || `Items ${selection}`
}

/** "CC1 (Hostel Office), CC2 (Academic Block)" -> options with id = value. */
function parseFormOptions(text) {
  return [...String(text).matchAll(/\s*([^,(]+?)(?:\s*\(([^)]*)\))?\s*(?:,|$)/g)]
    .filter(m => m[1] && m[1].trim())
    .map((m, i) => ({
      id: m[1].trim(),
      index: i + 1,
      label: m[2] ? `${m[2].trim()} (${m[1].trim()})` : m[1].trim(),
      cells: { VALUE: m[1].trim(), LABEL: (m[2] || '').trim() },
      text: `${m[1]} ${m[2] || ''}`,
    }))
}

function resolveInputOption(options, raw) {
  const direct = options.find(option => option.id.toLowerCase() === raw.toLowerCase())
  if (direct) return direct.id
  if (/^\d+$/.test(raw)) {
    const byIndex = options.find(option => option.index === parseInt(raw, 10))
    if (byIndex) return byIndex.id
  }
  const matched = matchOne(options, raw)
  if (matched.option) return matched.option.id
  throw new ValidationError(`"${raw}" is not one of: ${options.map(o => o.id).join(', ')}`, 'choice')
}

function confirmationStep(entry, flags) {
  const summary = Object.fromEntries(Object.entries(flags).filter(([key]) => key !== 'apply'))
  const lines = Object.entries(summary).map(([key, value]) => `${humanize(key)}: ${value}`)
  return {
    id: 'apply',
    kind: 'confirm',
    label: `Submit ${entry.command} application`,
    prompt: `This will submit a ${entry.command} application on VTOP${lines.length ? ` with:\n${lines.join('\n')}` : ''}.\nConfirm to proceed.`,
    summary,
    options: [
      { id: 'confirm', index: 1, label: 'Confirm and submit' },
      { id: 'cancel', index: 2, label: 'Cancel' },
    ],
  }
}

module.exports = { VtopService, parseFormOptions, LIST_SEMESTERS }
