export type { Bill, Home, Member, Share } from '../../../api/src/types'
export type Balance = { memberId: string; name: string; outstandingCents: number }

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new Error('Could not reach the server. Check your connection and try again.')
  }
  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error('The server returned an unexpected response. Please try again.')
  }
  if (!response.ok) {
    const detail =
      typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'Something went wrong. Please try again.'
    throw new Error(detail)
  }
  return data as T
}

export function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

// Convert the string directly to cents, without floating-point multiplication.
export function parseAmount(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null
  const [dollars = '', fraction = ''] = value.trim().split('.')
  const cents = Number(`${dollars}${fraction.padEnd(2, '0')}`)
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

export function paymentKey(shareId: string): string {
  const storageKey = `split-payment:${shareId}`
  try {
    const existing = sessionStorage.getItem(storageKey)
    if (existing) return existing
    const key = crypto.randomUUID()
    sessionStorage.setItem(storageKey, key)
    return key
  } catch {
    return crypto.randomUUID()
  }
}
