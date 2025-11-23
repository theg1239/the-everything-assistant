import { Octokit } from '@octokit/rest'
import { feedbackRequestSchema } from '@/types/api/feedback'

type FeedbackResult =
  | { success: true; issueUrl: string }
  | { success: false; status: number; error: string; details?: unknown }

function getRepoConfig() {
  const { GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME } = process.env
  if (!GITHUB_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME) {
    return null
  }
  return { token: GITHUB_TOKEN, owner: GITHUB_REPO_OWNER, repo: GITHUB_REPO_NAME }
}

type SessionUser = { name?: string | null; email?: string | null }

export async function createFeedbackIssue(raw: unknown, sessionUser?: SessionUser): Promise<FeedbackResult> {
  const parsed = feedbackRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      status: 400,
      error: 'Invalid submission payload.',
      details: parsed.error.flatten(),
    }
  }

  const config = getRepoConfig()
  if (!config) {
    console.error('GitHub environment variables are not set.')
    return { success: false, status: 500, error: 'Server configuration error.' }
  }

  const { type, title, body, contribution } = parsed.data
  const octokit = new Octokit({ auth: config.token })

  const submittedBy = sessionUser?.email || sessionUser?.name
    ? `**Submitted by:** ${sessionUser.name ?? 'Anonymous'} (${sessionUser.email ?? 'no email provided'})`
    : '**Submitted by:** An anonymous user'

  let issueTitle: string
  let issueBody: string
  let labels: string[]

  if (type === 'contribution' && contribution) {
    issueTitle = `KB Contribution: ${contribution.title || 'Chunk Updates'}`
    issueBody = `${submittedBy}\n\n${contribution.body}`
    labels = ['knowledge-base-contribution']
  } else if (type === 'feedback') {
    issueTitle = `Feedback: ${title}`
    issueBody = `${submittedBy}\n\n${body}`
    labels = ['feedback']
  } else {
    return { success: false, status: 400, error: 'Invalid submission type.' }
  }

  try {
    const response = await octokit.issues.create({
      owner: config.owner,
      repo: config.repo,
      title: issueTitle,
      body: issueBody,
      labels,
    })

    return { success: true, issueUrl: response.data.html_url }
  } catch (error: any) {
    console.error('Failed to create GitHub issue:', error)
    return {
      success: false,
      status: 500,
      error: 'Failed to create GitHub issue.',
      details: error?.message,
    }
  }
}
