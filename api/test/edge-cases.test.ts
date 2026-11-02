import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { type Balance, type Bill, call, createBill, createHome, type Share } from './helpers'

function pay(billId: string, shareId: string, key: string) {
  return call<Share>('POST', `/api/bills/${billId}/shares/${shareId}/pay`, {
    headers: { 'Idempotency-Key': key },
  })
}

describe('validation and boundaries', () => {
  it.each([{}, { name: '' }, { name: '   ' }, { name: 42 }, { name: 'a'.repeat(101) }])(
    'rejects an invalid home name: %j',
    async (body) => {
      const result = await call<{ error: string }>('POST', '/api/homes', { body })
      expect(result.status).toBe(422)
      expect(result.body.error).toEqual(expect.any(String))
    },
  )

  it.each([null, [], 'home'])('rejects a non-object JSON body: %j', async (body) => {
    const result = await call<{ error: string }>('POST', '/api/homes', { body })
    expect(result.status).toBe(400)
    expect(result.body.error).toEqual(expect.any(String))
  })

  it('trims names and permits different members with the same name', async () => {
    const { homeId, members } = await createHome([' Asha ', 'Asha'])
    expect(members.map((member) => member.name)).toEqual(['Asha', 'Asha'])
    const result = await createBill(homeId, 1)
    expect(result.body.shares.map((share) => share.amountCents)).toEqual([1, 0])
  })

  it('returns zero balances before any bills exist', async () => {
    const { homeId } = await createHome(['Asha', 'Ben'])
    const result = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(result.body.balances.map((balance) => balance.outstandingCents)).toEqual([0, 0])
  })

  it('returns an empty list for an empty home', async () => {
    const { homeId } = await createHome([])
    expect((await call('GET', `/api/homes/${homeId}/balances`)).body).toEqual({ balances: [] })
    expect((await call('GET', `/api/homes/${homeId}/bills`)).body).toEqual({ bills: [] })
    expect((await createBill(homeId, 100)).status).toBe(422)
    expect((await call('GET', `/api/homes/${homeId}/bills`)).body).toEqual({ bills: [] })
  })

  it('rejects unsafe integers and blank titles', async () => {
    const { homeId } = await createHome(['Asha'])
    expect((await createBill(homeId, Number.MAX_SAFE_INTEGER + 1)).status).toBe(422)
    expect(
      (
        await call('POST', `/api/homes/${homeId}/bills`, {
          body: { title: ' ', totalCents: 100 },
        })
      ).status,
    ).toBe(422)
  })

  it('splits the largest safe integer exactly', async () => {
    const { homeId } = await createHome(['Asha', 'Ben', 'Chitra'])
    const result = await createBill(homeId, Number.MAX_SAFE_INTEGER)
    expect(result.status).toBe(201)
    expect(result.body.shares.map((share) => share.amountCents)).toEqual([
      3002399751580331, 3002399751580330, 3002399751580330,
    ])
  })

  it('keeps old splits unchanged when someone joins later', async () => {
    const { homeId } = await createHome(['Asha', 'Ben'])
    const first = await createBill(homeId, 101)
    await call('POST', `/api/homes/${homeId}/members`, { body: { name: 'Chitra' } })
    const second = await createBill(homeId, 101)
    const listed = await call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)
    expect(listed.body.bills.find((bill) => bill.id === first.body.id)?.shares).toEqual(
      first.body.shares,
    )
    expect(second.body.shares.map((share) => share.amountCents)).toEqual([34, 34, 33])
  })

  it('returns a JSON error for unknown routes', async () => {
    const result = await call('GET', '/api/unknown')
    expect(result.status).toBe(404)
    expect(result.body).toEqual({ error: 'Route not found' })
  })
})

