const SENSITIVE_KEY = /cookie|token|md5|authorization|secret|password|set-cookie/i
const SENSITIVE_TEXT =
  /((?:cookie|authorization|x-nos-token|set-cookie)\s*[:=]\s*)[^\s,;]+/gi

function sanitizeText(value: string): string {
  return value.replace(SENSITIVE_TEXT, '$1[redacted]')
}

function sanitizeError(error: Error): Record<string, unknown> {
  const candidate = error as Error & {
    code?: unknown
    config?: { url?: unknown; method?: unknown }
    response?: { status?: unknown; statusText?: unknown }
  }
  return {
    name: error.name,
    message: sanitizeText(error.message),
    stack: error.stack ? sanitizeText(error.stack) : undefined,
    code: candidate.code,
    request: candidate.config
      ? {
          url: candidate.config.url,
          method: candidate.config.method
        }
      : undefined,
    response: candidate.response
      ? {
          status: candidate.response.status,
          statusText: candidate.response.statusText
        }
      : undefined
  }
}

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return sanitizeError(value)
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return `[Buffer ${value.byteLength} bytes]`
  if (typeof value === 'string') return sanitizeText(value)
  if (value === null || typeof value !== 'object') return value
  if (depth >= 5) return '[object]'
  if (Array.isArray(value)) return value.map(item => sanitizeForLog(item, depth + 1))

  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      result[key] = '[redacted]'
    } else {
      result[key] = sanitizeForLog(item, depth + 1)
    }
  }
  return result
}
