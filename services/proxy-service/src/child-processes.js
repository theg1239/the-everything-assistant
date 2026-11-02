// Registry of CLI child processes so shutdown can terminate them instead of orphaning them.

const activeChildren = new Set()

const hasExited = child => child.exitCode !== null || child.signalCode !== null

function trackChild(child) {
  activeChildren.add(child)
  child.once('exit', () => activeChildren.delete(child))
  return child
}

function waitForExit(child, timeoutMs) {
  if (hasExited(child)) return Promise.resolve(true)
  return new Promise(resolve => {
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    const timer = setTimeout(() => {
      child.off('exit', onExit)
      resolve(false)
    }, timeoutMs)
    child.once('exit', onExit)
  })
}

function signalChild(child, signal) {
  try {
    child.kill(signal)
  } catch (error) {
    console.warn(`[child-processes] failed to send ${signal} to pid ${child.pid}:`, error.message)
  }
}

/**
 * SIGTERM every running child, wait up to `graceMs`, then SIGKILL any that are still alive and
 * wait up to `killWaitMs` more.
 */
async function terminateActiveChildren({ graceMs = 3000, killWaitMs = 1000 } = {}) {
  const children = [...activeChildren].filter(child => !hasExited(child))
  if (children.length === 0) return { total: 0, forced: 0 }

  children.forEach(child => signalChild(child, 'SIGTERM'))
  const exited = await Promise.all(children.map(child => waitForExit(child, graceMs)))

  const stubborn = children.filter((_, index) => !exited[index])
  stubborn.forEach(child => signalChild(child, 'SIGKILL'))
  await Promise.all(stubborn.map(child => waitForExit(child, killWaitMs)))

  return { total: children.length, forced: stubborn.length }
}

module.exports = {
  trackChild,
  terminateActiveChildren,
}
