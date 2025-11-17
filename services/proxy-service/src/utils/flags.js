const { COMMAND_MAPPING, INTERACTIVE_COMMANDS } = require('../config')

function normalizeFlagsForCommand(command, flags = {}) {
  const sanitizedFlags = { ...(flags || {}) }
  const mappedCommand = COMMAND_MAPPING().get(command) || command
  const interactiveConfig = INTERACTIVE_COMMANDS().get(mappedCommand)

  if (interactiveConfig) {
    if (interactiveConfig.requiresCourse && !sanitizedFlags.course) {
      sanitizedFlags.course = 1
    }
    if (interactiveConfig.requiresFaculty && !sanitizedFlags.faculty) {
      sanitizedFlags.faculty = 1
    }
    if (interactiveConfig.requiresClassGroup && !sanitizedFlags.classGroup) {
      sanitizedFlags.classGroup = 1
    }
  }

  return {
    sanitizedFlags,
    mappedCommand,
    interactiveConfig,
  }
}

module.exports = {
  normalizeFlagsForCommand,
}
