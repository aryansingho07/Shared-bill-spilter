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
pnpm --filter bill-splitter-api deploy
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
pnpm --filter bill-splitter-api deploy
```

Install dependencies from the repository root with `pnpm install --frozen-lockfile`
if you configure an explicit install/build command. This backend does not need
the Vite frontend build. Apply the remote migration using the Command Prompt
instructions before testing the deployed API. The Wrangler configuration declares
the D1 binding, so do not rename it to the database's display name in the dashboard.

## Connecting the frontend later

The frontend currently requests `/api` on its own origin. Vite forwards those
requests locally, but the development proxy is not included in a production
frontend build. When hosting the frontend, configure its host to proxy `/api/*`
to this Worker, preserving the path. A direct cross-origin frontend setup would
need both an API base URL and an explicit CORS policy.

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
