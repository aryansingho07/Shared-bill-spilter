import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Bill, Home, Member, Share } from './types'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.json({ status: 'ok' }))

// Every failure, including malformed JSON and unknown routes, has the same shape.
app.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status)
  console.error('Request failed', error)
  return c.json({ error: 'Something went wrong. Please try again.' }, 500)
})
app.notFound((c) => c.json({ error: 'Route not found' }, 404))

async function body(request: Request): Promise<Record<string, unknown>> {
  let value: unknown
  try {
    value = await request.json()
  } catch {
    throw new HTTPException(400, { message: 'Request body must be valid JSON' })
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HTTPException(400, { message: 'Request body must be a JSON object' })
  }
  return value as Record<string, unknown>
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) {
    throw new HTTPException(422, { message: `${label} must contain 1 to 100 characters` })
  }
  return value.trim()
}

async function requireHome(db: D1Database, id: string): Promise<Home> {
  const home = await db.prepare('SELECT id, name FROM homes WHERE id = ?').bind(id).first<Home>()
  if (!home) throw new HTTPException(404, { message: 'Home not found' })
  return home
}

const shareColumns = 'id, member_id AS memberId, amount_cents AS amountCents, paid_at AS paidAt'

app.get('/api/homes', async (c) => {
  const homes = await c.env.DB.prepare('SELECT id, name FROM homes ORDER BY sequence').all<Home>()
  return c.json({ homes: homes.results })
})

app.post('/api/homes', async (c) => {
  const name = text((await body(c.req.raw)).name, 'Name')
  const home = { id: crypto.randomUUID(), name }
  await c.env.DB.prepare('INSERT INTO homes (id, name) VALUES (?, ?)').bind(home.id, name).run()
  return c.json(home, 201)
})

app.get('/api/homes/:homeId', async (c) => {
  const home = await requireHome(c.env.DB, c.req.param('homeId'))
  const members = await c.env.DB.prepare(
    'SELECT id, home_id AS homeId, name FROM members WHERE home_id = ? ORDER BY sequence',
  )
    .bind(home.id)
    .all<Member>()
  return c.json({ ...home, members: members.results })
})

app.post('/api/homes/:homeId/members', async (c) => {
  const home = await requireHome(c.env.DB, c.req.param('homeId'))
  const name = text((await body(c.req.raw)).name, 'Name')
  const member = { id: crypto.randomUUID(), homeId: home.id, name }
  await c.env.DB.prepare('INSERT INTO members (id, home_id, name) VALUES (?, ?, ?)')
    .bind(member.id, home.id, name)
    .run()
  return c.json(member, 201)
})

app.post('/api/homes/:homeId/bills', async (c) => {
  const db = c.env.DB
  const home = await requireHome(db, c.req.param('homeId'))
  const input = await body(c.req.raw)
  const title = text(input.title, 'Title')
  const total = input.totalCents
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total <= 0) {
    throw new HTTPException(422, {
      message: 'Total must be a positive, safe whole number of cents',
    })
  }
  const member = await db
    .prepare('SELECT id FROM members WHERE home_id = ? LIMIT 1')
    .bind(home.id)
    .first()
  if (!member)
    throw new HTTPException(422, { message: 'Add at least one member before creating a bill' })
  const bill = {
    id: crypto.randomUUID(),
    homeId: home.id,
    title,
    totalCents: total,
    createdAt: new Date().toISOString(),
  }
  // D1 batch is one transaction. The member snapshot and integer split happen in
  // a single SQL statement, so another request cannot leave a partial bill.
  // D1 binds JS numbers as REAL; CAST makes division use integer arithmetic.
  const results = await db.batch([
    db
      .prepare(
        'INSERT INTO bills (id, home_id, title, total_cents, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(bill.id, home.id, title, total, bill.createdAt),
    db
      .prepare(`INSERT INTO shares (id, bill_id, home_id, member_id, amount_cents)
      SELECT lower(hex(randomblob(16))), ?, ?, id,
        (CAST(? AS INTEGER) / member_count) + CASE WHEN position <= (? % member_count) THEN 1 ELSE 0 END
      FROM (
        SELECT id, COUNT(*) OVER () AS member_count,
          ROW_NUMBER() OVER (ORDER BY sequence) AS position
        FROM members WHERE home_id = ?
      )`)
      .bind(bill.id, home.id, total, total, home.id),
    db
      .prepare(`SELECT s.id, s.member_id AS memberId, s.amount_cents AS amountCents, s.paid_at AS paidAt
      FROM shares s JOIN members m ON m.id = s.member_id
      WHERE s.bill_id = ? ORDER BY m.sequence`)
      .bind(bill.id),
  ])
  return c.json({ ...bill, shares: results[2]?.results as Share[] }, 201)
})

