const { execSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const NEW_URL = process.env.NEWDATABASE_URL
if (!NEW_URL) {
  console.error('Error: NEWDATABASE_URL must be set in .env')
  process.exit(1)
}

const PRISMA_SCHEMA =
  process.env.PRISMA_SCHEMA || path.resolve(__dirname, '../prisma/schema.prisma')
const CSV_DIR = process.env.CSV_DIR || path.resolve(__dirname, './dump')
const CRDB_SCHEMA = process.env.CRDB_SCHEMA || 'public'
const TRUNCATE = process.env.TRUNCATE_BEFORE_IMPORT === '1'
const DRY_RUN = process.env.DRY_RUN === '1'

const PSQL_ENV = { ...process.env, PGCLIENTENCODING: 'UTF8' }
const qid = s => `"${s}"`
const qpath = p => `'${p}'`

function runPSQLFile(url, sql, flags = '-At') {
  const tmp = path.join(
    os.tmpdir(),
    `psql_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`
  )
  fs.writeFileSync(tmp, `\\set ON_ERROR_STOP on\n${sql}`, 'utf8')
  try {
    const cmd = `psql "${url}" ${flags} -f "${tmp}"`
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], env: PSQL_ENV }).toString()
  } catch {
    return ''
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch {}
  }
}
function execPSQLFile(url, sql) {
  const tmp = path.join(
    os.tmpdir(),
    `psql_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`
  )
  fs.writeFileSync(tmp, `\\set ON_ERROR_STOP on\n${sql}`, 'utf8')
  const cmd = `psql "${url}" -f "${tmp}"`
  if (DRY_RUN) {
    console.log('(dry-run) ' + cmd + '\n' + sql)
    try {
      fs.unlinkSync(tmp)
    } catch {}
    return true
  }
  try {
    execSync(cmd, { stdio: 'inherit', env: PSQL_ENV })
    return true
  } catch {
    return false
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch {}
  }
}

function crdbHasTable(table, schema = CRDB_SCHEMA) {
  const sql = `SELECT 1 FROM information_schema.tables WHERE table_schema='${schema}' AND lower(table_name)=lower('${table}') LIMIT 1;`
  return !!runPSQLFile(NEW_URL, sql).trim()
}
function getCrdbExactTableName(table, schema = CRDB_SCHEMA) {
  const sql = `SELECT table_name FROM information_schema.tables WHERE table_schema='${schema}' AND lower(table_name)=lower('${table}') LIMIT 1;`
  const out = runPSQLFile(NEW_URL, sql).trim().split('\n').filter(Boolean)
  return out[0] || null
}
function getCrdbColumns(table, schema = CRDB_SCHEMA) {
  const exact = getCrdbExactTableName(table, schema)
  if (!exact) return []
  const sql = `SELECT column_name FROM information_schema.columns WHERE table_schema='${schema}' AND table_name='${exact}' ORDER BY ordinal_position;`
  return runPSQLFile(NEW_URL, sql)
    .split('\n')
    .map(s => s.trim().replace(/\r$/, ''))
    .filter(Boolean)
}
function resolveCrdbTargetName(table, models) {
  if (crdbHasTable(table)) return getCrdbExactTableName(table)
  const model = models.find(m => m.tableName === table)
  if (model && crdbHasTable(model.modelName)) return getCrdbExactTableName(model.modelName)
  if (crdbHasTable(table.toLowerCase())) return getCrdbExactTableName(table.toLowerCase())
  if (crdbHasTable(table.toUpperCase())) return getCrdbExactTableName(table.toUpperCase())
  return null
}

