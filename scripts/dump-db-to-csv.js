#!/usr/bin/env node
/*
  Dump every user table in the database to CSV files.
  - Reads connection string from DATABASE_URL in .env
  - Outputs to scripts/dump/<schema>.<table>.csv
  - Uses CommonJS (require) and const
*/

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const dotenv = require('dotenv')

// Load environment variables from .env at repository root
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set in .env')
  process.exit(1)
}

const OUTPUT_DIR = path.resolve(__dirname, 'dump')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    try {
      // JSON encode objects/arrays
      value = JSON.stringify(value)
    } catch (e) {
      value = String(value)
    }
  }
  let str = String(value)
  const needsQuotes = /[",\n\r]|^\s|\s$/.test(str)
  if (needsQuotes) {
    str = '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

async function getTables(client) {
  const sql = `
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema', 'crdb_internal')
      AND table_schema NOT LIKE 'pg_%'
    ORDER BY table_schema, table_name
  `
  const res = await client.query(sql)
  return res.rows
}

async function getColumns(client, schema, table) {
  const sql = `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `
  const res = await client.query(sql, [schema, table])
  return res.rows.map(r => r.column_name)
}

async function dumpTable(client, schema, table) {
  const columns = await getColumns(client, schema, table)
  const qualified = `"${schema}"."${table}"`
  const filename = `${schema}.${table}.csv`
  const outPath = path.join(OUTPUT_DIR, filename)

  console.log(`→ Dumping ${qualified} -> ${path.relative(process.cwd(), outPath)}`)

  const query = `SELECT * FROM ${qualified}`
  const res = await client.query(query)

  const header = columns.join(',') + '\n'
  const lines = [header]

  for (const row of res.rows) {
    const values = columns.map(col => csvEscape(row[col]))
    lines.push(values.join(',') + '\n')
  }

  fs.writeFileSync(outPath, lines.join(''), 'utf8')
  console.log(`  ✔ Wrote ${res.rowCount} rows`)
}

async function main() {
  ensureDir(OUTPUT_DIR)
  const client = new Client({ connectionString: DATABASE_URL })
  try {
    await client.connect()
    console.log('Connected to database')

    const tables = await getTables(client)
    if (tables.length === 0) {
      console.log('No user tables found to dump.')
      return
    }

    for (const { table_schema, table_name } of tables) {
      try {
        await dumpTable(client, table_schema, table_name)
      } catch (err) {
        console.error(`  ✖ Failed to dump ${table_schema}.${table_name}:`, err.message)
      }
    }

    console.log('All done. CSVs saved to:', path.relative(process.cwd(), OUTPUT_DIR))
  } catch (err) {
    console.error('Database dump failed:', err)
    process.exitCode = 1
  } finally {
    await client.end().catch(() => {})
  }
}

if (require.main === module) {
  main()
}
