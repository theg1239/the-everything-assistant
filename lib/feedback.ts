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

type SessionUser = { id?: string | null; name?: string | null; email?: string | null; isGuest?: boolean }

const encoder = new TextEncoder()

/**
 * Opaque, stable reference for the submitter. Issues may be public, so no name or
 * email is written; a keyed hash (not a plain one: student emails are guessable)
 * lets maintainers correlate submissions by recomputing it for a known user.
 */
async function submitterReference(sessionUser: SessionUser | undefined): Promise<string> {
  const identity = sessionUser?.id || sessionUser?.email
  if (!identity) return sessionUser?.isGuest ? 'a guest user' : 'an anonymous user'
  const secret = process.env.FEEDBACK_USER_HASH_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) return 'a signed-in user'
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`feedback:${identity}`))
  const hex = Array.from(new Uint8Array(digest).slice(0, 8), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('')
  return `user \`u_${hex}\``
}

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

  const submittedBy = `**Submitted by:** ${await submitterReference(sessionUser)}`

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
  } catch (error) {
    console.error('Failed to create GitHub issue:', error)
    return {
      success: false,
      status: 500,
      error: 'Failed to create GitHub issue.',
    }
  }
}