const src = fs.readFileSync(PRISMA_SCHEMA, 'utf8')
function extractModels(src) {
  const models = []
  let i = 0
  const isWord = ch => /[A-Za-z0-9_]/.test(ch)
  while (i < src.length) {
    const idx = src.indexOf('model', i)
    if (idx === -1) break
    const before = idx ? src[idx - 1] : ' ',
      after = idx + 5 < src.length ? src[idx + 5] : ' '
    if (isWord(before) || !/\s/.test(after)) {
      i = idx + 5
      continue
    }
    let j = idx + 5
    while (/\s/.test(src[j])) j++
    let ns = j
    while (/[A-Za-z0-9_]/.test(src[j])) j++
    const name = src.slice(ns, j)
    while (/\s/.test(src[j])) j++
    if (src[j] !== '{') {
      i = j + 1
      continue
    }
    let k = j,
      d = 0,
      inS = false,
      sC = null,
      inL = false,
      inB = false
    while (k < src.length) {
      const ch = src[k],
        nx = src[k + 1]
      if (inL) {
        if (ch === '\n') inL = false
        k++
        continue
      }
      if (inB) {
        if (ch === '*' && nx === '/') {
          inB = false
          k += 2
          continue
        }
        k++
        continue
      }
      if (inS) {
        if (ch === '\\' && nx) {
          k += 2
          continue
        }
        if (ch === sC) {
          inS = false
          sC = null
        }
        k++
        continue
      }
      if (ch === '/' && nx === '/') {
        inL = true
        k += 2
        continue
      }
      if (ch === '/' && nx === '*') {
        inB = true
        k += 2
        continue
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        inS = true
        sC = ch
        k++
        continue
      }
      if (ch === '{') {
        d++
        k++
        continue
      }
      if (ch === '}') {
        d--
        k++
        if (d === 0) break
        continue
      }
      k++
    }
    const body = src.slice(j + 1, k - 1 + 1)
    models.push({ name, body })
    i = k + 1
  }
  return models
}
const rawModels = extractModels(src)
const models = rawModels.map(({ name, body }) => {
  const tableName = (body.match(/@@map\s*\(\s*"([^"]+)"\s*\)/) || [])[1] || name
  const lines = body
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('//'))
  const fields = []
  for (const line of lines) {
    if (line.startsWith('@@')) continue
    const m = line.match(/^(\w+)\s+([^\s]+)\s*(.*)$/)
    if (!m) continue
    const fieldName = m[1],
      rawType = m[2],
      attrs = m[3] || ''
    const isRelation = attrs.includes('@relation(')
    const colMap = (attrs.match(/@map\s*\(\s*"([^"]+)"\s*\)/) || [])[1] || fieldName
    fields.push({ fieldName, columnName: colMap, rawType, attrs, isRelation })
  }
  return { modelName: name, tableName, fields }
})
function topo(nodes, edges) {
  const indeg = new Map(nodes.map(n => [n, 0])),
    adj = new Map(nodes.map(n => [n, []]))
  for (const [a, b] of edges) {
    adj.get(a).push(b)
    indeg.set(b, (indeg.get(b) || 0) + 1)
  }
  const q = [],
    out = []
  for (const n of nodes) if ((indeg.get(n) || 0) === 0) q.push(n)
  while (q.length) {
    const x = q.shift()
    out.push(x)
    for (const y of adj.get(x)) {
      indeg.set(y, indeg.get(y) - 1)
      if (indeg.get(y) === 0) q.push(y)
    }
  }
  return out.length === nodes.length ? out : nodes
}
const nodes = models.map(m => m.tableName)
const edges = []
for (const m of models)
  for (const f of m.fields)
    if (f.isRelation) {
      const refModel = f.rawType.replace(/\?$/, '').replace(/\[\]$/, '')
      const refTable = (models.find(mm => mm.modelName === refModel) || { tableName: refModel })
        .tableName
      edges.push([refTable, m.tableName])
    }
const importOrder = topo(nodes, edges)
console.log('Import order (parents → children):', importOrder.join(' → '))

const arrayColsByTable = new Map()
const byteColsByTable = new Map()
for (const m of models) {
  const arr = new Set(),
    byt = new Set()
  for (const f of m.fields) {
    const base = f.rawType.replace(/\?$/, '')
    if (base.endsWith('[]')) arr.add(f.columnName.toLowerCase())
    if (base === 'Bytes') byt.add(f.columnName.toLowerCase())
  }
  arrayColsByTable.set(m.tableName, arr)
  byteColsByTable.set(m.tableName, byt)
}

function parseCsvFilename(fn) {
  let m = fn.match(/^([A-Za-z0-9]+)\.([A-Za-z0-9_]+)_(\d+)\.csv$/)
  if (m) return { schema: m[1], table: m[2], part: +m[3] }
  m = fn.match(/^([A-Za-z0-9]+)\.([A-Za-z0-9_]+)\.csv$/)
  if (m) return { schema: m[1], table: m[2], part: 1 }
  m = fn.match(/^([A-Za-z0-9_]+)_(\d+)\.csv$/)
  if (m) return { schema: null, table: m[1], part: +m[2] }
  m = fn.match(/^([A-Za-z0-9_]+)\.csv$/)
  if (m) return { schema: null, table: m[1], part: 1 }
  return null
}
if (!fs.existsSync(CSV_DIR)) {
  console.error('CSV directory not found:', CSV_DIR)
  process.exit(1)
}
const allCsv = fs.readdirSync(CSV_DIR).filter(f => f.toLowerCase().endsWith('.csv'))
const byTable = new Map()
for (const f of allCsv) {
  const meta = parseCsvFilename(f)
  if (!meta) continue
  const arr = byTable.get(meta.table) || []
  arr.push({ file: path.resolve(CSV_DIR, f), part: meta.part })
  byTable.set(meta.table, arr)
}
for (const [t, parts] of byTable) parts.sort((a, b) => a.part - b.part)

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let i = 0
  let inQ = false
  while (i < text.length) {
    const ch = text[i],
      nx = text[i + 1]
    if (inQ) {
      if (ch === '"' && nx === '"') {
        field += '"'
        i += 2
        continue
      }
      if (ch === '"') {
        inQ = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQ = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r') {
      i++
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += ch
    i++
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}
function csvQuote(s) {
  if (s == null) return ''
  const v = String(s)
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
}
function toPgStringArrayLiteral(val) {
  if (val == null || val === '') return '{}'
  const v = String(val).trim()
  if (v === '[]') return '{}'
  if (v.startsWith('{') && v.endsWith('}')) return v
  if (v.startsWith('[') && v.endsWith(']')) {
    try {
      const arr = JSON.parse(v)
      if (Array.isArray(arr)) {
        const elems = arr
          .map(e => `"${String(e).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
          .join(',')
        return `{${elems}}`
      }
    } catch {}
  }
  return `{"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"}`
}
function toPgBytea(val, sourceEncoding) {
  if (val == null || val === '') return '\\x'
  const v = String(val)
  if (/^\\x[0-9a-fA-F]+$/.test(v)) return v
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(v)) {
    try {
      return '\\x' + Buffer.from(v, 'base64').toString('hex')
    } catch {}
  }
  const buf = Buffer.from(v, sourceEncoding || 'latin1')
  return '\\x' + buf.toString('hex')
}

function buildFilteredCsv({ rows, keep, encoding }) {
  const tmp = path.join(os.tmpdir(), `csv_${Date.now()}_${Math.random().toString(36).slice(2)}.csv`)
  const out = fs.createWriteStream(tmp, { encoding: 'utf8' })
  out.write(keep.map(k => csvQuote(k.target)).join(',') + '\n')
  for (const r of rows) {
    const outRow = keep.map(k => {
      let val = k.idx === -1 ? k.fill : (r[k.idx] ?? '')
      if (k.isArray && k.idx !== -1) val = toPgStringArrayLiteral(val)
      if (k.isBytes && k.idx !== -1) val = toPgBytea(val, encoding)
      return csvQuote(val)
    })
    out.write(outRow.join(',') + '\n')
  }
  out.end()
  return new Promise(res => out.on('close', () => res(tmp)))
}

;(async function main() {
  console.log('Import order (parents → children):', importOrder.join(' → '))

  function buildKeepFromHeader(headCells, tableColsMap, arrSet, byteSet) {
    const keep = []
    const have = new Set()
    for (let i = 0; i < headCells.length; i++) {
      const lower = (headCells[i] || '').trim().toLowerCase()
      if (tableColsMap.has(lower)) {
        const exact = tableColsMap.get(lower)
        keep.push({
          header: headCells[i],
          idx: i,
          target: exact,
          isArray: arrSet.has(exact.toLowerCase()),
          isBytes: byteSet.has(exact.toLowerCase()),
        })
        have.add(exact.toLowerCase())
      }
    }
    return { keep, have }
  }

  for (const t of importOrder) {
    const parts = byTable.get(t)
    if (!parts || parts.length === 0) continue

    const target = resolveCrdbTargetName(t, models)
    if (!target) {
      console.warn(`Skip: no matching target table found in Cockroach for '${t}'.`)
      continue
    }

    const tableColsExact = getCrdbColumns(target)
    const tableColsMap = new Map(tableColsExact.map(c => [c.toLowerCase(), c]))
    if (!tableColsExact.length) {
      console.warn(`Skip: target table '${target}' has no columns?`)
      continue
    }

    if (TRUNCATE) execPSQLFile(NEW_URL, `TRUNCATE TABLE ${qid(target)};`)

    const arrSet = arrayColsByTable.get(t) || new Set()
    const byteSet = byteColsByTable.get(t) || new Set()

    for (const { file } of parts) {
      const encoding = [...byteSet].length ? 'latin1' : 'utf8'
      const raw = fs.readFileSync(file, encoding)
      const rows = parseCsv(raw)
      if (!rows.length) continue

      const header = rows[0].map(h => (h ?? '').trim())
      const { keep, have } = buildKeepFromHeader(header, tableColsMap, arrSet, byteSet)
      if (!keep.length) {
        console.warn(`Skip: ${path.basename(file)} has no columns matching ${target}.`)
        continue
      }

      if (t.toLowerCase() === 'messages') {
        const contentIdx = header.findIndex(h => h.toLowerCase() === 'content')
        const hasContentHeader = contentIdx !== -1
        const keepMap = new Map(keep.map(k => [k.target.toLowerCase(), k]))
        const keepContent = keepMap.get('content')

        const data = rows.slice(1)
        const nonEmpty = [],
          empty = []
        for (const r of data) {
          let val = hasContentHeader ? (r[contentIdx] ?? '') : ''
          if (val && val.length) nonEmpty.push(r)
          else empty.push(r)
        }

        if (nonEmpty.length) {
          const filteredA = await buildFilteredCsv({ rows: nonEmpty, keep, encoding })
          const colListA = keep.map(k => qid(k.target)).join(', ')
          console.log(`\n> COPY INTO ${target} (non-empty content) COLUMNS: ${colListA}`)
          if (
            !execPSQLFile(
              NEW_URL,
              `\\COPY ${qid(target)} (${colListA}) FROM ${qpath(filteredA)} CSV HEADER`
            )
          )
            break
          console.log(`Imported ${path.basename(file)} (non-empty subset) -> ${target}`)
          try {
            fs.unlinkSync(filteredA)
          } catch {}
        }

        if (empty.length) {
          const keepNoContent = keep.filter(k => k.target.toLowerCase() !== 'content')
          const filteredB = await buildFilteredCsv({ rows: empty, keep: keepNoContent, encoding })
          const colListB = keepNoContent.map(k => qid(k.target)).join(', ')
          console.log(`\n> COPY INTO ${target} (empty content) COLUMNS: ${colListB}`)
          const setDef = `ALTER TABLE ${qid(target)} ALTER COLUMN "content" SET DEFAULT '';`
          const dropDef = `ALTER TABLE ${qid(target)} ALTER COLUMN "content" DROP DEFAULT;`
          if (!execPSQLFile(NEW_URL, setDef)) break
          const ok = execPSQLFile(
            NEW_URL,
            `\\COPY ${qid(target)} (${colListB}) FROM ${qpath(filteredB)} CSV HEADER`
          )
          execPSQLFile(NEW_URL, dropDef)
          try {
            fs.unlinkSync(filteredB)
          } catch {}
          if (!ok) break
          console.log(`Imported ${path.basename(file)} (empty content subset) -> ${target}`)
        }
        continue
      }

      const filtered = await buildFilteredCsv({ rows: rows.slice(1), keep, encoding })
      const colList = keep.map(k => qid(k.target)).join(', ')
      console.log(`\n> COPY INTO ${target} COLUMNS: ${colList}`)
      const ok = execPSQLFile(
        NEW_URL,
        `\\COPY ${qid(target)} (${colList}) FROM ${qpath(filtered)} CSV HEADER`
      )
      try {
        fs.unlinkSync(filtered)
      } catch {}
      if (!ok) break
      console.log(`Imported ${path.basename(file)} -> ${target}`)
    }
  }

  for (const [t, parts] of byTable) {
    if (importOrder.includes(t)) continue
    const target = resolveCrdbTargetName(t, models) || t
    if (!crdbHasTable(target)) {
      console.warn(`Skip: '${t}' CSVs exist but table '${target}' not found in Cockroach.`)
      continue
    }
    const tableColsExact = getCrdbColumns(target)
    const tableColsMap = new Map(tableColsExact.map(c => [c.toLowerCase(), c]))
    const arrSet = arrayColsByTable.get(t) || new Set()
    const byteSet = byteColsByTable.get(t) || new Set()

    for (const { file } of parts) {
      const raw = fs.readFileSync(file, [...byteSet].length ? 'latin1' : 'utf8')
      const rows = parseCsv(raw)
      if (!rows.length) continue
      const header = rows[0].map(h => (h ?? '').trim())
      const keep = []
      for (let i = 0; i < header.length; i++) {
        const lower = (header[i] || '').toLowerCase()
        if (tableColsMap.has(lower)) {
          const exact = tableColsMap.get(lower)
          keep.push({
            header: header[i],
            idx: i,
            target: exact,
            isArray: arrSet.has(exact.toLowerCase()),
            isBytes: byteSet.has(exact.toLowerCase()),
          })
        }
      }
      if (!keep.length) {
        console.warn(`Skip: ${path.basename(file)} has no usable columns for ${target}.`)
        continue
      }
      const filtered = await buildFilteredCsv({
        rows: rows.slice(1),
        keep,
        encoding: [...byteSet].length ? 'latin1' : 'utf8',
      })
      const colList = keep.map(k => qid(k.target)).join(', ')
      console.log(`\n> COPY INTO ${target} COLUMNS: ${colList}`)
      const ok = execPSQLFile(
        NEW_URL,
        `\\COPY ${qid(target)} (${colList}) FROM ${qpath(filtered)} CSV HEADER`
      )
      try {
        fs.unlinkSync(filtered)
      } catch {}
      if (!ok) break
      console.log(`Imported ${path.basename(file)} -> ${target}`)
    }
  }

  console.log('\nAll done.')
})()
