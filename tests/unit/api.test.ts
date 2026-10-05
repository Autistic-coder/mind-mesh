import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../src/api'

afterEach(() => vi.restoreAllMocks())

describe('API rate limits', () => {
  it('surfaces Retry-After as a recoverable error without retrying automatically', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Please wait before trying again.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '27' },
      }),
    )

    const request = api('ml/runs', { method: 'POST', body: '{}' })
    await expect(request).rejects.toMatchObject({
      status: 429,
      retryAfter: 27,
      message: 'Please wait before trying again.',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not expose database details from a server failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'postgresql://user:secret@example.invalid' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(api('workspace')).rejects.toMatchObject({
      status: 503,
      message: 'The server is temporarily unavailable. Please try again in a moment.',
    })
  })
})
