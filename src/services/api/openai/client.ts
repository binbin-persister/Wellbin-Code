import OpenAI from 'openai'
import { getProxyFetchOptions } from 'src/utils/proxy.js'

/**
 * Environment variables:
 *
 * OPENAI_API_KEY: Required. API key for the OpenAI-compatible endpoint.
 * OPENAI_BASE_URL: Recommended. Base URL for the endpoint (e.g. http://localhost:11434/v1).
 * OPENAI_ORG_ID: Optional. Organization ID.
 * OPENAI_PROJECT_ID: Optional. Project ID.
 */

let cachedClient: OpenAI | null = null
let cachedClientKey: string | null = null

function normalizeOpenAIBaseURL(baseURL: string | undefined): string | undefined {
  if (!baseURL) {
    return undefined
  }

  try {
    const url = new URL(baseURL)

    // Most OpenAI-compatible gateways expose the API under /v1.
    // When users paste only the origin, upgrade it to the conventional base.
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = '/v1'
      return url.toString()
    }

    return url.toString()
  } catch {
    return baseURL
  }
}

function buildOpenAIFetch(fetchOverride?: typeof fetch): typeof fetch {
  const innerFetch = fetchOverride ?? globalThis.fetch

  return (input, init) => {
    const proxyFetchOptions = getProxyFetchOptions({ forAnthropicAPI: false })
    return innerFetch(input, {
      ...proxyFetchOptions,
      ...init,
    })
  }
}

function getClientCacheKey(options: {
  apiKey: string
  baseURL: string | undefined
  organization: string | undefined
  project: string | undefined
  timeoutMs: number
}): string {
  return JSON.stringify(options)
}

export function getOpenAIClient(options?: {
  maxRetries?: number
  fetchOverride?: typeof fetch
  source?: string
}): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY || ''
  const baseURL = normalizeOpenAIBaseURL(process.env.OPENAI_BASE_URL)
  const timeoutMs = parseInt(process.env.API_TIMEOUT_MS || String(600 * 1000), 10)
  const cacheKey = getClientCacheKey({
    apiKey,
    baseURL,
    organization: process.env.OPENAI_ORG_ID,
    project: process.env.OPENAI_PROJECT_ID,
    timeoutMs,
  })

  if (!options?.fetchOverride && cachedClient && cachedClientKey === cacheKey) {
    return cachedClient
  }

  const client = new OpenAI({
    apiKey,
    ...(baseURL && { baseURL }),
    // queryModelOpenAI applies custom retry/backoff so we can also retry
    // message-based concurrency-limit errors from OpenAI-compatible gateways.
    maxRetries: options?.maxRetries ?? 0,
    timeout: timeoutMs,
    dangerouslyAllowBrowser: true,
    ...(process.env.OPENAI_ORG_ID && { organization: process.env.OPENAI_ORG_ID }),
    ...(process.env.OPENAI_PROJECT_ID && { project: process.env.OPENAI_PROJECT_ID }),
    // The OpenAI SDK does not consume a `fetchOptions` constructor field, so
    // proxy/TLS options must be injected via a wrapped fetch implementation.
    fetch: buildOpenAIFetch(options?.fetchOverride),
  })

  if (!options?.fetchOverride) {
    cachedClient = client
    cachedClientKey = cacheKey
  }

  return client
}

/** Clear the cached client (useful when env vars change). */
export function clearOpenAIClientCache(): void {
  cachedClient = null
  cachedClientKey = null
}
