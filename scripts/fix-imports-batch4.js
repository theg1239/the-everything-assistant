const fs = require('fs');
const cp = require('child_process');
const path = require('path');

const replacements = new Map([
  // lib -> lib/ai
  ['lib/rate-limited-ai', 'lib/ai/rate-limited-ai'],
  ['./rate-limited-ai', './ai/rate-limited-ai'],
  ['../rate-limited-ai', '../ai/rate-limited-ai'],
  ['lib/follow-up-generator', 'lib/ai/follow-up-generator'],
  ['./follow-up-generator', './ai/follow-up-generator'],
  ['../follow-up-generator', '../ai/follow-up-generator'],
  ['lib/knowledge-tools', 'lib/ai/knowledge-tools'],
  ['./knowledge-tools', './ai/knowledge-tools'],
  ['../knowledge-tools', '../ai/knowledge-tools'],
  ['lib/knowledge-base', 'lib/ai/knowledge-base'],
  ['./knowledge-base', './ai/knowledge-base'],
  ['../knowledge-base', '../ai/knowledge-base'],

  // server
  ['lib/server-vtop-credentials', 'lib/server/server-vtop-credentials'],
  ['./server-vtop-credentials', './server/server-vtop-credentials'],
  ['../server-vtop-credentials', '../server/server-vtop-credentials'],
  ['lib/api-key-manager', 'lib/server/api-key-manager'],
  ['./api-key-manager', './server/api-key-manager'],
  ['../api-key-manager', '../server/api-key-manager'],

  // tools
  ['lib/tools', 'lib/tools/tools'],
  ['./tools', './tools/tools'],
  ['../tools', '../tools/tools'],
  ['lib/sanitize-tools', 'lib/tools/sanitize-tools'],
  ['./sanitize-tools', './tools/sanitize-tools'],
  ['../sanitize-tools', '../tools/sanitize-tools'],

  // mfa
  ['lib/mfa', 'lib/mfa/index'],
  ['./mfa', './mfa/index'],
  ['../mfa', '../mfa/index'],

  // hub moved
  ['@/components/hub', '@/components/navigation/hub'],
  ['@/components/hub/hub', '@/components/navigation/hub/hub'],
  ['./hub', './navigation/hub'],
  ['../hub', '../navigation/hub'],

  // other
  ['lib/ai/prompts', 'lib/ai/prompts'],
]);

function run(cmd) {
  try {
    return cp.execSync(cmd, { stdio: 'pipe' }).toString();
  } catch (e) {
    return null;
  }
}

function applyReplacementsToFile(file, map) {
  const s = fs.readFileSync(file, 'utf8');
  let t = s;
  // Only replace specifiers in import/export lines
  t = t.replace(/(^\s*(?:import|export)[\s\S]*?from\s*)(['"])([^'\"]+)(['"])/gm, (m, pre, q1, spec, q2) => {
    for (const [oldSpec, newSpec] of map) {
      if (spec === oldSpec) {
        return `${pre}${q1}${newSpec}${q1}`;
      }
    }
    return m;
  });
  if (t !== s) {
    fs.writeFileSync(file, t, 'utf8');
    console.log('patched', file);
    return true;
  }
  return false;
}

function main() {
  const files = run('git ls-files').split('\n').filter(Boolean).filter(f => f.match(/\.(ts|tsx|js|jsx)$/));
  let patched = 0;
  for (const file of files) {
    try {
      if (applyReplacementsToFile(file, replacements)) patched++;
    } catch (err) {
      console.error('failed to patch', file, err.message);
    }
  }
  console.log('patched files:', patched);
  run('git add -A');
  run('git commit -m "fix(reorg): patch leftover imports after batch4" || true');
}

main();
