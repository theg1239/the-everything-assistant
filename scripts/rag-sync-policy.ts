/** Explain which non-secret deployment identity checks did not pass. */
export function ragSyncSkipReasons(env: Record<string, string | undefined>): string[] {
  const checks: Array<[string, boolean]> = [
    ['VERCEL', env.VERCEL === '1'],
    ['VERCEL_ENV', env.VERCEL_ENV === 'production'],
    ['VERCEL_GIT_PROVIDER', env.VERCEL_GIT_PROVIDER === 'github'],
    ['VERCEL_GIT_REPO_OWNER', env.VERCEL_GIT_REPO_OWNER === 'theg1239'],
    ['VERCEL_GIT_REPO_SLUG', env.VERCEL_GIT_REPO_SLUG === 'the-everything-assistant'],
    ['VERCEL_GIT_COMMIT_REF', Boolean(env.VERCEL_GIT_COMMIT_REF?.trim())],
    [
      'VERCEL_PROJECT_PRODUCTION_URL',
      ['everything-assistant.com', 'www.everything-assistant.com'].includes(
        env.VERCEL_PROJECT_PRODUCTION_URL || ''
      ),
    ],
  ]
  return checks.filter(([, passed]) => !passed).map(([name]) => name)
}

/** Only the designated Git production build may modify the shared index. */
export function shouldSyncRag(env: Record<string, string | undefined>): boolean {
  return ragSyncSkipReasons(env).length === 0
}
