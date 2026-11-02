import { createElement } from 'react'
import { sanitizeHtml } from '@/lib/sanitize-html'

type SafeHtmlTag = 'div' | 'span' | 'section' | 'article' | 'p'

interface SafeHtmlProps {
  /** Untrusted HTML; sanitized with the strict allow-list in `lib/sanitize-html`. */
  html: string | null | undefined
  className?: string
  as?: SafeHtmlTag
}

/**
 * The only sanctioned way to render model-, tool- or user-supplied HTML. Works in
 * server and client components; sanitization is deterministic, so SSR output and
 * the hydrated client render match.
 */
export function SafeHtml({ html, className, as = 'div' }: SafeHtmlProps) {
  return createElement(as, {
    className,
    dangerouslySetInnerHTML: { __html: sanitizeHtml(html) },
  })
}
