# Video script — target 2 minutes 45 seconds

Read only the quoted paragraphs. The screen directions are for preparation,
not narration. There are about 340 spoken words; rehearse once at a comfortable
pace and keep the final recording under three minutes.

## Before recording

- Run `start-project.cmd` from the project folder and open http://localhost:5173.
- Prepare a home with Asha, Ben, and Chitra, added in that order. Add a new $10.00
  bill called **Video demo** and leave its shares unpaid.
- Open `api/src/index.ts`, `api/migrations/0001_init.sql`,
  `web/src/routes/index.tsx`, and `api/test/edge-cases.test.ts` in your editor.
- Run `pnpm check`, `pnpm typecheck`, `pnpm test`, and `pnpm build` in another
  Command Prompt so the results are ready to show.
- In Loom or your screen recorder, choose your screen and microphone. Practice
  the explanation in your own words before recording. Publish using a viewable
  Loom link or an unlisted YouTube link and check the link while signed out.

## 0:00–0:25 — Introduction and architecture

**Show:** the running dashboard, then the `api` and `web` folders.

> Hi, I’m Aryan. This is my shared bill splitter for homes and housemates.
> The frontend uses React, Vite, and TanStack Router. The backend is Hono on
> Cloudflare Workers, with Cloudflare D1 for SQLite storage. Both sides use
> TypeScript. Locally, Vite forwards API requests to the Worker.

## 0:25–1:00 — Data flow and exact splitting

**Show:** the $10.00 demo bill, its three shares, then the bill-creation route.

> When I add a bill, the browser converts the amount to integer cents and sends
> it to the API. Hono validates the home, title, and total. Empty homes and zero,
> negative, or fractional-cent amounts are rejected.
>
> A database transaction creates the bill and its shares together. SQL divides
> the total by the member count and distributes remaining cents in joining
> order. Here, ten dollars becomes three dollars thirty-four, three thirty-three,
> and three thirty-three. The shares add up exactly.

## 1:00–1:20 — Database safeguards

**Show:** the named constraints in the migration file.

> Named database constraints protect the data as well. Checks validate amounts,
> a unique constraint prevents duplicate member shares, and composite foreign
> keys prevent mixing members and bills from different homes. Adding a member
> later does not change existing splits.

## 1:20–2:00 — Payments, concurrency, and balances

**Show:** click **Mark paid** for Asha’s demo share; show the payment route and
the concurrency tests.

> Marking a share paid sends an idempotency key. One conditional database update
> stores the key and timestamp only if the share is unpaid.
>
> Retrying with the same key returns the stored result. A different key gets a
> conflict. If two requests compete for the same share, only one different key
> can succeed. A missing bill or share returns not found.
>
> Balances sum each member’s unpaid shares across the home’s bills.

## 2:00–2:25 — Slow requests and failures

**Show:** the fetch wrapper and payment error-handling code. If already prepared,
briefly show a failed request using browser network controls.

> Slow requests show loading and disable the pending payment button. Requests
> time out after fifteen seconds. A failed payment shows an error and leaves
> the share unpaid on screen. If the server saved the payment but its response
> was lost, retrying with the same key safely recovers the result.

## 2:25–2:55 — Trade-off and verification

**Show:** the successful checks in Command Prompt, then the dashboard.

> One trade-off is using direct React state instead of a query-cache library.
> It keeps this small page simple, but a larger app would benefit from caching
> and automatic synchronization.
>
> All forty-six API tests pass, including concurrency tests. Lint, type checking,
> and the production build pass too. Mark paid records settlement; it does not
> transfer money. I used Codex to assist with implementation and testing.

## Before submitting

Understand the split query, transaction, payment update, and error handling well
enough to explain them without reading. Include the repository and video links
in the application form, and disclose AI assistance there as requested.