app.get('/api/homes/:homeId/bills', async (c) => {
  const home = await requireHome(c.env.DB, c.req.param('homeId'))
  // Read both collections in one batch for a consistent view during payment.
  const [billRows, shareRows] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT id, home_id AS homeId, title, total_cents AS totalCents,
      created_at AS createdAt FROM bills WHERE home_id = ? ORDER BY sequence DESC`).bind(home.id),
    c.env.DB.prepare(`SELECT s.id, s.bill_id AS billId, s.member_id AS memberId,
      s.amount_cents AS amountCents, s.paid_at AS paidAt
      FROM shares s JOIN members m ON m.id = s.member_id
      WHERE s.home_id = ? ORDER BY m.sequence`).bind(home.id),
  ])
  const shares = (shareRows?.results ?? []) as (Share & { billId: string })[]
  const bills = ((billRows?.results ?? []) as Omit<Bill, 'shares'>[]).map((bill) => ({
    ...bill,
    shares: shares
      .filter((share) => share.billId === bill.id)
      .map(({ billId: _, ...share }) => share),
  }))
  return c.json({ bills })
})

app.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const key = c.req.header('Idempotency-Key')
  if (!key?.trim()) throw new HTTPException(400, { message: 'Idempotency-Key header is required' })
  const { billId, shareId } = c.req.param()
  // Compare-and-set in SQLite: only the request that finds an unpaid row writes.
  // Never overwrite an existing key or timestamp, even on an identical retry.
  const paid = await c.env.DB.prepare(`UPDATE shares SET paid_at = ?, payment_key = ?
    WHERE id = ? AND bill_id = ? AND paid_at IS NULL RETURNING ${shareColumns}`)
    .bind(new Date().toISOString(), key, shareId, billId)
    .first<Share>()
  if (paid) return c.json(paid)
  const existing = await c.env.DB.prepare(`SELECT ${shareColumns}, payment_key AS paymentKey
    FROM shares WHERE id = ? AND bill_id = ?`)
    .bind(shareId, billId)
    .first<Share & { paymentKey: string | null }>()
  if (!existing) throw new HTTPException(404, { message: 'Bill or share not found' })
  if (existing.paymentKey !== key) {
    throw new HTTPException(409, {
      message: 'This share has already been paid with a different key',
    })
  }
  const { paymentKey: _, ...share } = existing
  return c.json(share)
})

app.get('/api/homes/:homeId/balances', async (c) => {
  const home = await requireHome(c.env.DB, c.req.param('homeId'))
  const balances = await c.env.DB.prepare(`SELECT m.id AS memberId, m.name,
    COALESCE(SUM(s.amount_cents), 0) AS outstandingCents
    FROM members m LEFT JOIN shares s ON s.member_id = m.id AND s.paid_at IS NULL
    WHERE m.home_id = ? GROUP BY m.sequence ORDER BY m.sequence`)
    .bind(home.id)
    .all<{ memberId: string; name: string; outstandingCents: number }>()
  return c.json({ balances: balances.results })
})

export default app
