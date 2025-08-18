const fs = require('fs')
const cp = require('child_process')
const path = require('path')

// Map from shim module (without extension) -> canonical module
const mapping = new Map([
  ['lib/rate-limited-ai', 'lib/ai/rate-limited-ai'],
  ['lib/follow-up-generator', 'lib/ai/follow-up-generator'],
  ['lib/knowledge-tools', 'lib/ai/knowledge-tools'],
  ['lib/knowledge-base', 'lib/ai/knowledge-base'],
  ['lib/server-vtop-credentials', 'lib/server/server-vtop-credentials'],
  ['lib/api-key-manager', 'lib/server/api-key-manager'],
  ['lib/tools', 'lib/tools/tools'],
  ['lib/sanitize-tools', 'lib/tools/sanitize-tools'],
  ['lib/mfa', 'lib/mfa/index'],
])

function run(cmd) {
  try { return cp.execSync(cmd, { stdio: 'pipe' }).toString() } catch (e) { return null }
}

function patchFile(file) {
  let s = fs.readFileSync(file, 'utf8')
  let t = s
  t = t.replace(/(^\s*(?:import|export)[\s\S]*?from\s*)(['"])([^'\"]+)(['"])/gm, (m, pre, q, spec, q2) => {
    if (mapping.has(spec)) return `${pre}${q}${mapping.get(spec)}${q}`
    // also handle relative references to the shim files (./rate-limited-ai etc.)
    const rel = spec.replace(/^\.\/?/, '')
    for (const [shim, canon] of mapping.entries()) {
      if (rel === shim || rel === path.basename(shim)) {
        // compute a relative path from current file
        const fileDir = path.dirname(file)
        const relPath = path.relative(fileDir, path.resolve(process.cwd(), canon)).replace(/\\/g, '/')
        const pref = relPath.startsWith('.') ? relPath : './' + relPath
        return `${pre}${q}${pref}${q}`
      }
    }
    return m
  })
  if (t !== s) {
    fs.writeFileSync(file, t, 'utf8')
    console.log('patched', file)
    return true
  }
  return false
}

function main() {
  const files = run('git ls-files').split('\n').filter(Boolean).filter(f => f.match(/\.(ts|tsx|js|jsx)$/))
  let patched = 0
  for (const f of files) {
    try { if (patchFile(f)) patched++ } catch (e) { console.error('err patch', f, e.message) }
  }
  console.log('patched files:', patched)

  // remove shim files now
  const shimFiles = Array.from(mapping.keys()).map(s => s + '.ts')
  for (const sf of shimFiles) {
    const p = path.resolve(process.cwd(), sf)
    if (fs.existsSync(p)) {
      fs.unlinkSync(p)
      console.log('removed shim file', sf)
    }
  }

  run('git add -A')
  // PowerShell-safe single command (don't use || which isn't available)
  run('git commit -m "chore(reorg): remove shims and update imports to canonical lib paths"')
  console.log('running tsc')
  const out = run('npx tsc --noEmit')
  if (out === null) console.log('tsc failed')
  else console.log(out)
}

main()
