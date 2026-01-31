import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import { createMathPlugin } from '@streamdown/math'
import { mermaid } from '@streamdown/mermaid'

export const streamdownPlugins = {
  code,
  mermaid,
  cjk,
  math: createMathPlugin({ singleDollarTextMath: true }),
}
