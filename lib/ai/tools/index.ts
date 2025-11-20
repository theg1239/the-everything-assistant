import { knowledgeTools } from './knowledge'
import { memoryTools } from './memory'
import { paperTools } from './papers'
import { courseTools } from './courses'
import { facultyTools } from './faculty'
import { messMenuTools } from './mess-menu'
import { redditTools } from './reddit'
import { placementTools } from './placement'
import { syllabusTools } from './syllabus'
import { campusTools } from './campus'
import { vtopTools } from './vtop'

export function createToolRegistry(userId: string) {
  return {
    ...knowledgeTools(),
    ...memoryTools(userId),
    ...paperTools(),
    ...courseTools(),
    ...facultyTools(),
    ...messMenuTools(),
    ...redditTools(),
    ...placementTools(),
    ...syllabusTools(),
    ...campusTools(),
    ...vtopTools(),
  }
}

export type ToolRegistry = ReturnType<typeof createToolRegistry>

