import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  clearOpenAIClientCache,
  getOpenAIClient,
} from '../client.js'

describe('getOpenAIClient', () => {
  const originalEnv = {
    API_TIMEOUT_MS: process.env.API_TIMEOUT_MS,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_ORG_ID: process.env.OPENAI_ORG_ID,
    OPENAI_PROJECT_ID: process.env.OPENAI_PROJECT_ID,
  }

  beforeEach(() => {
    delete process.env.API_TIMEOUT_MS
    delete process.env.HTTPS_PROXY
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_BASE_URL
    delete process.env.OPENAI_ORG_ID
    delete process.env.OPENAI_PROJECT_ID
    clearOpenAIClientCache()
  })

  afterEach(() => {
    Object.assign(process.env, originalEnv)
    clearOpenAIClientCache()
  })

  test('normalizes origin-only base URLs to /v1', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.OPENAI_BASE_URL = 'https://gateway.example.com'

    let requestUrl = ''
    const client = getOpenAIClient({
      fetchOverride: async (input, init) => {
        requestUrl = input instanceof Request ? input.url : String(input)
        return new Response(JSON.stringify({ object: 'list', data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    })

    await client.models.list()

    expect(requestUrl).toBe('https://gateway.example.com/v1/models')
  })

  test('injects proxy fetch options into each request', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.OPENAI_BASE_URL = 'https://gateway.example.com/v1'
    process.env.HTTPS_PROXY = 'http://127.0.0.1:8080'

    let requestInit: RequestInit | undefined
    const client = getOpenAIClient({
      fetchOverride: async (_input, init) => {
        requestInit = init
        return new Response(JSON.stringify({ object: 'list', data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    })

    await client.models.list()

    expect((requestInit as RequestInit & { proxy?: string }).proxy).toBe(
      'http://127.0.0.1:8080',
    )
  })

  test('rebuilds the cached client when env-based routing changes', () => {
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.OPENAI_BASE_URL = 'https://gateway-one.example.com/v1'

    const first = getOpenAIClient()

    process.env.OPENAI_BASE_URL = 'https://gateway-two.example.com/v1'

    const second = getOpenAIClient()

    expect(second).not.toBe(first)
  })
})
