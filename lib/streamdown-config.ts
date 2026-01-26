import { defaultRemarkPlugins } from 'streamdown'
import remarkMath from 'remark-math'
import type { PluggableList } from 'unified'

export const streamdownRemarkPlugins: PluggableList = [
  defaultRemarkPlugins.gfm,
  [remarkMath, { singleDollarTextMath: true }],
  defaultRemarkPlugins.cjkFriendly,
  defaultRemarkPlugins.cjkFriendlyGfmStrikethrough,
]