describe('payment concurrency and isolation', () => {
  it('allows only one different key to win concurrent payment requests', async () => {
    const { homeId } = await createHome(['Asha', 'Ben'])
    const bill = (await createBill(homeId, 1000)).body
    const share = bill.shares[0]
    if (!share) throw new Error('Expected a share')
    const results = await Promise.all(
      Array.from({ length: 8 }, () => pay(bill.id, share.id, crypto.randomUUID())),
    )
    expect(results.filter((result) => result.status === 200)).toHaveLength(1)
    expect(results.filter((result) => result.status === 409)).toHaveLength(7)
    const balances = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(balances.body.balances.map((balance) => balance.outstandingCents)).toEqual([0, 500])
  })

  it('returns the identical result to simultaneous same-key retries', async () => {
    const { homeId } = await createHome(['Asha'])
    const bill = (await createBill(homeId, 10)).body
    const share = bill.shares[0]
    if (!share) throw new Error('Expected a share')
    const key = crypto.randomUUID()
    const results = await Promise.all(Array.from({ length: 5 }, () => pay(bill.id, share.id, key)))
    for (const result of results) {
      expect(result.status).toBe(200)
      expect(result.body).toEqual(results[0]?.body)
    }
  })

  it('cannot pay a share through another bill, and scopes keys to a share', async () => {
    const { homeId } = await createHome(['Asha'])
    const first = (await createBill(homeId, 100)).body
    const second = (await createBill(homeId, 200)).body
    const firstShare = first.shares[0]
    const secondShare = second.shares[0]
    if (!firstShare || !secondShare) throw new Error('Expected shares')
    expect((await pay(second.id, firstShare.id, 'reused-key')).status).toBe(404)
    expect((await pay(first.id, firstShare.id, 'reused-key')).status).toBe(200)
    expect((await pay(second.id, secondShare.id, 'reused-key')).status).toBe(200)
  })

  it('pays a zero-cent share and rejects a whitespace key', async () => {
    const { homeId } = await createHome(['Asha', 'Ben'])
    const bill = (await createBill(homeId, 1)).body
    const share = bill.shares[1]
    if (!share) throw new Error('Expected a zero-cent share')
    expect((await pay(bill.id, share.id, '   ')).status).toBe(400)
    expect((await pay(bill.id, share.id, 'zero-share')).body.paidAt).toEqual(expect.any(String))
  })

  it('keeps shares isolated between homes', async () => {
    const first = await createHome(['Asha'])
    const second = await createHome(['Ben'])
    await createBill(first.homeId, 100)
    const result = await call<{ balances: Balance[] }>(
      'GET',
      `/api/homes/${second.homeId}/balances`,
    )
    expect(result.body.balances[0]?.outstandingCents).toBe(0)
  })
})

describe('database safeguards', () => {
  it('rolls back an entire batch when a later share violates a constraint', async () => {
    const { homeId, members } = await createHome(['Asha'])
    const id = crypto.randomUUID()
    await expect(
      env.DB.batch([
        env.DB.prepare(
          'INSERT INTO bills (id, home_id, title, total_cents, created_at) VALUES (?, ?, ?, ?, ?)',
        ).bind(id, homeId, 'Rollback', 100, new Date().toISOString()),
        env.DB.prepare(
          'INSERT INTO shares (id, bill_id, home_id, member_id, amount_cents) VALUES (?, ?, ?, ?, ?)',
        ).bind(crypto.randomUUID(), id, homeId, members[0]?.id, -1),
      ]),
    ).rejects.toThrow()
    expect(await env.DB.prepare('SELECT id FROM bills WHERE id = ?').bind(id).first()).toBeNull()
  })

  it('rejects cross-home shares at the database level', async () => {
    const first = await createHome(['Asha'])
    const second = await createHome(['Ben'])
    const bill = (await createBill(first.homeId, 100)).body
    await expect(
      env.DB.prepare(
        'INSERT INTO shares (id, bill_id, home_id, member_id, amount_cents) VALUES (?, ?, ?, ?, ?)',
      )
        .bind(crypto.randomUUID(), bill.id, first.homeId, second.members[0]?.id, 100)
        .run(),
    ).rejects.toThrow()
  })
})
