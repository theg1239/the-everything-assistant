import { FilterXSS, escapeAttrValue, type IWhiteList } from 'xss'

/**
 * Strict allow-list HTML sanitizer for untrusted markup (LLM-formatted VTOP /
 * placement results, deep-search responses, tool outputs from shared chats).
 *
 * Built on js-xss, which parses with plain string scanning (no DOM), so the
 * same code runs identically in the browser, the Node runtime and Cloudflare
 * Workers. Anything not explicitly allowed below is removed:
 * - tags outside the list are stripped (their text is kept and escaped);
 *   `script`/`style`/`template`/... are dropped together with their contents;
 * - every attribute not in the list is dropped (so all `on*` handlers, `style`,
 *   `srcset`, `formaction`, `xlink:href`, ...);
 * - `href` accepts only http(s) and mailto, `src` only http(s);
 * - `class` keeps only `hub-*` / `vtop-*` tokens (our own formatter classes), so
 *   injected utility classes cannot restyle the page (e.g. a full-screen overlay);
 * - links always get `target="_blank" rel="noopener noreferrer"`.
 */

const GLOBAL_ATTRS = ['class', 'title']

const allow = (...extra: string[]) => [...GLOBAL_ATTRS, ...extra]

const ALLOWED_TAGS: IWhiteList = {
  a: allow('href'),
  abbr: allow(),
  article: allow(),
  b: allow(),
  blockquote: allow(),
  br: allow(),
  caption: allow(),
  code: allow(),
  col: allow('span'),
  colgroup: allow('span'),
  dd: allow(),
  del: allow(),
  details: allow(),
  div: allow(),
  dl: allow(),
  dt: allow(),
  em: allow(),
  figcaption: allow(),
  figure: allow(),
  footer: allow(),
  h1: allow(),
  h2: allow(),
  h3: allow(),
  h4: allow(),
  h5: allow(),
  h6: allow(),
  header: allow(),
  hr: allow(),
  i: allow(),
  img: allow('src', 'alt', 'width', 'height'),
  ins: allow(),
  kbd: allow(),
  li: allow(),
  mark: allow(),
  ol: allow('start', 'type'),
  p: allow(),
  pre: allow(),
  s: allow(),
  section: allow(),
  small: allow(),
  span: allow(),
  strong: allow(),
  sub: allow(),
  summary: allow(),
  sup: allow(),
  table: allow(),
  tbody: allow(),
  td: allow('colspan', 'rowspan'),
  tfoot: allow(),
  th: allow('colspan', 'rowspan', 'scope'),
  thead: allow(),
  tr: allow(),
  u: allow(),
  ul: allow(),
}

/** Tags removed together with everything inside them. */
const DROP_WITH_CONTENT = [
  'script',
  'style',
  'template',
  'noscript',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'textarea',
  'title',
  'xmp',
  'noembed',
  'noframes',
  'plaintext',
  'select',
  'option',
  'head',
]

const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])
const IMAGE_PROTOCOLS = new Set(['http:', 'https:'])

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  colon: ':',
  tab: '\t',
  newline: '\n',
  sol: '/',
  lpar: '(',
  rpar: ')',
  period: '.',
  comma: ',',
}

/** Decodes numeric and the handful of named entities that can spell a URL scheme. */
function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : ''
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

/**
 * Returns the normalised absolute URL when it uses an allowed protocol, else null.
 * Relative, protocol-relative and scheme-less URLs are rejected: the content is
 * rendered on our origin and has no legitimate reason to link inside it.
 */
export function safeUrl(raw: string, protocols: ReadonlySet<string> = LINK_PROTOCOLS): string | null {
  // Browsers ignore ASCII whitespace/control chars inside schemes ("java\tscript:").
  // eslint-disable-next-line no-control-regex
  const cleaned = decodeEntities(raw).replace(/[\u0000- \u007f-\u009f]+/g, '')
  if (!/^[a-z][a-z0-9+.-]*:/i.test(cleaned)) return null
  let url: URL
  try {
    url = new URL(cleaned)
  } catch {
    return null
  }
  if (!protocols.has(url.protocol)) return null
  return url.href
}

const CLASS_TOKEN = /^(?:hub|vtop)-[a-z0-9-]{1,48}$/i

function filterClassList(value: string): string {
  return value
    .split(/\s+/)
    .filter(token => CLASS_TOKEN.test(token))
    .join(' ')
}

const INTEGER_ATTRS = new Set(['colspan', 'rowspan', 'span', 'start', 'width', 'height'])
const OL_TYPES = new Set(['1', 'a', 'A', 'i', 'I'])
const TH_SCOPES = new Set(['row', 'col', 'rowgroup', 'colgroup'])

/** Validated attribute value, or null to drop the attribute. */
function attrValue(tag: string, name: string, value: string): string | null {
  if (name === 'href') return safeUrl(value, LINK_PROTOCOLS)
  if (name === 'src') return safeUrl(value, IMAGE_PROTOCOLS)
  if (name === 'class') return filterClassList(value) || null
  if (INTEGER_ATTRS.has(name)) return /^\d{1,4}$/.test(value.trim()) ? value.trim() : null
  if (tag === 'ol' && name === 'type') return OL_TYPES.has(value.trim()) ? value.trim() : null
  if (tag === 'th' && name === 'scope') return TH_SCOPES.has(value.trim()) ? value.trim() : null
  return decodeEntities(value)
}

const filter = new FilterXSS({
  whiteList: ALLOWED_TAGS,
  stripIgnoreTag: true,
  stripIgnoreTagBody: DROP_WITH_CONTENT,
  allowCommentTag: false,
  stripBlankChar: true,
  css: false,
  onTagAttr: (tag, name, value, isWhiteAttr) => {
    if (!isWhiteAttr) return ''
    const safe = attrValue(tag, name, value)
    return safe === null ? '' : `${name}="${escapeAttrValue(safe)}"`
  },
  // Non-allow-listed attributes are always dropped (default would keep data-*).
  onIgnoreTagAttr: () => '',
})

const LINK_ATTRS = ' target="_blank" rel="noopener noreferrer"'

/**
 * Sanitizes untrusted HTML for `innerHTML` rendering. Safe on server and client;
 * the output for a given input is identical on both, so it hydrates cleanly.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return ''
  // A `<` not followed by a letter, `/`, `!` or `?` is text to an HTML parser (e.g.
  // "attendance < 75%"), but js-xss would read it as a tag and strip what follows.
  const input = String(html).replace(/<(?![a-zA-Z/!?])/g, '&lt;')
  // js-xss marks dropped bodies with `[removed]`/`[/removed]`; unbalanced markers
  // (e.g. an unclosed `<svg>`) are left behind as text, so strip them.
  const clean = filter.process(input).replace(/\[\/?removed\]/g, '')
  // After filtering, every literal `<a` that starts a tag is an allow-listed anchor
  // (text `<` and attribute values are entity-escaped), so this cannot match content.
  return clean.replace(/<a(?=[\s>])/gi, `<a${LINK_ATTRS}`)
}
