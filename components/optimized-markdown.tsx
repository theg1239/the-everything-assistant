'use client'

import { marked } from 'marked'
import { memo, useMemo } from 'react'

const renderer = new marked.Renderer()

renderer.code = ({ text, lang, escaped }) => {
  const language = lang || ''
  return `<pre class="overflow-auto bg-muted p-4 rounded-lg border"><code class="language-${language}">${text}</code></pre>`
}

renderer.codespan = ({ text }) => {
  return `<code class="bg-muted px-1 py-0.5 rounded text-sm">${text}</code>`
}

marked.setOptions({
  gfm: true,
  breaks: true,
  silent: true,
  renderer,
})

interface MarkdownBlockProps {
  id: string
  index: number
  blockIndex: number
  content: string
}

export const MarkdownBlock = memo(
  function PureMarkdownBlock({
    id,
    index,
    blockIndex,
    content,
  }: MarkdownBlockProps) {
    const blockContent = useMemo(() => {
      const blocks = lexer(content)
      return blocks[blockIndex]
    }, [content, blockIndex])

    if (blockContent === undefined) {
      return null
    }

    return (
      <div 
        className="markdown-block"
        dangerouslySetInnerHTML={{ 
          __html: marked.parse(blockContent, { async: false }) as string 
        }} 
      />
    )
  }
)

export const OptimizedMarkdown = memo(
  function PureOptimizedMarkdown({ 
    id, 
    content 
  }: { 
    id: string
    content: string 
  }) {
    const blockCount = useMemo(() => {
      return lexer(content).length
    }, [content])

    return (
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
    )
  },
  function propsAreEqual(prevProps, nextProps) {
    return prevProps.content === nextProps.content && prevProps.id === nextProps.id
  }
)

const lexer = (() => {
  let lastText = ''
  let lastResult: string[] = []
  
  return (markdown: string): string[] => {
    if (markdown === lastText) {
      return lastResult
    }
    
    lastText = markdown
    
    try {
      const tokens = marked.lexer(markdown)
      lastResult = tokens.map(token => token.raw || '')
    } catch (error) {
      console.error('Markdown parsing error:', error)
      lastResult = [markdown]
    }
    
    return lastResult
  }
})()
