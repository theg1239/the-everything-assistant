const fs = require('fs');
const cp = require('child_process');
const path = require('path');

const mappings = [
  // controls and ui helpers
  ['components/tool-call-display.tsx', 'components/controls/tool-call-display.tsx'],
  ['components/tools-dropdown.tsx', 'components/controls/tools-dropdown.tsx'],
  ['components/broadcast-dialog.tsx', 'components/controls/broadcast-dialog.tsx'],
  ['components/global-broadcast-dialog.tsx', 'components/controls/global-broadcast-dialog.tsx'],
  ['components/optimized-markdown.tsx', 'components/ui/optimized-markdown.tsx'],
  ['components/pdf-viewer.tsx', 'components/ui/pdf-viewer.tsx'],
  ['components/responsive-card.tsx', 'components/ui/responsive-card.tsx'],

  // artifacts
  ['components/ffcs-artifact.tsx', 'components/artifacts/ffcs-artifact.tsx'],
  ['components/get-course-info-artifact.tsx', 'components/artifacts/get-course-info-artifact.tsx'],
  ['components/papers-index-artifact.tsx', 'components/artifacts/papers-index-artifact.tsx'],
  ['components/papers-qa-artifact.tsx', 'components/artifacts/papers-qa-artifact.tsx'],
  ['components/question-patterns-artifact.tsx', 'components/artifacts/question-patterns-artifact.tsx'],

  // backgrounds
  ['components/aurora-background.tsx', 'components/backgrounds/aurora-background.tsx'],
  ['components/aurora.tsx', 'components/backgrounds/aurora.tsx'],
  ['components/beams.tsx', 'components/backgrounds/beams.tsx'],
  ['components/custom-background.tsx', 'components/backgrounds/custom-background.tsx'],
  ['components/dither.tsx', 'components/backgrounds/dither.tsx'],

  // onboarding, performance, pwa
  ['components/onboarding-dialog.tsx', 'components/onboarding/onboarding-dialog.tsx'],
  ['components/performance-monitor.tsx', 'components/performance/performance-monitor.tsx'],
  ['components/pwa-install-dialog.tsx', 'components/pwa/pwa-install-dialog.tsx'],

  // settings/navigation/marketing/graphics/shared
  ['components/settings-dialog.tsx', 'components/settings/settings-dialog.tsx'],
  ['components/sidebar-wrapper.tsx', 'components/navigation/sidebar-wrapper.tsx'],
  ['components/sidebar.tsx', 'components/navigation/sidebar.tsx'],
  ['components/upsell-banner.tsx', 'components/marketing/upsell-banner.tsx'],
  ['components/canvas.tsx', 'components/graphics/canvas.tsx'],
  ['components/feedback-section.tsx', 'components/shared/feedback-section.tsx'],

  // move artifacts directory files if present (conservative)
  ['components/artifacts/ffcs-artifact.tsx', 'components/artifacts/ffcs-artifact.tsx'],
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
    specifierMap.set(`@/components/${path.basename(fromNoExt)}`, `@/${toNoExt.replace(/\\\\/g, '/')}`);
    specifierMap.set(`@/${fromNoExt.replace(/\\\\/g, '/')}`, `@/${toNoExt.replace(/\\\\/g, '/')}`);
    specifierMap.set(`./${path.basename(fromNoExt)}`, `./${path.basename(toNoExt)}`);
    specifierMap.set(`../${path.basename(fromNoExt)}`, `../${path.basename(toNoExt)}`);
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
  console.log('reorg batch 2 start');
  for (const [from, to] of mappings) {
    gitMv(from, to);
  }
  console.log('moves applied. updating import specifiers (import/export lines only)');
  updateImportSpecifiers();
  console.log('staging and committing...');
  run('git add -A');
  run('git commit -m "chore(reorg-batch2): moves + import updates" || true');
  console.log('running tsc');
  const out = run('npx tsc --noEmit');
  if (out === null) console.log('tsc failed to run'); else console.log(out);
}

main();
