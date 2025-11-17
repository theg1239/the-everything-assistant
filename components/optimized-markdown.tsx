'use client'

import { marked } from 'marked'
import { memo, useMemo } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// ---------- helpers ----------
const renderer = new marked.Renderer()
const defaultTableRenderer = renderer.table?.bind(renderer)

function escapeHtml(s: string) {
  return (s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// Only adjust escapes inside math content (not global text)
function normalizeMath(s: string) {
  // turn \" into " (sometimes appears in JSONified strings)
  // and \\ into \ for LaTeX commands
  return s.replace(/\\+"/g, '"').replace(/\\\\/g, '\\')
}

renderer.code = ({ text, lang }) => {
  const language = lang || ''
  const safe = escapeHtml(text as string)
  return `<pre class="overflow-auto bg-muted p-4 rounded-lg border"><code class="language-${language}">${safe}</code></pre>`
}

renderer.codespan = ({ text }) => {
  const safe = escapeHtml(text as string)
  return `<code class="bg-muted px-1 py-0.5 rounded text-sm">${safe}</code>`
}

if (defaultTableRenderer) {
  renderer.table = function overrideTable(token: any) {
    const tableHtml = defaultTableRenderer(token)
    return `<div class="markdown-table-wrapper" data-allow-touch-scroll>${tableHtml}</div>`
  }
}

// ---------- KaTeX / Math extensions for marked ----------
function renderMathToHtml(src: string, displayMode: boolean) {
  const cleaned = normalizeMath(src)
  try {
    return katex.renderToString(cleaned, {
      throwOnError: false,
      displayMode,
      output: 'htmlAndMathml',
      strict: 'ignore',
    })
  } catch {
    return `<code class="bg-muted px-1 py-0.5 rounded text-sm">${escapeHtml(cleaned)}</code>`
  }
}

// $$ ... $$
const mathBlockDollar = {
  name: 'mathBlockDollar',
  level: 'block' as const,
  start(src: string) {
    const m = src.match(/(^|\n)\s*\$\$/)
    return m ? m.index : undefined
  },
  tokenizer(src: string) {
    const rule = /^(?:\s*)\$\$([\s\S]+?)\$\$\s*(?:\n+|$)/
    const m = rule.exec(src)
    if (!m) return
    return { type: 'mathBlockDollar', raw: m[0], text: m[1].trim() } as any
  },
  renderer(token: any) {
    return `<div class="katex-display">${renderMathToHtml(token.text, true)}</div>\n`
  },
}

// \[ ... \]
const mathBlockBracket = {
  name: 'mathBlockBracket',
  level: 'block' as const,
  start(src: string) {
    const m = src.match(/(^|\n)\s*\\\[/)
    return m ? m.index : undefined
  },
  tokenizer(src: string) {
    const rule = /^(?:\s*)\\\[([\s\S]+?)\\\]\s*(?:\n+|$)/
    const m = rule.exec(src)
    if (!m) return
    return { type: 'mathBlockBracket', raw: m[0], text: m[1].trim() } as any
  },
  renderer(token: any) {
    return `<div class="katex-display">${renderMathToHtml(token.text, true)}</div>\n`
  },
}

// \begin{...} ... \end{...}  (common environments like cases, align*, etc.)
const mathBlockEnv = {
  name: 'mathBlockEnv',
  level: 'block' as const,
  start(src: string) {
    const m = src.match(/(^|\n)\s*\\begin\{/)
    return m ? m.index : undefined
  },
  tokenizer(src: string) {
    const m = /^(?:\s*)\\begin\{([a-zA-Z*]+)\}([\s\S]+?)\\end\{\1\}\s*(?:\n+|$)/.exec(src)
    if (!m) return
    const env = m[1]
    const body = m[2]
    return {
      type: 'mathBlockEnv',
      env,
      raw: m[0],
      text: `\\begin{${env}}${body}\\end{${env}}`,
    } as any
  },
  renderer(token: any) {
    return `<div class="katex-display">${renderMathToHtml(token.text, true)}</div>\n`
  },
}

// $ ... $
const mathInlineDollar = {
  name: 'mathInlineDollar',
  level: 'inline' as const,
  start(src: string) {
    const idx = src.search(/(?<!\\)\$/)
    return idx === -1 ? undefined : idx
  },
  tokenizer(src: string) {
    if (!/^\$(?!\$)/.test(src)) return
    const m = src.match(/^\$((?:\\\$|[^\n$])+?)\$(?!\$)/)
    if (!m) return
    return { type: 'mathInlineDollar', raw: m[0], text: m[1].trim() } as any
  },
  renderer(token: any) {
    return renderMathToHtml(token.text, false)
  },
}

// \( ... \)
const mathInlineParen = {
  name: 'mathInlineParen',
  level: 'inline' as const,
  start(src: string) {
    const idx = src.indexOf('\\(')
    return idx === -1 ? undefined : idx
  },
  tokenizer(src: string) {
    const m = src.match(/^\\\(((?:\\\)|[^\n])+?)\\\)/)
    if (!m) return
    return { type: 'mathInlineParen', raw: m[0], text: m[1].trim() } as any
  },
  renderer(token: any) {
    return renderMathToHtml(token.text, false)
  },
}

// Register marked with our renderer + extensions
marked.setOptions({ gfm: true, breaks: true, silent: true, renderer })
marked.use({
  extensions: [
    mathBlockDollar as any,
    mathBlockBracket as any,
    mathBlockEnv as any,
    mathInlineDollar as any,
    mathInlineParen as any,
  ],
})

// ---------- Components ----------
interface MarkdownBlockProps {
  id: string
  index: number
  blockIndex: number
  content: string
}

export const MarkdownBlock = memo(function PureMarkdownBlock({
  id,
  index,
  blockIndex,
  content,
}: MarkdownBlockProps) {
  const blockContent = useMemo(() => {
    const blocks = lexer(content)
    return blocks[blockIndex]
  }, [content, blockIndex])

  if (blockContent === undefined) return null

  const rawHtml = marked.parse(blockContent, { async: false }) as string

  const sanitized = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true, svg: true, mathMl: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'link', 'style'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'], // NOTE: allow inline style
    ADD_TAGS: [
      'math',
      'mrow',
      'mi',
      'mo',
      'mn',
      'msup',
      'msub',
      'msubsup',
      'mfrac',
      'msqrt',
      'mroot',
      'mstyle',
      'mspace',
      'mtable',
      'mtr',
      'mtd',
      'semantics',
      'annotation',
      'annotation-xml',
    ],
    ADD_ATTR: [
      'style',
      'display',
      'xmlns',
      'mathvariant',
      'aria-hidden',
      'role',
      'focusable',
      'data-allow-touch-scroll',
    ],
  })

  return (
    <div
      className="markdown-block whitespace-normal"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  )
})

export const OptimizedMarkdown = memo(
  function PureOptimizedMarkdown({ id, content }: { id: string; content: string }) {
    const blockCount = useMemo(() => lexer(content).length, [content])

    return (
      <>
        <style jsx global>{`
          .prose .katex {
            font-size: 1em;
            line-height: inherit;
          }
          .prose .katex-display {
            margin: 0.5rem 0;
            overflow-x: auto;
          }
          .prose .katex-display > .katex {
            display: inline-block;
          }
        `}</style>
        <div className="text-base leading-relaxed prose prose-sm max-w-none dark:prose-invert">
          {Array.from({ length: blockCount }, (_, i) => (
            <MarkdownBlock
              key={`${id}-block-${i}`}
              id={id}
              index={0}
              blockIndex={i}
              content={content}
            />
          ))}
        </div>
      </>
    )
  },
  (prev, next) => prev.content === next.content && prev.id === next.id
)

// ---------- Cached lexer ----------
const lexer = (() => {
  let lastText = ''
  let lastResult: string[] = []
  return (markdown: string): string[] => {
    if (markdown === lastText) return lastResult
    lastText = markdown
    try {
      const tokens = marked.lexer(markdown as string)
      lastResult = tokens.map((t: any) => t.raw || '')
    } catch (e) {
      console.error('Markdown parsing error:', e)
      lastResult = [markdown]
    }
    return lastResult
  }
})()
