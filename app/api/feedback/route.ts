import { NextResponse } from 'next/server'
import { Octokit } from '@octokit/rest'

export async function POST(req: Request) {
  const { type, title, body, contribution, user } = await req.json()

  if (
    !process.env.GITHUB_TOKEN ||
    !process.env.GITHUB_REPO_OWNER ||
    !process.env.GITHUB_REPO_NAME
  ) {
    console.error('GitHub environment variables are not set.')
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 })
  }

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

  const repoDetails = {
    owner: process.env.GITHUB_REPO_OWNER,
    repo: process.env.GITHUB_REPO_NAME,
  }

  let issueTitle: string
  let issueBody: string
  const submittedBy = user
    ? `**Submitted by:** ${user.name} (${user.email})`
    : '**Submitted by:** An anonymous user'
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
    return NextResponse.json({ error: 'Invalid submission type.' }, { status: 400 })
  }

  try {
    const response = await octokit.issues.create({
      ...repoDetails,
      title: issueTitle,
      body: issueBody,
      labels: labels,
    })

    return NextResponse.json({ success: true, issueUrl: response.data.html_url })
  } catch (error: any) {
    console.error('Failed to create GitHub issue:', error)
    return NextResponse.json(
      { error: 'Failed to create GitHub issue.', details: error.message },
      { status: 500 }
    )
  }
}
