'use strict'

/**
 * Legacy course-page interactive API (/vtop-interactive, /vtop-interactive-continue and the
 * course-page-interactive MCP tools), kept for existing clients. All of the actual work is the
 * generic workflow engine (src/service.js); this module only translates request/response shapes:
 *
 *  - request flags are the exact course-page flags (option indices); `materialSelection` is an
 *    alias for `materials`; `step` is advisory (the engine knows what's pending)
 *  - `sessionData` is the opaque continuation token; `selection` must be option id(s) exactly as
 *    for /vtop/continue (legacy "0" = all materials)
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

/** Legacy request flags -> exact engine flags. */
function legacyFlags(raw = {}) {
  const flags = {}
  for (const [key, value] of Object.entries(raw || {})) {
    if (value === undefined || value === null || value === '') continue
    if (key === 'materialSelection') flags.materials = value
    else flags[key] = value
  }
  return flags
}

/** POST /vtop-interactive and the course-page-interactive MCP tool. */
async function startLegacyWorkflow(service, { username, password, flags }) {
  const result = await service.execute({ command: 'course-page', username, password, flags: legacyFlags(flags) })
  return toLegacy(result)
}

/** POST /vtop-interactive-continue and the course-page-interactive-continue MCP tool. */
async function continueLegacyWorkflow(service, { username, password, sessionData, selection }) {
  // cli-top's --materials grammar used "0" for everything; "0" is never an option id.
  const choice = selection === '0' || selection === 0 ? 'all' : selection
  const result = await service.continueWorkflow({ continuation: sessionData, choice, username, password })
  return toLegacy(result)
}

module.exports = { toLegacy, legacyFlags, startLegacyWorkflow, continueLegacyWorkflow }
