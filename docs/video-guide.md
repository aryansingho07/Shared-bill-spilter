# Three-minute walkthrough guide

Use this as preparation for your own recording. Show the code and running app,
and explain the behavior in your own words.

## 0:00–0:30 — Architecture

Show `api/src/index.ts`, `api/migrations/0001_init.sql`, and
`web/src/routes/index.tsx`. Explain that React and TanStack Router call a Hono
Worker through Vite’s development proxy. D1 persists homes, ordered members,
bills, and shares. All API errors use `{ error: string }`.

## 0:30–1:15 — Create and split

Create a home. Show that a bill needs at least one member. Add Asha, Ben, and
Chitra, in that order. Create a $10.00 bill. Explain the integer calculation:
1000 / 3 gives a base of 333 cents with one cent remaining. The first member
gets 334, then the others get 333. Zero, negative, fractional-cent, and unsafe
integer API totals are rejected. A positive bill smaller than the member count
can correctly include zero-cent shares.

Show that bill and share creation are a D1 batch transaction. Named CHECK,
UNIQUE, and foreign-key constraints provide a second layer of protection.

## 1:15–2:00 — Pay and retry

Mark one share paid and show the reduced balance. Explain the conditional
UPDATE: only an unpaid row can be changed. The winning timestamp and key are
stored together. The same key returns the same saved result; another key gets
409. Two concurrent different keys cannot both win. A share must belong to the
bill in the URL, or the request returns 404.

Show the concurrency tests in `api/test/edge-cases.test.ts` and the test result.
The tests submit multiple requests together rather than relying on timing sleeps.

## 2:00–2:35 — Errors and slow requests

Explain that the client shows loading while waiting and times out after 15
seconds. Payment buttons disable while pending. A failed request displays an
inline message and leaves the share visually unpaid. Its key is reused on retry,
so a response lost after the server committed can be recovered without a second
payment. A refresh checks whether another client paid the share.

Use browser network controls if you want to demonstrate an unavailable API.
Do not claim the app transfers real money: it only records settlement.

## 2:35–3:00 — Trade-off and verification

Explain one choice: direct React state is easy to follow for one page, while a
larger app would benefit from a query cache. Data is refreshed on demand rather
than through live subscriptions. Show `pnpm check`, `pnpm typecheck`, `pnpm test`,
and `pnpm build` passing. Mention the absence of production authentication.

Disclose Codex assistance in the application form and be ready to explain the
SQL split, conditional payment update, database constraints, and error handling.
