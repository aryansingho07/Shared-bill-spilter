# SDE Intern Assignment: Shared Bill Splitter

## Solution

The implementation is in `api/src/` and `web/src/`. The original assignment and
visible tests are retained below. Start with Node.js 22.13+ and pnpm 11+:

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173. Create a home, add housemates, then add and split a
bill. Each unpaid share has a **Mark paid** button. The home is kept in the URL,
so refreshing or opening that URL returns to the same home. Data is persisted
in local D1, rather than browser storage. The interface displays USD; the API
stores and accepts only integer cents.

On Windows, you can also run `setup-project.cmd` once, then `start-project.cmd`
from Command Prompt or by double-clicking the files. Keep the server window open
while using the app. Press Ctrl+C to stop it.

Repository: [aryansingho07/Shared-bill-spilter](https://github.com/aryansingho07/Shared-bill-spilter).

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm build
```

### Decisions

1. **Keep ordering and money in the database.** Members have a monotonic integer
   sequence. A SQL window query divides the total using integer arithmetic and
   gives the remainder to the first members. Bill and share inserts run in one
   D1 batch transaction, so a failed insert rolls the entire bill back. Later
   members do not change earlier bills.
2. **Make payment an atomic conditional write.** One `UPDATE ... WHERE paid_at
   IS NULL RETURNING ...` sets both the timestamp and the idempotency key.
   Competing keys receive 409, and retries with the winning key return the
   stored result. Keys are scoped to a share. No process-local locks are used
   for server correctness. The browser retains its key for retries, including
   after an uncertain network response.
3. **Prefer a small, explicit client.** React state and a typed fetch wrapper
   cover this one-page app without an additional state or form library. Requests
   time out after 15 seconds and stale requests are aborted. A share changes to
   paid only after API success. A failed payment leaves the displayed share
   unpaid with an inline retry/refresh message. Three small read endpoints let
   the client discover homes, members, and bills after refresh.

### Architecture and data safeguards

Browser → Vite `/api` proxy → Hono Worker → D1 SQLite.

- `api/migrations/0001_init.sql` defines the complete schema. Named constraints
  include `bills_total_valid` (positive safe integer totals),
  `shares_amount_valid` (nonnegative integer shares),
  `shares_bill_member_unique` (one share per member per bill), and
  `shares_payment_consistent` (key and timestamp must be stored together).
- Composite foreign keys `shares_bill_home_fk` and `shares_member_home_fk`
  prevent attaching a share to a bill or member from a different home.
- A database trigger prevents creating bills in a home with no members.
- `api/test/edge-cases.test.ts` adds concurrency, rollback, isolation, safe-integer,
  zero-cent-share, validation, and historical-split coverage. Supplied tests
  and helpers have not been edited.
- Additional reads: `GET /api/homes`, `GET /api/homes/:homeId` (includes members),
  and `GET /api/homes/:homeId/bills` (includes ordered shares).

### Scope and trade-offs

This is a local take-home app without authentication or a payment provider.
“Mark paid” records settlement; it does not transfer money. Anyone with access
to the running API can read homes and mark shares paid. For a production service,
add authenticated home membership and authorization before exposing these routes.
No bill/member deletion or editing is provided. Refresh retrieves other clients’
changes; the page does not poll. Creating homes, members, and bills is not an
idempotent operation; payment retries are.

The production D1 database is configured in `api/wrangler.jsonc`, with the
binding name `DB`. Follow [the backend deployment guide](docs/cloudflare-deployment.md)
to sign in, apply remote migrations, and deploy the Worker. Local development
still uses an independent local database and needs no Cloudflare account.

For Vercel hosting, use root directory `web`, build command `pnpm build`, and
output directory `dist`. The tracked `web/vercel.json` connects `/api/*` to the
Cloudflare Worker, so no API URL environment variable is needed. Redeploy the
frontend when adding or changing that proxy configuration.

### Submission preparation

- Submit the repository above and confirm it is **public**.
- Use [the spoken video script](docs/video-script.md) and
  [walkthrough guide](docs/video-guide.md) to record your own video of three
  minutes or less.
- Disclose Codex assistance on the application form as the assignment requests.
  Review and understand the implementation before submitting it.

### Verification

`pnpm check`, `pnpm typecheck`, `pnpm test` (46 tests), and `pnpm build`
passed. The supplied test files and helper are unchanged.

The running app was also exercised in headless Chrome at desktop and mobile
sizes: creating a home and members, exact bill splitting, invalid fractional
cents, paying shares, filtering, and refresh persistence. Network interception
verified that a 500 leaves a share unpaid, a lost payment response can be retried
with the same key, slow requests show loading, requests exceeding 15 seconds
time out, and non-JSON errors recover through retry. No browser crashes or
horizontal overflow were observed at 390px width.

---

Welcome. In this assignment you build a small bill splitter for a shared home. It has two parts:

1. **Homes and members:** create a home and add members to it.
2. **Bill splitting:** split a bill between the members. Each member pays their own share.

The assignment is small on purpose. We want correct, safe, and clear code. We do not want many features.

## What we look at

- **Your code passes the tests.** The tests decide, not opinion. You get the visible tests. We also run extra tests that you do not see.
- **Your code is safe when things go wrong.** Wrong input, repeated requests, and two requests at the same time must not break your data.
- **Your code is typed.** Use TypeScript. Do not use `any`.
- **You understand your code.** You record a short video and explain it.

Take your time. A careful, correct solution is better than a fast one. We expect 2 to 3 days of real work.

## Stack (required)

- **API:** Hono on Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite). The binding is `DB` in `api/wrangler.jsonc`.
- **Web:** React, Vite, TanStack Router
- **Language:** TypeScript on both sides
- **Tests:** Vitest, running inside the Workers runtime
- **Quality:** Biome. `pnpm check` and `pnpm typecheck` must pass.

You choose the rest (styling, form library, validation library). Pick tools you can explain.

## The task

The assignment has two parts. Do Part 1 first. Part 2 builds on it.

**Database.** Write the schema as SQL migration files in `api/migrations/`. For example `0001_init.sql`. The tests apply every file in this folder. Your schema must have **at least 3 named constraints** that protect the data. For example a foreign key, a `CHECK`, or a `UNIQUE` key. Be ready to explain what each constraint stops.

**Errors.** Every error response is JSON: `{ "error": "message" }`.

## Part 1: Homes and members

Create a home and add members to it. The order in which members are added matters in Part 2.

#### `POST /api/homes`

- Request: `{ "name": string }`
- Success: `201` `{ id, name }`

#### `POST /api/homes/:homeId/members`

- Request: `{ "name": string }`
- Success: `201` `{ id, homeId, name }`
- Errors: `404` home not found

Visible tests: `api/test/homes.test.ts`.

## Part 2: Bill splitting

Add a bill to a home, split it between the members, and let each member pay their share.

All amounts are whole **cents** (integers). `100` cents is 1 dollar. Never use decimals for money.

#### `POST /api/homes/:homeId/bills`

- Request: `{ "title": string, "totalCents": number }`
- Success: `201` `{ id, homeId, title, totalCents, shares: [{ id, memberId, amountCents, paidAt: null }] }`
- Errors: `404` home not found. `422` total is not a positive whole number, or the home has no members.

#### `POST /api/bills/:billId/shares/:shareId/pay`

- Request: header `Idempotency-Key`
- Success: `200` `{ id, memberId, amountCents, paidAt }`
- Errors: `400` key missing. `404` bill or share not found. `409` share already paid with a different key.

#### `GET /api/homes/:homeId/balances`

- Success: `200` `{ balances: [{ memberId, name, outstandingCents }] }`
- Errors: `404` home not found

**Rules**

- **Split.** A bill is split between all members of the home. The shares always add up to `totalCents`. If the amount does not divide evenly, the extra cents go to the members one by one, in the order the members were added to the home. Example: 1000 cents between 3 members gives `334`, `333`, `333`.
- **Pay.** Paying marks one share as paid and sets `paidAt`. If the same `Idempotency-Key` is sent again for the same share, answer `200` with the same result. Do not pay twice. If two requests pay the same share at the same time, only one may succeed.
- **Balances.** `outstandingCents` is the sum of the member's unpaid shares, across all bills of the home. List the members in the order they were added.

Visible tests: `api/test/bills.test.ts` and `api/test/payments.test.ts`.

#### Web page

Build one page that:

- shows the bills of a home and the shares of each bill,
- lets a member pay a share,
- shows clear **loading**, **empty**, and **error** states,
- keeps the share unpaid and shows an error if the payment fails.

The page must not crash when the API answers with an error or is slow.

## Cases you must handle

You must handle these cases and talk about them in your video:

1. A home with no members.
2. An amount that is zero, negative, or not a whole number.
3. An amount that does not divide evenly.
4. The same payment request sent twice.
5. Two members paying the same share at the same time.
6. A bill or share that does not exist.
7. The API answers with a 500 error or is slow. The web page must not crash.

## Run it

This is a pnpm workspace. Install once at the root.

```bash
pnpm install
pnpm dev          # api on :8787 and web on :5173
```

Open http://localhost:5173. The starter page shows a title. `/api/health` returns `{ "status": "ok" }`.

```bash
pnpm test         # run the visible tests in api/test
pnpm check        # Biome: format and lint. Must pass.
pnpm check:fix    # fix what Biome can fix
pnpm typecheck    # tsc on both packages. Must pass.
pnpm build        # production build of the web app
```

`pnpm dev` applies your migrations to a local database before it starts the API.

If pnpm says some build scripts were ignored, run `pnpm approve-builds` and allow `esbuild` and `workerd`.

When you change `api/wrangler.jsonc`, refresh the `Env` types:

```bash
pnpm --filter bill-splitter-api cf-typegen
```

## Rules for the tests

- The visible tests are in `api/test`. They start with a failing result. Your job is to make them pass.
- Do **not** change the visible tests or `api/test/helpers.ts`. We compare them with the original.
- We run extra tests after you submit. They test the cases in "Cases you must handle" more closely.

## AI policy

You can use AI tools. Tell us which ones and where in your answers on the form.
You must understand every line you submit. We check this with your video and in a live call. "The AI wrote it" is not an answer.

## How to submit

1. Click **Use this template**, then **Create a new repository**. Make the repository **public**.
2. Build your solution in your new repository. Small, clear commits are welcome.
3. Update this README with a short section called **Decisions**. Write 3 decisions you made and why.
4. Record a video of **3 minutes or less** (Loom or unlisted YouTube). Show the architecture, the data flow, and one trade-off you made. Make sure anyone with the link can view it.
5. Paste the repository link and the video link in the application form.

We will run `pnpm install && pnpm check && pnpm typecheck && pnpm test` on your repository.
