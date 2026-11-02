export function validateEnvironmentConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!process.env.OPENAI_API_KEY) {
    errors.push('OPENAI_API_KEY is not set.')
  }

  if (!process.env.UPSTASH_REDIS_REST_URL) {
    errors.push('UPSTASH_REDIS_REST_URL is required for serverless rate limiting')
  }

  if (!process.env.UPSTASH_REDIS_REST_TOKEN) {
    errors.push('UPSTASH_REDIS_REST_TOKEN is required for serverless rate limiting')
  }

  const numericConfigs = [
    'USER_RATE_LIMIT_REQUESTS_PER_MINUTE',
    'USER_RATE_LIMIT_REQUESTS_PER_HOUR',
    'USER_RATE_LIMIT_REQUESTS_PER_DAY',
  ] as const

  for (const config of numericConfigs) {
    const value = process.env[config]
    if (value && Number.isNaN(Number.parseInt(value, 10))) {
      errors.push(`${config} must be a valid number, got: ${value}`)
    }
  }

  const adminEmail = process.env.RATE_LIMIT_ADMIN_EMAIL
  if (adminEmail && !adminEmail.includes('@')) {
    errors.push('RATE_LIMIT_ADMIN_EMAIL must be a valid email address')
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

export function getEnvironmentSummary() {
  return {
    hasRedis: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    openaiApiKey: process.env.OPENAI_API_KEY ? 'Set' : 'Not set',
    admin: {
      email: process.env.RATE_LIMIT_ADMIN_EMAIL ? 'Configured' : 'Not configured',
    },
  }
}

export function isSMTPConfigured(): boolean {
  return !!(process.env.SMTP_EMAIL && process.env.SMTP_APP_PASSWORD)
}

export function getSMTPStatus() {
  return {
    configured: isSMTPConfigured(),
    email: process.env.SMTP_EMAIL ? 'Set' : 'Not set',
    password: process.env.SMTP_APP_PASSWORD ? 'Set' : 'Not set',
  }
}
