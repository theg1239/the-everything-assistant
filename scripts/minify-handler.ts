import path from 'node:path'
import { promises as fs } from 'node:fs'
import { build } from 'esbuild'

const baseDir = path.resolve('.open-next')
const handlerRelative = path.join('server-functions', 'default', 'handler.mjs')
const handlerPath = path.join(baseDir, handlerRelative)
const minifiedPath = handlerPath.replace(/\.mjs$/, '.min.mjs')
const workerPath = path.join(baseDir, 'worker.js')
const handlerImport = './server-functions/default/handler.mjs'
const minifiedImport = './server-functions/default/handler.min.mjs'

async function ensureBuilt() {
  try {
    await fs.access(handlerPath)
  } catch (error) {
    throw new Error('Run `opennextjs-cloudflare build` before minifying the handler.')
  }
}

async function replaceWorkerImport() {
  const workerSource = await fs.readFile(workerPath, 'utf8')
  if (!workerSource.includes(handlerImport)) {
    throw new Error(`Expected ${handlerImport} in ${workerPath}, but it was not found.`)
  }

  const rewritten = workerSource.replace(handlerImport, minifiedImport)
  if (rewritten === workerSource) {
    throw new Error('Failed to rewrite the worker import path.')
  }

  await fs.writeFile(workerPath, rewritten, 'utf8')
}

async function minifyHandler() {
  await build({
    entryPoints: [handlerPath],
    outfile: minifiedPath,
    bundle: false,
    format: 'esm',
    minify: true,
    target: ['es2022'],
    legalComments: 'none',
    charset: 'utf8',
    sourcemap: false,
    platform: 'neutral',
    absWorkingDir: baseDir,
  })
}

async function main() {
  await ensureBuilt()
  await minifyHandler()
  await replaceWorkerImport()
  console.log('Cloudflare handler minified and worker import updated.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
