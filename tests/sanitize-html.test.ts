import assert from 'node:assert/strict'
import test from 'node:test'
import { safeUrl, sanitizeHtml } from '../lib/sanitize-html'

/** No executable surface may survive: handlers, script-ish URLs, active elements, style. */
function assertInert(output: string) {
  const lower = output.toLowerCase()
  assert.doesNotMatch(lower, /<\s*(script|style|iframe|object|embed|svg|math|form|input|button|textarea|link|meta|base)\b/)
  // Attribute checks are scoped to real tags: escaped text (`&lt;img onerror=…`) is inert.
  assert.doesNotMatch(lower, /<[a-z][^>]*\son[a-z]+\s*=/)
  assert.doesNotMatch(lower, /<[a-z][^>]*(javascript:|vbscript:|data:)/)
  assert.doesNotMatch(lower, /<[a-z][^>]*\sstyle\s*=/)
  assert.doesNotMatch(lower, /<[a-z][^>]*\s(srcset|formaction|xlink:href|action|srcdoc)\s*=/)
}

const MALICIOUS: Array<[string, string]> = [
  ['img onerror', '<img src=x onerror=alert(1)>'],
  ['img onerror quoted', '<img src="https://ok.example/a.png" onerror="alert(1)">'],
  ['javascript link', '<a href="javascript:alert(1)">x</a>'],
  ['entity-encoded javascript link', '<a href="jav&#x61;script:alert(1)">x</a>'],
  ['decimal entity scheme', '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">x</a>'],
  ['named-entity colon', '<a href="javascript&colon;alert(1)">x</a>'],
  ['tab inside scheme', '<a href="java\tscript:alert(1)">x</a>'],
  ['newline inside scheme', '<a href="java\nscript:alert(1)">x</a>'],
  ['mixed case + spaces', '<a href="  JaVaScRiPt:alert(1)">x</a>'],
  ['vbscript', '<a href="vbscript:msgbox(1)">x</a>'],
  ['data html link', '<a href="data:text/html,<script>alert(1)</script>">x</a>'],
  ['svg onload', '<svg/onload=alert(1)>'],
  ['svg script', '<svg><script>alert(1)</script></svg>'],
  ['svg animate href', '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>'],
  ['plain script', '<script>alert(1)</script>'],
  ['split script', '<scr<script>ipt>alert(1)</script>'],
  ['style expression', '<p style="width: expression(alert(1))">e</p>'],
  ['style url', '<div style="background:url(javascript:alert(1))">s</div>'],
  ['style tag', '<style>@import "https://evil.example/x.css";</style>'],
  ['iframe', '<iframe src="https://evil.example"></iframe>'],
  ['iframe srcdoc', '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
  ['object', '<object data="javascript:alert(1)"></object>'],
  ['embed', '<embed src="https://evil.example/x.swf">'],
  ['form + formaction', '<form action="https://evil.example"><button formaction="javascript:alert(1)">b</button></form>'],
  ['input autofocus', '<input onfocus=alert(1) autofocus>'],
  ['details ontoggle', '<details open ontoggle=alert(1)><summary>s</summary></details>'],
  ['math mxss', '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>'],
  ['comment smuggling', '<!--<img src=x onerror=alert(1)>-->'],
  ['attribute breakout', '"><img src=x onerror=alert(1)>'],
  ['nested lt', '<<img src=x onerror=alert(1)//<'],
  ['srcset', '<img src="https://ok.example/a.png" srcset="javascript:alert(1)">'],
  ['meta refresh', '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">'],
  ['base href', '<base href="https://evil.example/">'],
  ['link stylesheet', '<link rel="stylesheet" href="https://evil.example/x.css">'],
  ['uppercase tags', '<IMG SRC=x ONERROR=alert(1)>'],
  ['null byte', '<img src=x on\u0000error=alert(1)>'],
]

for (const [name, payload] of MALICIOUS) {
  test(`sanitizeHtml neutralises: ${name}`, () => {
    assertInert(sanitizeHtml(payload))
  })
}

test('sanitizeHtml drops dangerous element bodies entirely', () => {
  assert.equal(sanitizeHtml('<script>alert(1)</script>ok'), 'ok')
  assert.equal(sanitizeHtml('<style>body{display:none}</style>visible'), 'visible')
  assert.equal(sanitizeHtml('<svg><script>alert(1)</script></svg>after'), 'after')
})

test('sanitizeHtml strips data: and relative image sources', () => {
  assert.equal(sanitizeHtml('<img src="data:image/png;base64,AAAA">'), '<img>')
  assert.equal(sanitizeHtml('<img src="/internal.png">'), '<img>')
})

test('sanitizeHtml keeps VTOP-style tables, lists and headings', () => {
  const html =
    '<div class="hub-card"><h3 class="hub-card-title">attendance overview</h3>' +
    '<p class="hub-card-subtitle">2 courses</p>' +
    '<table class="hub-table"><thead><tr><th scope="col">course</th><th colspan="2">attendance</th></tr></thead>' +
    '<tbody><tr><td>BCSE302L</td><td rowspan="1">82%</td></tr></tbody></table>' +
    '<ul><li><strong>Faculty:</strong> <em>Dr. A</em></li></ul><ol start="2"><li>next</li></ol></div>'
  assert.equal(sanitizeHtml(html), html)
})

test('sanitizeHtml filters class tokens to our own formatter classes', () => {
  assert.equal(
    sanitizeHtml('<div class="hub-card fixed inset-0 z-50 vtop-row">x</div>'),
    '<div class="hub-card vtop-row">x</div>'
  )
  assert.equal(sanitizeHtml('<div class="fixed inset-0">x</div>'), '<div>x</div>')
})

test('sanitizeHtml keeps http(s)/mailto links and forces safe target/rel', () => {
  assert.equal(
    sanitizeHtml('<a href="https://vtop.vit.ac.in/file?id=1&amp;t=2" target="_self" rel="opener">download</a>'),
    '<a target="_blank" rel="noopener noreferrer" href="https://vtop.vit.ac.in/file?id=1&t=2">download</a>'
  )
  assert.equal(
    sanitizeHtml('<a href="mailto:help@vit.ac.in">mail</a>'),
    '<a target="_blank" rel="noopener noreferrer" href="mailto:help@vit.ac.in">mail</a>'
  )
  assert.equal(
    sanitizeHtml('<a href="/relative">r</a>'),
    '<a target="_blank" rel="noopener noreferrer">r</a>'
  )
})

test('sanitizeHtml keeps https images with alt text', () => {
  assert.equal(
    sanitizeHtml('<img src="https://cdn.example.com/a.png" alt="chart" width="120">'),
    '<img src="https://cdn.example.com/a.png" alt="chart" width="120">'
  )
})

test('sanitizeHtml keeps text-only angle brackets and handles empty input', () => {
  assert.equal(sanitizeHtml('a < b > c'), 'a &lt; b &gt; c')
  assert.equal(
    sanitizeHtml('<p>attendance < 75% means debarred</p>'),
    '<p>attendance &lt; 75% means debarred</p>'
  )
  assert.equal(sanitizeHtml(''), '')
  assert.equal(sanitizeHtml(null), '')
  assert.equal(sanitizeHtml(undefined), '')
})

test('safeUrl accepts only the given protocols', () => {
  assert.equal(safeUrl('https://example.com/a'), 'https://example.com/a')
  assert.equal(safeUrl('mailto:a@b.co'), 'mailto:a@b.co')
  assert.equal(safeUrl('javascript:alert(1)'), null)
  assert.equal(safeUrl('//evil.example/x'), null)
  assert.equal(safeUrl('mailto:a@b.co', new Set(['https:'])), null)
})
