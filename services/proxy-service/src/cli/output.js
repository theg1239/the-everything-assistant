'use strict'

/**
 * cli-top mutes table printing in proxy mode (helpers.PrintTable returns after capturing a
 * snapshot when CLI_TOP_PROXY_MODE=1), so `output` only carries the non-table lines. Existing
 * consumers (hub text parsers, the chat card) read tables from `data`/`output` text, so we render
 * the captured tables back into cli-top's own box format.
 */
function renderTable(table) {
  const headers = table.headers || []
  const rows = table.rows || []
  if (!headers.length) return ''
  const width = headers.length
  const all = [headers, ...rows.map(row => Array.from({ length: width }, (_, i) => String(row[i] ?? '')))]
  const clean = all.map(row => row.map(cell => String(cell).replace(/\s*\n\s*/g, ' ')))
  const widths = headers.map((_, col) => Math.max(...clean.map(row => [...row[col]].length)))
  const pad = (text, w) => text + ' '.repeat(Math.max(0, w - [...text].length))
  const line = row => '   ' + row.map((cell, col) => ` ${pad(cell, widths[col])} `).join('│')
  const separator = '    ' + widths.map(w => '─'.repeat(w)).join('─┼─')
  return [line(clean[0]), separator, ...clean.slice(1).map(line)].join('\n')
}

const PROGRESS_NOISE = /^(Downloading materials\.\.\.|Retrying failed downloads\.\.\.)|\|[█ ]+\|/

/** Splits cli-top messages into user-facing lines and extracted links. */
function digestMessages(messages, scrub) {
  const lines = []
  const links = []
  let pendingLabel = null
  for (const raw of messages || []) {
    const message = scrub(String(raw)).trim()
    if (!message || PROGRESS_NOISE.test(message)) continue
    const web = message.match(/^Web Material available for '(.*)'$/)
    if (web) {
      pendingLabel = web[1]
      continue
    }
    const link = message.match(/^Link:\s*(https?:\/\/\S+)$/)
    if (link) {
      links.push({ label: pendingLabel || 'Web material', url: link[1] })
      pendingLabel = null
      continue
    }
    const ics = message.match(/URL:\s*(https?:\/\/\S+)/)
    if (ics && /ICS/i.test(message)) links.push({ label: 'Calendar (.ics)', url: ics[1] })
    if (message === 'Click Here') continue
    lines.push(message)
  }
  return { lines, links }
}

function composeText(lines, tables) {
  const parts = []
  if (lines.length) parts.push(lines.join('\n'))
  for (const table of tables) {
    const rendered = renderTable(table)
    if (rendered) parts.push(rendered)
  }
  return parts.join('\n\n')
}

const LABEL_HEADER = /^(topic|title|faculty|name|semester|subjects?|facility name|category name|course \(code - title\)|course name|class group|course title|event)$/i

/** Turns a selection table into options. Option ids are cli-top's 1-based row indices. */
function buildOptions(table) {
  const headers = (table.headers || []).map(h => String(h))
  return (table.rows || []).map((row, i) => {
    const cells = {}
    headers.forEach((header, col) => {
      cells[header] = String(row[col] ?? '').trim()
    })
    const values = headers.map(header => cells[header])
    let labelCol = headers.findIndex(header => LABEL_HEADER.test(header.trim()))
    let label
    if (/code/i.test(headers[0] || '') && headers.length > 1 && values[1]) {
      label = `${values[0]} — ${values[1]}`
      labelCol = 1
    } else {
      if (labelCol === -1) labelCol = 0
      label = values[labelCol] || values.find(Boolean) || `Option ${i + 1}`
    }
    const description = values
      .filter((value, col) => value && col !== labelCol && !(labelCol === 1 && col === 0) && value !== 'Open')
      .map((value, col) => value)
      .join(' · ')
    return {
      id: String(i + 1),
      index: i + 1,
      label,
      ...(description ? { description } : {}),
      cells,
      text: values.join(' '),
    }
  })
}

/** Public projection of an option (drops the internal search text). */
const publicOption = option => ({
  id: option.id,
  index: option.index,
  label: option.label,
  ...(option.description ? { description: option.description } : {}),
  values: option.cells,
})

module.exports = { renderTable, digestMessages, composeText, buildOptions, publicOption }
