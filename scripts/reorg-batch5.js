const fs = require('fs')
const cp = require('child_process')
const path = require('path')

// This script creates small passthrough index files for locations that were expected by imports
// but moved in prior batches. It also patches import specifiers similarly to previous scripts.

const shims = [
  { path: 'lib/rate-limited-ai.ts', target: 'lib/ai/rate-limited-ai.ts' },
  { path: 'lib/follow-up-generator.ts', target: 'lib/ai/follow-up-generator.ts' },
  { path: 'lib/knowledge-tools.ts', target: 'lib/ai/knowledge-tools.ts' },
  { path: 'lib/knowledge-base.ts', target: 'lib/ai/knowledge-base.ts' },
  { path: 'lib/server-vtop-credentials.ts', target: 'lib/server/server-vtop-credentials.ts' },
  { path: 'lib/api-key-manager.ts', target: 'lib/server/api-key-manager.ts' },
  { path: 'lib/tools.ts', target: 'lib/tools/tools.ts' },
  { path: 'lib/sanitize-tools.ts', target: 'lib/tools/sanitize-tools.ts' },
  { path: 'lib/mfa.ts', target: 'lib/mfa/index.ts' },
]

function writeShim(p, target) {
  if (fs.existsSync(p)) return false
  const rel = './' + path.relative(path.dirname(p), target).replace(/\\/g, '/')
  const content = `export * from '${rel}'\nexport { default } from '${rel}'\n`
  fs.writeFileSync(p, content, 'utf8')
  console.log('wrote shim', p, '->', target)
  return true
}

function run(cmd) {
  try {
    return cp.execSync(cmd, { stdio: 'pipe' }).toString()
  } catch (e) {
    return null
  }
}

function main() {
  let created = 0
  for (const s of shims) {
    try {
      if (writeShim(s.path, s.target)) created++
    } catch (err) {
      console.error('failed shim', s.path, err.message)
    }
  }
  console.log('shims created:', created)
  run('git add -A')
  run('git commit -m "chore(reorg-batch5): add passthrough shims for moved lib files" || true')
  console.log('running tsc')
  const out = run('npx tsc --noEmit')
  if (out === null) console.log('tsc failed'); else console.log(out)
}

main()
