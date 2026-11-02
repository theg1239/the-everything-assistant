import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const DUMP_PATH = path.resolve(__dirname, '..', 'public', 'ffcs', 'dump')
const OUTPUT_DIR = path.resolve(__dirname, '..', 'public', 'ffcs')

const SCHOOL_KEY_MAP: Record<string, string> = {
  SMEC: 'smec',
  SCORE: 'score',
  SCOPE: 'scope',
  SELECT: 'select',
  SBST: 'sbst',
  SCHEME: 'scheme',
  SENSE: 'sense',
  SCE: 'sce',
}

function readDump(): string {
  if (!fs.existsSync(DUMP_PATH)) {
    throw new Error(`dump file not found at ${DUMP_PATH}`)
  }
  return fs.readFileSync(DUMP_PATH, 'utf8')
}

function extractObjectLiteral(raw: string): string {
  const start = raw.indexOf('C={')
  if (start === -1) {
    throw new Error('Could not find "C={" pattern in dump')
  }
  let braceCount = 0
  let endIndex = -1
  for (let i = start + 2; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '{') braceCount++
    if (ch === '}') {
      braceCount--
      if (braceCount === 0) {
        endIndex = i + 1
        break
      }
    }
  }
  if (endIndex === -1) {
    throw new Error('Failed to match closing brace for object literal')
  }
  return raw.slice(start + 2, endIndex)
}

function evalObjectLiteral(objLiteral: string): unknown {
  const script = new vm.Script(`(${objLiteral})`)
  return script.runInNewContext({})
}

function writePerSchool(obj: unknown): void {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('Dump object literal did not evaluate to an object')
  }
  for (const [dumpKey, data] of Object.entries(obj)) {
    const schoolId = SCHOOL_KEY_MAP[dumpKey] || dumpKey.toLowerCase()
    const outPath = path.join(OUTPUT_DIR, `${schoolId}.json`)
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8')
    console.log(`Wrote ${outPath}`)
  }
}

function main() {
  try {
    const raw = readDump()
    const objLiteral = extractObjectLiteral(raw)
    const parsed = evalObjectLiteral(objLiteral)
    writePerSchool(parsed)
  } catch (err) {
    console.error('Extraction failed:', err)
    process.exit(1)
  }
}

main()
