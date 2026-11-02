/** Only the designated Git production build may modify the shared index. */
export function shouldSyncRag(env: Record<string, string | undefined>): boolean {
  return (
    env.VERCEL === '1' &&
    env.VERCEL_ENV === 'production' &&
    env.VERCEL_GIT_PROVIDER === 'github' &&
    env.VERCEL_GIT_REPO_OWNER === 'theg1239' &&
    env.VERCEL_GIT_REPO_SLUG === 'the-everything-assistant' &&
    ['main', 'stable', 'prod'].includes(env.VERCEL_GIT_COMMIT_REF || '') &&
    ['everything-assistant.com', 'www.everything-assistant.com'].includes(
      env.VERCEL_PROJECT_PRODUCTION_URL || ''
    )
  )
}
