import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  __resetOpenAIRequestControlForTests,
  acquireOpenAIRequestSlot,
  getOpenAIConcurrencyLimit,
  getOpenAIMaxRetries,
  isRetryableOpenAIError,
} from '../requestControl.js'

describe('requestControl', () => {
  const originalEnv = {
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_MAX_CONCURRENCY: process.env.OPENAI_MAX_CONCURRENCY,
    OPENAI_MAX_RETRIES: process.env.OPENAI_MAX_RETRIES,
    CLAUDE_CODE_MAX_RETRIES: process.env.CLAUDE_CODE_MAX_RETRIES,
  }

  beforeEach(() => {
    delete process.env.OPENAI_BASE_URL
    delete process.env.OPENAI_MAX_CONCURRENCY
    delete process.env.OPENAI_MAX_RETRIES
    delete process.env.CLAUDE_CODE_MAX_RETRIES
    __resetOpenAIRequestControlForTests()
  })

  afterEach(() => {
    Object.assign(process.env, originalEnv)
    __resetOpenAIRequestControlForTests()
  })

  test('defaults custom gateways to single-flight concurrency', () => {
    process.env.OPENAI_BASE_URL = 'https://gateway.example.com/v1'
    expect(getOpenAIConcurrencyLimit()).toBe(1)
  })

  test('keeps concurrency unlimited when no custom gateway is configured', () => {
    expect(getOpenAIConcurrencyLimit()).toBe(0)
  })

  test('respects explicit concurrency override', () => {
    process.env.OPENAI_BASE_URL = 'https://gateway.example.com/v1'
    process.env.OPENAI_MAX_CONCURRENCY = '3'
    expect(getOpenAIConcurrencyLimit()).toBe(3)
  })

  test('queues additional requests when concurrency is capped', async () => {
    process.env.OPENAI_MAX_CONCURRENCY = '1'

    const releaseFirst = await acquireOpenAIRequestSlot()
    let acquiredSecond = false
    const secondPromise = acquireOpenAIRequestSlot().then(release => {
      acquiredSecond = true
      return release
    })

    await Promise.resolve()
    expect(acquiredSecond).toBe(false)

    releaseFirst()

    const releaseSecond = await secondPromise
    expect(acquiredSecond).toBe(true)
    releaseSecond()
  })

  test('prefers OPENAI_MAX_RETRIES over shared retry env', () => {
    process.env.CLAUDE_CODE_MAX_RETRIES = '4'
    process.env.OPENAI_MAX_RETRIES = '7'
    expect(getOpenAIMaxRetries()).toBe(7)
  })

  test('treats concurrency-limit messages as retryable', () => {
    expect(
      isRetryableOpenAIError(
        new Error('Concurrency limit exceeded for user, please retry later'),
      ),
    ).toBe(true)
  })
})
