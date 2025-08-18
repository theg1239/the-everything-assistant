const fs = require('fs');
const cp = require('child_process');
const path = require('path');

// Conservative Batch 3 mapping: move remaining top-level component files into feature folders
const mappings = [
  ['components/artifact-display.tsx', 'components/artifacts/artifact-display.tsx'],
  ['components/follow-up-suggestions.tsx', 'components/chat/follow-up-suggestions.tsx'],
  ['components/hamburger-button.tsx', 'components/navigation/hamburger-button.tsx'],
  ['components/lanyard.tsx', 'components/shared/lanyard.tsx'],
  ['components/mobile-viewport-fix.tsx', 'components/shared/mobile-viewport-fix.tsx'],
  ['components/multimodal-input.tsx', 'components/controls/multimodal-input.tsx'],
  ['components/paper-search-progress.tsx', 'components/artifacts/paper-search-progress.tsx'],
  ['components/rate-limit-error-display.tsx', 'components/shared/rate-limit-error-display.tsx'],
  ['components/research-preview-modal.tsx', 'components/shared/research-preview-modal.tsx'],
  ['components/responsive-table.tsx', 'components/ui/responsive-table.tsx'],
  ['components/scroll-to-top-button.tsx', 'components/ui/scroll-to-top-button.tsx'],
  ['components/scroll-to-top.tsx', 'components/ui/scroll-to-top.tsx'],
  ['components/suggested-questions.tsx', 'components/chat/suggested-questions.tsx'],
  ['components/timetable-grid.tsx', 'components/shared/timetable-grid.tsx'],
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
    const fromNoExt = from.replace(/\.(ts|tsx|js|jsx)$/, '');
    const toNoExt = to.replace(/\.(ts|tsx|js|jsx)$/, '');
    specifierMap.set(`@/components/${path.basename(fromNoExt)}`, `@/${toNoExt.replace(/\\/g, '/')}`);
    specifierMap.set(`@/${fromNoExt.replace(/\\/g, '/')}`, `@/${toNoExt.replace(/\\/g, '/')}`);
    specifierMap.set(`./${path.basename(fromNoExt)}`, `./${path.basename(toNoExt)}`);
    specifierMap.set(`../${path.basename(fromNoExt)}`, `../${path.basename(toNoExt)}`);
  }

  let patchedFiles = 0;
  for (const file of files) {
    if (!file.match(/\.(ts|tsx|js|jsx)$/)) continue;
    let s = fs.readFileSync(file, 'utf8');
    let t = s;
    // Only modify import/export statements
    t = t.replace(/(^\s*(?:import|export)[\s\S]*?from\s*)(['"]).([^'\"]+)(['"]) /gm, (m, pre, q1, spec, q2) => {
      if (specifierMap.has(spec)) {
        const replacement = specifierMap.get(spec);
        return `${pre}${q1}${replacement}${q1}`;
      }
      return m;
    });
    // Fallback: safer regex (previous scripts used slightly different grouping) - try that too
    if (t === s) {
      t = s.replace(/(^\s*(?:import|export)[\s\S]*?from\s*)(['"])([^'\"]+)(['"])/gm, (m, pre, q1, spec, q2) => {
        if (specifierMap.has(spec)) {
          const replacement = specifierMap.get(spec);
          return `${pre}${q1}${replacement}${q1}`;
        }
        return m;
      });
    }
    if (t !== s) {
      fs.writeFileSync(file, t, 'utf8');
      patchedFiles++;
      console.log('patched imports in', file);
    }
  }
  console.log('patched files:', patchedFiles);
}

function main() {
  console.log('reorg batch 3 start');
  for (const [from, to] of mappings) {
    gitMv(from, to);
  }
  console.log('moves applied. updating import specifiers (import/export lines only)');
  updateImportSpecifiers();
  console.log('staging and committing...');
  run('git add -A');
  run('git commit -m "chore(reorg-batch3): moves + import updates" || true');
  console.log('running tsc');
  const out = run('npx tsc --noEmit');
  if (out === null) console.log('tsc failed to run'); else console.log(out);
}

main();