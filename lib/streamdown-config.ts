import { defaultRemarkPlugins, defaultRehypePlugins } from 'streamdown'
import remarkMath from 'remark-math'
import type { PluggableList } from 'unified'

export const streamdownRemarkPlugins: PluggableList = [
  defaultRemarkPlugins['gfm'],
  [remarkMath, { singleDollarTextMath: true }],
  defaultRemarkPlugins['cjkFriendly'],
  defaultRemarkPlugins['cjkFriendlyGfmStrikethrough'],
]

export const streamdownRehypePlugins: PluggableList = [
  defaultRehypePlugins['raw'],
  defaultRehypePlugins['katex'],
  defaultRehypePlugins['sanitize'],
  defaultRehypePlugins['harden'],
]
