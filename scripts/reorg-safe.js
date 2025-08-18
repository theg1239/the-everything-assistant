const fs = require('fs');
const cp = require('child_process');
const path = require('path');

// Conservative mapping (subset of earlier mapping). Add more mappings as needed.
const mappings = [
  ['components/chat-interface.tsx', 'components/chat/chat-interface.tsx'],
  ['components/chat-header.tsx', 'components/chat/header.tsx'],
  ['components/message-bubble.tsx', 'components/chat/message-bubble.tsx'],
  ['components/virtualized-messages.tsx', 'components/chat/virtualized-messages.tsx'],
  ['components/message-actions.tsx', 'components/chat/message-actions.tsx'],
  ['components/streaming-error-display.tsx', 'components/chat/streaming-error-display.tsx'],
  ['components/dynamic-loading-indicator.tsx', 'components/chat/dynamic-loading-indicator.tsx'],
  ['components/login-form.tsx', 'components/auth/login-form.tsx'],
  ['components/mfa-challenge.tsx', 'components/auth/mfa-challenge.tsx'],
  ['components/mfa-gate.tsx', 'components/auth/mfa-gate.tsx'],
  ['components/memory-management.tsx', 'components/memory/management.tsx'],
  ['components/memory-save.tsx', 'components/memory/save.tsx'],
  ['components/vtop-settings.tsx', 'components/vtop/settings.tsx'],
  ['components/vtop-tool-handler.tsx', 'components/vtop/tool-handler.tsx'],
  ['components/vtop-credentials-dialog.tsx', 'components/vtop/credentials-dialog.tsx'],
  ['lib/prompts.ts', 'lib/ai/prompts.ts'],
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
    // fallback
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
    const fromNoExt = from.replace(/\.(ts|tsx|js|jsx)$/, '');
    const toNoExt = to.replace(/\.(ts|tsx|js|jsx)$/, '');
    // prefer absolute alias starting with @/components/
    const fromBasename = path.basename(fromNoExt);
    // e.g. '@/components/chat-interface' -> '@/components/chat/chat-interface'
    specifierMap.set(`@/components/${fromBasename}`, `@/${toNoExt.replace(/\\\\/g, '/')}`);
    specifierMap.set(`lib/${path.basename(fromNoExt)}`, `${toNoExt}`);
  }

  let patchedFiles = 0;
  for (const file of files) {
    if (!file.match(/\.(ts|tsx|js|jsx)$/)) continue;
    let s = fs.readFileSync(file, 'utf8');
    let t = s;
    // Only modify import/export statements
    t = t.replace(/(^\s*(?:import|export)[\s\S]*?from\s*)(['"])([^'"]+)(['"])/gm, (m, pre, q1, spec, q2) => {
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
  console.log('safe reorg start');
  for (const [from, to] of mappings) {
    gitMv(from, to);
  }
  console.log('moves applied. updating import specifiers (import/export lines only)');
  updateImportSpecifiers();
  console.log('staging and committing...');
  run('git add -A');
  run('git commit -m "chore(reorg-safe): moves + import updates" || true');
  console.log('running tsc');
  const out = run('npx tsc --noEmit');
  if (out === null) console.log('tsc failed to run'); else console.log(out);
}

main();
