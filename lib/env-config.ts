import { ApiKeyConfig, DEFAULT_API_KEY_CONFIG } from './api-key-manager'

export function loadApiKeyConfigFromEnv(): ApiKeyConfig {
  return {
    ...DEFAULT_API_KEY_CONFIG,
    keys: [],
    rateLimit: {
      requestsPerMinute: parseInt(process.env.API_RATE_LIMIT_REQUESTS_PER_MINUTE || '60'),
      requestsPerHour: parseInt(process.env.API_RATE_LIMIT_REQUESTS_PER_HOUR || '1000'),
      requestsPerDay: parseInt(process.env.API_RATE_LIMIT_REQUESTS_PER_DAY || '50000'),
    },
    retryConfig: {
      maxRetries: parseInt(process.env.API_RETRY_MAX_RETRIES || '3'),
      backoffMultiplier: parseFloat(process.env.API_RETRY_BACKOFF_MULTIPLIER || '2'),
      maxBackoffMs: parseInt(process.env.API_RETRY_MAX_BACKOFF_MS || '30000'),
    },
    enableRotation: process.env.API_KEY_ROTATION_ENABLED !== 'false',
    rotateOnRateLimit: process.env.API_KEY_ROTATE_ON_RATE_LIMIT !== 'false',
    keyHealthCheckInterval: parseInt(process.env.API_KEY_HEALTH_CHECK_INTERVAL_MS || '30000'),
  }
}

export function validateEnvironmentConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = []

  const hasGoogleKeys = Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_AI_API_KEYS
  )
  const hasOpenAIKeys = Boolean(
    process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEYS
  )
  if (!hasGoogleKeys && !hasOpenAIKeys) {
    errors.push(
      'No Google/OpenAI API keys found. Set GOOGLE_GENERATIVE_AI_API_KEY or OPENAI_API_KEY.'
    )
  }

  if (!process.env.UPSTASH_REDIS_REST_URL) {
    errors.push('UPSTASH_REDIS_REST_URL is required for serverless rate limiting')
  }

  if (!process.env.UPSTASH_REDIS_REST_TOKEN) {
    errors.push('UPSTASH_REDIS_REST_TOKEN is required for serverless rate limiting')
  }

  const numericConfigs = [
    'API_RATE_LIMIT_REQUESTS_PER_MINUTE',
    'API_RATE_LIMIT_REQUESTS_PER_HOUR',
    'API_RATE_LIMIT_REQUESTS_PER_DAY',
    'API_RETRY_MAX_RETRIES',
    'API_RETRY_MAX_BACKOFF_MS',
    'API_KEY_HEALTH_CHECK_INTERVAL_MS',
  ]

  for (const config of numericConfigs) {
    const value = process.env[config]
    if (value && isNaN(parseInt(value))) {
      errors.push(`${config} must be a valid number, got: ${value}`)
    }
  }

  const adminEmail = process.env.RATE_LIMIT_ADMIN_EMAIL
  if (adminEmail && !adminEmail.includes('@')) {
    errors.push('RATE_LIMIT_ADMIN_EMAIL must be a valid email address')
  }

  const floatConfigs = ['API_RETRY_BACKOFF_MULTIPLIER']
  for (const config of floatConfigs) {
    const value = process.env[config]
    if (value && isNaN(parseFloat(value))) {
      errors.push(`${config} must be a valid number, got: ${value}`)
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

export function getEnvironmentSummary() {
  const primaryKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  const additionalKeys = []

  for (let i = 2; i <= 10; i++) {
    if (process.env[`GOOGLE_GENERATIVE_AI_API_KEY_${i}`]) {
      additionalKeys.push(`GOOGLE_GENERATIVE_AI_API_KEY_${i}`)
    }
  }

  const multipleKeys = process.env.GOOGLE_AI_API_KEYS
  const openaiPrimary = process.env.OPENAI_API_KEY
  const openaiAdditional = []
  for (let i = 2; i <= 10; i++) {
    if (process.env[`OPENAI_API_KEY_${i}`]) {
      openaiAdditional.push(`OPENAI_API_KEY_${i}`)
    }
  }
  const openaiMultiple = process.env.OPENAI_API_KEYS
  return {
    hasRedis: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    apiKeys: {
      primary: primaryKey ? 'Set' : 'Not set',
      additional: additionalKeys.length,
      multipleKeysFormat: multipleKeys ? 'Set' : 'Not set',
      totalAvailable: [
        primaryKey,
        ...additionalKeys.map(key => process.env[key]),
        ...(multipleKeys?.split(',') || []),
        openaiPrimary,
        ...openaiAdditional.map(key => process.env[key]),
        ...(openaiMultiple?.split(',') || []),
      ].filter(Boolean).length,
    },
    rateLimit: {
      requestsPerMinute: process.env.API_RATE_LIMIT_REQUESTS_PER_MINUTE || 'default (60)',
      requestsPerHour: process.env.API_RATE_LIMIT_REQUESTS_PER_HOUR || 'default (1000)',
      requestsPerDay: process.env.API_RATE_LIMIT_REQUESTS_PER_DAY || 'default (50000)',
    },
    rotation: {
      enabled: process.env.API_KEY_ROTATION_ENABLED !== 'false',
      rotateOnRateLimit: process.env.API_KEY_ROTATE_ON_RATE_LIMIT !== 'false',
    },
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
