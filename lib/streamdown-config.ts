import { cjk } from '@streamdown/cjk'
import type {
  CodeHighlighterPlugin,
  DiagramPlugin,
  HighlightOptions,
  HighlightResult,
  PluginConfig,
} from 'streamdown'

/*
 * Heavy Streamdown plugins are loaded on demand so they stay out of the initial bundle:
 * - code: `@streamdown/code` (shiki core, regex engine, language map) loads on the first highlight;
 *   the real plugin also returns null until its highlighter is ready, so the first paint is unchanged.
 * - mermaid: `@streamdown/mermaid` (and with it `mermaid`) loads on the first diagram render.
 * - math: `@streamdown/math` (remark-math, rehype-katex, katex) loads only for content that can
 *   contain math; see `contentMayContainMath` and `OptimizedMarkdown`.
 */

type CodeModule = typeof import('@streamdown/code')

/** Same defaults as `@streamdown/code`; a stable reference keeps Streamdown's context stable. */
const CODE_THEMES: ReturnType<CodeHighlighterPlugin['getThemes']> = ['github-light', 'github-dark']

let codePlugin: CodeHighlighterPlugin | null = null
let codePluginPromise: Promise<CodeHighlighterPlugin> | null = null

const loadCodePlugin = (): Promise<CodeHighlighterPlugin> => {
  codePluginPromise ??= import('@streamdown/code').then((mod: CodeModule) => {
    const plugin: CodeHighlighterPlugin = mod.code
    codePlugin = plugin
    return plugin
  })
  return codePluginPromise
}

const lazyCodePlugin: CodeHighlighterPlugin = {
  name: 'shiki',
  type: 'code-highlighter',
  getThemes: () => CODE_THEMES,
  getSupportedLanguages: () => codePlugin?.getSupportedLanguages() ?? [],
  supportsLanguage: language => codePlugin?.supportsLanguage(language) ?? true,
  highlight(options: HighlightOptions, callback?: (result: HighlightResult) => void) {
    if (codePlugin) return codePlugin.highlight(options, callback)
    loadCodePlugin()
      .then(plugin => {
        const result = plugin.highlight(options, callback)
        if (result) callback?.(result)
      })
      .catch((error: unknown) => {
        console.error('[Streamdown Code] Failed to load highlighter:', error)
      })
    return null
  },
}

type MermaidConfig = Parameters<DiagramPlugin['getMermaid']>[0]
type MermaidInstance = ReturnType<DiagramPlugin['getMermaid']>

let mermaidPluginPromise: Promise<DiagramPlugin> | null = null

const loadMermaidPlugin = (): Promise<DiagramPlugin> => {
  mermaidPluginPromise ??= import('@streamdown/mermaid').then(mod => {
    const plugin: DiagramPlugin = mod.mermaid
    return plugin
  })
  return mermaidPluginPromise
}

/** Mirrors `@streamdown/mermaid`'s `getMermaid(config)` but defers loading mermaid to the first render. */
const createLazyMermaidInstance = (initialConfig: MermaidConfig): MermaidInstance => {
  let config = initialConfig
  return {
    initialize(nextConfig) {
      config = nextConfig
    },
    async render(id, source) {
      const plugin = await loadMermaidPlugin()
      return plugin.getMermaid(config).render(id, source)
    },
  }
}

const lazyMermaidPlugin: DiagramPlugin = {
  name: 'mermaid',
  type: 'diagram',
  language: 'mermaid',
  getMermaid: config => createLazyMermaidInstance(config),
}

export const streamdownPlugins: PluginConfig = {
  code: lazyCodePlugin,
  mermaid: lazyMermaidPlugin,
  cjk,
}

/**
 * Whether markdown may contain syntax handled by the math plugin: `$` / `$$` delimiters
 * (remark-math with `singleDollarTextMath`) or ```math fences (rendered by rehype-katex).
 * False positives only cost loading the math chunk.
 */
export const contentMayContainMath = (content: string): boolean =>
  content.includes('$') || /(?:`{3,}|~{3,})[ \t]*math\b/i.test(content)

let pluginsWithMath: PluginConfig | null = null
let pluginsWithMathPromise: Promise<PluginConfig> | null = null
const mathListeners = new Set<() => void>()

/** Loads the math plugin once; resolves to the full plugin set (falls back to no math on failure). */
export const loadStreamdownPluginsWithMath = (): Promise<PluginConfig> => {
  pluginsWithMathPromise ??= import('@streamdown/math')
    .then(({ createMathPlugin }) => {
      const plugins: PluginConfig = {
        ...streamdownPlugins,
        math: createMathPlugin({ singleDollarTextMath: true }),
      }
      pluginsWithMath = plugins
      return plugins
    })
    .catch((error: unknown) => {
      console.error('[Streamdown Math] Failed to load math plugin:', error)
      pluginsWithMath = streamdownPlugins
      return streamdownPlugins
    })
    .finally(() => {
      mathListeners.forEach(listener => listener())
    })
  return pluginsWithMathPromise
}

/** Synchronous snapshot of the loaded plugin set with math, or null if not loaded yet. */
export const getStreamdownPluginsWithMath = (): PluginConfig | null => pluginsWithMath

export const subscribeStreamdownPluginsWithMath = (listener: () => void): (() => void) => {
  mathListeners.add(listener)
  return () => {
    mathListeners.delete(listener)
  }
}
