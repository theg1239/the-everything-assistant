'use strict'

/**
 * Legacy course-page interactive API (/vtop-interactive, /vtop-interactive-continue and the
 * course-page-interactive MCP tools), kept for existing clients. All of the actual work is the
 * generic workflow engine (src/service.js); this module only translates request/response shapes:
 *
 *  - request flags semesterQuery/courseQuery/facultyQuery/materialQuery become selection hints,
 *    materialSelection becomes `materials`, `step` is advisory (the engine knows what's pending)
 *  - `sessionData` is now the opaque continuation token
 *  - responses keep { step, options[{number, description, text}], nextStep, sessionData,
 *    interactiveState, completed, downloadInfo{servedFiles[...]} } and add the new fields
 */

const STEP_NAMES = { semester: 'semester', course: 'course', faculty: 'faculty', materials: 'materials', confirm: 'confirm' }
const NEXT_STEP = { semester: 'course', course: 'faculty', faculty: 'materials', materials: 'download' }

function toLegacy(result) {
  const pending = typeof result.status === 'string' && result.status.startsWith('needs_')
  const stepName = pending && result.step ? STEP_NAMES[result.step.id] || result.step.id : 'complete'
  const files = Array.isArray(result.files) ? result.files : []
  const options = pending && result.step && Array.isArray(result.step.options)
    ? result.step.options.map(option => ({
        number: option.index,
        id: option.id,
        description: option.description ? `${option.label} - ${option.description}` : option.label,
        text: option.label,
        values: option.values,
      }))
    : undefined
  return {
    ...result,
    type: 'interactive-course-page',
    step: stepName,
    stepDetails: result.step,
    options,
    prompt: pending && result.step ? result.step.prompt : undefined,
    nextStep: pending ? NEXT_STEP[stepName] || 'complete' : 'complete',
    sessionData: result.continuation,
    interactiveState: pending ? 'waiting_for_input' : result.success ? 'completed' : 'error',
    completed: result.status === 'completed',
    canResume: pending,
    downloadInfo: {
      filesDownloaded: files.length,
      totalFiles: files.length,
      servedFiles: files.map(file => ({ name: file.name, downloadUrl: file.url, size: file.size, expiry: file.expiresAt })),
      files: files.map(file => ({ name: file.path || file.name, status: 'completed' })),
      bundle: result.bundle,
      errors: [],
    },
  }
}

/** Legacy request flags -> { flags, select } for the engine. */
function splitLegacyFlags(raw = {}) {
  const flags = {}
  const select = {}
  for (const [key, value] of Object.entries(raw || {})) {
    if (value === undefined || value === null || value === '') continue
    switch (key) {
      case 'semesterQuery':
        select.semester = String(value)
        break
      case 'courseQuery':
        select.course = String(value)
        break
      case 'facultyQuery':
        select.faculty = String(value)
        break
      case 'materialQuery':
        select.materials = String(value)
        break
      case 'materialSelection':
        flags.materials = value
        break
      case 'fuzzyIndex':
      case 'interactiveStep':
      case 'debug':
        break
      default:
        flags[key] = value
    }
  }
  return { flags, select }
}

/** POST /vtop-interactive and the course-page-interactive MCP tool. */
async function startLegacyWorkflow(service, { username, password, flags, sessionData }) {
  const split = splitLegacyFlags(flags)
  // Pre-token clients resumed with a JSON blob of flags; honour them (they're re-validated).
  if (typeof sessionData === 'string' && sessionData.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(sessionData)
      Object.assign(split.flags, splitLegacyFlags(parsed.flags || {}).flags, split.flags)
    } catch {}
  }
  const result = await service.execute({ command: 'course-page', username, password, flags: split.flags, select: split.select })
  return toLegacy(result)
}

/** POST /vtop-interactive-continue and the course-page-interactive-continue MCP tool. */
async function continueLegacyWorkflow(service, { username, password, sessionData, selection, step }) {
  if (typeof sessionData === 'string' && sessionData.startsWith('v1.')) {
    const result = await service.continueWorkflow({ continuation: sessionData, choice: selection, username, password })
    return toLegacy(result)
  }
  // Pre-token JSON session: re-run with the selection applied as a flag.
  let parsed = {}
  try {
    parsed = JSON.parse(sessionData || '{}')
  } catch {}
  const flags = { ...splitLegacyFlags(parsed.flags || {}).flags }
  const param = step === 'materials' ? 'materials' : step
  if (param) flags[param] = selection
  const result = await service.execute({
    command: 'course-page',
    username: username || parsed.username,
    password,
    flags,
  })
  return toLegacy(result)
}

module.exports = { toLegacy, splitLegacyFlags, startLegacyWorkflow, continueLegacyWorkflow }
