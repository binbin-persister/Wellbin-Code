import { sleep } from '../../../utils/sleep.js'

const DEFAULT_OPENAI_MAX_RETRIES = 6
const DEFAULT_CUSTOM_GATEWAY_CONCURRENCY = 1
const RETRY_BASE_DELAY_MS = 750
const RETRY_MAX_DELAY_MS = 30_000

let activeOpenAIRequests = 0
const openAIRequestWaiters: Array<() => void> = []

function parseNonNegativeInt(
  rawValue: string | undefined,
  fallback: number,
): number {
  if (rawValue === undefined) {
    return fallback
  }

  const value = Number.parseInt(rawValue, 10)
  if (!Number.isFinite(value) || value < 0) {
    return fallback
  }

  return value
}

function isOfficialOpenAIBaseUrl(baseUrl: string | undefined): boolean {
  if (!baseUrl) {
    return false
  }

  try {
    const url = new URL(baseUrl)
    return url.hostname === 'api.openai.com'
  } catch {
    return false
  }
}

function getErrorStatus(error: unknown): number | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
  ) {
    return error.status
  }

  return undefined
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function getRetryAfterMs(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('headers' in error)) {
    return null
  }

  const headers = error.headers
  let retryAfter: string | null | undefined

  if (headers instanceof Headers) {
    retryAfter = headers.get('retry-after')
  } else if (
    typeof headers === 'object' &&
    headers !== null &&
    'retry-after' in headers
  ) {
    const headerValue = headers['retry-after']
    retryAfter = typeof headerValue === 'string' ? headerValue : null
  }

  if (!retryAfter) {
    return null
  }

  const seconds = Number.parseInt(retryAfter, 10)
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000)
  }

  const retryAt = Date.parse(retryAfter)
  if (!Number.isNaN(retryAt)) {
    return Math.max(0, retryAt - Date.now())
  }

  return null
}

export function getOpenAIMaxRetries(): number {
  return parseNonNegativeInt(
    process.env.OPENAI_MAX_RETRIES ?? process.env.CLAUDE_CODE_MAX_RETRIES,
    DEFAULT_OPENAI_MAX_RETRIES,
  )
}

export function getOpenAIConcurrencyLimit(): number {
  if (process.env.OPENAI_MAX_CONCURRENCY !== undefined) {
    return parseNonNegativeInt(process.env.OPENAI_MAX_CONCURRENCY, 0)
  }

  if (!process.env.OPENAI_BASE_URL) {
    return 0
  }

  return isOfficialOpenAIBaseUrl(process.env.OPENAI_BASE_URL)
    ? 0
    : DEFAULT_CUSTOM_GATEWAY_CONCURRENCY
}

export function isRetryableOpenAIError(error: unknown): boolean {
  const status = getErrorStatus(error)
  if (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    (status !== undefined && status >= 500)
  ) {
    return true
  }

  const message = getErrorMessage(error).toLowerCase()
  return (
    message.includes('concurrency limit exceeded') ||
    message.includes('rate limit') ||
    message.includes('too many requests')
  )
}

export function getOpenAIRetryDelayMs(
  attempt: number,
  error: unknown,
): number {
  const retryAfterMs = getRetryAfterMs(error)
  if (retryAfterMs !== null) {
    return retryAfterMs
  }

  const baseDelay = Math.min(
    RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1),
    RETRY_MAX_DELAY_MS,
  )
  const jitter = Math.random() * 0.25 * baseDelay
  return Math.round(baseDelay + jitter)
}

export async function retryOpenAIRequest<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const maxRetries = getOpenAIMaxRetries()

  for (let attempt = 1; ; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (signal?.aborted || attempt > maxRetries || !isRetryableOpenAIError(error)) {
        throw error
      }

      await sleep(getOpenAIRetryDelayMs(attempt, error), signal, {
        throwOnAbort: true,
      })
    }
  }
}

export async function acquireOpenAIRequestSlot(
  signal?: AbortSignal,
): Promise<() => void> {
  const limit = getOpenAIConcurrencyLimit()
  if (limit <= 0) {
    return () => {}
  }

  if (activeOpenAIRequests < limit) {
    activeOpenAIRequests++
    return createRelease()
  }

  await new Promise<void>((resolve, reject) => {
    const waiter = () => {
      cleanup()
      activeOpenAIRequests++
      resolve()
    }

    const onAbort = () => {
      cleanup()
      reject(new Error('aborted'))
    }

    const cleanup = () => {
      const index = openAIRequestWaiters.indexOf(waiter)
      if (index >= 0) {
        openAIRequestWaiters.splice(index, 1)
      }
      signal?.removeEventListener('abort', onAbort)
    }

    openAIRequestWaiters.push(waiter)
    signal?.addEventListener('abort', onAbort, { once: true })
  })

  return createRelease()
}

function createRelease(): () => void {
  let released = false

  return () => {
    if (released) {
      return
    }
    released = true

    activeOpenAIRequests = Math.max(0, activeOpenAIRequests - 1)
    const next = openAIRequestWaiters.shift()
    next?.()
  }
}

export function __resetOpenAIRequestControlForTests(): void {
  activeOpenAIRequests = 0
  openAIRequestWaiters.length = 0
}
