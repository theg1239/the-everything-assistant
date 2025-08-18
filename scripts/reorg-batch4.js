const fs = require('fs');
const cp = require('child_process');
const path = require('path');

// Conservative Batch 4 mapping: reorganize lib/ into clearer feature folders and tidy a few components
const mappings = [
  // lib -> lib/ai
  ['lib/rate-limited-ai.ts', 'lib/ai/rate-limited-ai.ts'],
  ['lib/follow-up-generator.ts', 'lib/ai/follow-up-generator.ts'],
  ['lib/knowledge-tools.ts', 'lib/ai/knowledge-tools.ts'],
  ['lib/knowledge-base.ts', 'lib/ai/knowledge-base.ts'],

  // lib -> lib/server
  ['lib/server-vtop-credentials.ts', 'lib/server/server-vtop-credentials.ts'],
  ['lib/api-key-manager.ts', 'lib/server/api-key-manager.ts'],

  // lib -> lib/tools
  ['lib/tools.ts', 'lib/tools/tools.ts'],
  ['lib/sanitize-tools.ts', 'lib/tools/sanitize-tools.ts'],

  // lib -> lib/mfa
  ['lib/mfa.ts', 'lib/mfa/index.ts'],

  // lib -> lib/memory
  ['lib/memory/index.ts', 'lib/memory/index.ts'],

  // components -> tidy: move hub/ to navigation/hub
  ['components/hub', 'components/navigation/hub'],
  // marketing to marketing (keep) - conservative: move upsell-banner already moved earlier
];

function run(cmd) {
  try {
    return cp.execSync(cmd, { stdio: 'pipe' }).toString();
  } catch (e) {
    console.error('cmd failed:', cmd, e.message);
    return null;
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function gitMv(from, to) {
  if (!fs.existsSync(from)) {
    console.log('skip (not found):', from);
    return false;
  }
  ensureDir(path.dirname(to));
  const res = run(`git mv "${from}" "${to}"`);
  if (res === null) {
    fs.renameSync(from, to);
    console.log('fs.rename', from, '->', to);
  } else {
    console.log('git mv', from, '->', to);
  }
  return true;
}

function updateImportSpecifiers() {
  const files = run('git ls-files').split('\n').filter(Boolean);
  const specifierMap = new Map();
  for (const [from, to] of mappings) {
    const fromNoExt = from.replace(/\.(ts|tsx|js|jsx)?$/, '');
    const toNoExt = to.replace(/\.(ts|tsx|js|jsx)?$/, '');
    specifierMap.set(`@/${fromNoExt}`, `@/${toNoExt.replace(/\\/g, '/')}`);
    specifierMap.set(`${fromNoExt}`, `${toNoExt}`);
  }

  let patchedFiles = 0;
  for (const file of files) {
    if (!file.match(/\.(ts|tsx|js|jsx)$/)) continue;
    let s = fs.readFileSync(file, 'utf8');
    let t = s;
    t = t.replace(/(^\s*(?:import|export)[\s\S]*?from\s*)(['"])([^'\"]+)(['"])/gm, (m, pre, q1, spec, q2) => {
      if (specifierMap.has(spec)) {
        const replacement = specifierMap.get(spec);
        return `${pre}${q1}${replacement}${q1}`;
      }
      return m;
    });
    if (t !== s) {
      fs.writeFileSync(file, t, 'utf8');
      patchedFiles++;
      console.log('patched imports in', file);
    }
  }
  console.log('patched files:', patchedFiles);
}

function main() {
  console.log('reorg batch 4 start');
  for (const [from, to] of mappings) {
    gitMv(from, to);
  }
  console.log('moves applied. updating import specifiers (import/export lines only)');
  updateImportSpecifiers();
  console.log('staging and committing...');
  run('git add -A');
  run('git commit -m "chore(reorg-batch4): moves + import updates" || true');
  console.log('running tsc');
  const out = run('npx tsc --noEmit');
  if (out === null) console.log('tsc failed to run'); else console.log(out);
}

main();