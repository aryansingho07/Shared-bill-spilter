# Deploy the backend to Cloudflare

The Worker configuration already contains your D1 database UUID:
`cf4cd256-c1ee-4bd5-a606-f7cd4dcebfb6`.
Keep the binding named `DB`: the API accesses it through `env.DB`.

## Recommended: deploy from Command Prompt

Run these commands one at a time:

```bat
cd /d "C:\Shared Bill Splitter"
pnpm --filter bill-splitter-api exec wrangler login
pnpm --filter bill-splitter-api exec wrangler d1 migrations apply DB --remote
pnpm --filter bill-splitter-api run deploy
```

The login command opens your browser. Sign in to the Cloudflare account that
owns the D1 database and approve Wrangler access. Return to Command Prompt after
login completes, then run the remaining commands. If your account has multiple
Cloudflare accounts, select the one containing this database.

The migration command creates the homes, members, bills, and shares tables in
the remote database. Confirm the migration prompt when it appears. The deploy
command publishes the Hono API as the `bill-splitter-api` Worker and prints its
actual public URL. Use the URL printed by Wrangler; the account subdomain is
specific to your account.

Local demo data is not uploaded. Local and remote databases are independent.
After changing the database ID, run `pnpm dev` again to apply migrations to the
local database selected by the new configuration.

## Verify the deployment

Open the printed Worker URL with `/api/health` appended. It should return:

```json
{ "status": "ok" }
```

Also open `/api/homes`. This endpoint queries D1, so a successful response
checks the database binding and migrations too. A new remote database returns:

```json
{ "homes": [] }
```

The root URL `/` returns a JSON 404 because this Worker serves API endpoints.
That is expected for the backend.

## If deploying through the GitHub connection in Cloudflare

Use the `main` branch of `aryansingho07/Shared-bill-spilter` and the repository
root as the build root. The deploy command is:

```text
pnpm --filter bill-splitter-api run deploy
```

Install dependencies from the repository root with `pnpm install --frozen-lockfile`
if you configure an explicit install/build command. This backend does not need
the Vite frontend build. Apply the remote migration using the Command Prompt
instructions before testing the deployed API. The Wrangler configuration declares
the D1 binding, so do not rename it to the database's display name in the dashboard.

## Connect the Vercel frontend

The frontend requests `/api` on its own origin. Vite forwards those requests
locally. In production, `web/vercel.json` forwards `/api/*` from Vercel to:

```text
https://bill-splitter-api.bill-splitter-api.workers.dev/api/*
```

The browser uses the Vercel origin and Vercel proxies the request to Cloudflare.
No frontend API URL environment variable or browser CORS change is required for
this arrangement. Other application paths fall back to `index.html` for React
routing; API errors remain API responses.

In your existing Vercel project, keep these settings:

| Setting           | Value        |
| ----------------- | ------------ |
| Root Directory    | `web`        |
| Framework Preset  | Vite         |
| Build Command     | `pnpm build` |
| Output Directory  | `dist`       |
| Production Branch | `main`       |

Redeploy after the commit containing `web/vercel.json` reaches GitHub. A connected
Vercel project normally starts a deployment automatically when changes are pushed
to its production branch. If no deployment starts, open Vercel's Deployments tab
and deploy the latest `main` commit. An older deployment will not contain the new
proxy rule. Keep the existing project and its public domain.

After deployment, open `https://YOUR-VERCEL-DOMAIN/api/health`; it should return
`{"status":"ok"}`. Open `/api/homes` to confirm D1 access, then refresh the app.
These must be JSON responses, not the frontend HTML page. Both POST requests and
the `Idempotency-Key` header use the same proxy, including when paying a share.

If you later change the Worker URL, update the destination in `web/vercel.json`
and redeploy Vercel. Deploying backend code alone does not require rebuilding
the frontend when the Worker URL and API contract stay the same.

Reference: [Vercel external rewrites](https://vercel.com/docs/routing/rewrites).

## Common errors

- **Not authenticated:** run `wrangler login` using the filtered command above.
- **Database not found or permission denied:** check that you logged into the
  account owning the supplied UUID. `pnpm --filter bill-splitter-api exec wrangler d1 list`
  lists databases you can access.
- **No such table:** apply the remote migrations. `--local` only changes the
  local database, so use `--remote` for the deployed API.
- **Worker name mismatch in a GitHub build:** the configured Worker name is
  `bill-splitter-api`; use that same name when connecting the existing Worker.

Reference: [Cloudflare D1 setup](https://developers.cloudflare.com/d1/get-started/)
and [D1 migration commands](https://developers.cloudflare.com/d1/wrangler-commands/).
