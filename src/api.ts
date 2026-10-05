export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter: number | null = null,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/${path}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...init,
      headers: {
        ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('The server is unavailable. Please try again in a moment.', 0)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = body?.detail
    const retryAfterHeader = response.headers.get('Retry-After')
    const retryAfter = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : null
    throw new ApiError(
      response.status === 429 && typeof detail !== 'string'
        ? `You’ve made several requests quickly. Please wait ${retryAfter || 30} seconds and try again.`
        : response.status >= 500
          ? 'The server is temporarily unavailable. Please try again in a moment.'
          : typeof detail === 'string'
            ? detail
            : response.status === 422
              ? 'Check the details you entered and try again.'
              : 'Something went wrong. Please try again.',
      response.status,
      Number.isFinite(retryAfter) ? retryAfter : null,
    )
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}
