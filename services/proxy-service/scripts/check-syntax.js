#!/usr/bin/env node
'use strict'

// `node --check` every JS file in the service (excluding node_modules).
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const files = []
;(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(c|m)?js$/.test(entry.name)) files.push(full)
  }
})(root)

let failed = 0
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  } catch (error) {
    failed++
    process.stderr.write(`${path.relative(root, file)}\n${error.stderr}\n`)
  }
}
console.log(`node --check: ${files.length - failed}/${files.length} files OK`)
process.exit(failed ? 1 : 0)
