const metrics = {
  commands: {},
  lastHealthCheck: null,
}

function record(command, status) {
  if (!metrics.commands[command]) {
    metrics.commands[command] = { count: 0, failures: 0, lastRun: null }
  }
  const entry = metrics.commands[command]
  entry.count += 1
  entry.lastRun = new Date().toISOString()
  if (status === 'failure') {
    entry.failures += 1
  }
}

function snapshot() {
  return {
    ...metrics,
    commands: metrics.commands,
  }
}

module.exports = {
  record,
  snapshot,
}
