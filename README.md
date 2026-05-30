# Journey — contribution guide

## Prerequisites

- Node.js 24+
- pnpm (via [Corepack](https://nodejs.org/api/corepack.html): `corepack enable`)
- Access to the Vercel project (needed for `vercel env pull`)

## Local setup

```bash
pnpm install
pnpm exec vercel link              # one-time: link your local clone to the Vercel project
pnpm exec vercel env pull .env.local  # pull Clerk + Neon + AI Gateway credentials
pnpm dev                           # start dev server at http://localhost:3000 (Turbopack)
```

`.env.local` is gitignored. Never commit it.

## Scripts

| Command              | What it does                                         |
| -------------------- | ---------------------------------------------------- |
| `pnpm dev`           | Dev server on port 3000 (Turbopack, HMR)             |
| `pnpm build`         | Production build                                     |
| `pnpm typecheck`     | TypeScript type-check (no emit)                      |
| `pnpm lint`          | Prettier check + ESLint (zero warnings allowed)      |
| `pnpm lint:fix`      | Prettier write + ESLint --fix                        |
| `pnpm test`          | Vitest, run once                                     |
| `pnpm test:watch`    | Vitest, watch mode                                   |
| `pnpm test:coverage` | Vitest with v8 coverage report                       |
| `pnpm db:generate`   | Generate a new Drizzle migration from schema changes |
| `pnpm db:migrate`    | Apply pending migrations to the Neon database        |

## Database

Schema lives in `lib/server/db/schema.ts`. Migrations are committed to
`lib/server/db/migrations/`.

After editing the schema, always regenerate and commit the migration:

```bash
pnpm db:generate   # generates SQL in lib/server/db/migrations/
pnpm db:migrate    # applies it to the dev database (reads DATABASE_URL from .env.local)
```

Never hand-edit `_journal.json` or snapshot files — always go through
`db:generate`.

### Local Postgres (optional)

For offline development or to avoid hitting the shared Neon dev database, start
a local Postgres instance via Docker Compose and point `DATABASE_URL` at it:

```bash
docker compose up -d
# then in .env.local:
# DATABASE_URL=postgres://journey:journey@localhost:5432/journey
```

## CI / CD

Every push to `main` triggers a Vercel deployment. The build pipeline in
`vercel.json` runs:

```
pnpm test && pnpm build && pnpm db:migrate
```

Tests and migrations must pass for the deployment to succeed. There is no
separate migration step — Drizzle migrates the production database as part of
the build. Do not run `vercel deploy` manually; use `git push` instead.

## Environment variables

All credentials are provisioned via the Vercel Marketplace (Clerk, Neon, Vercel
AI Gateway) and managed through the Vercel dashboard. Pull them locally with
`vercel env pull`. To add or change a variable, use the Vercel dashboard or:

```bash
pnpm exec vercel env add MY_VAR
```

## Architecture notes

See `AGENTS.md` for the full coding standards, file layout conventions, and
feature module architecture.
