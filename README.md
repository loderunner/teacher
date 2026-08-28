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
| `pnpm format`        | oxfmt check (fails if files are unformatted)         |
| `pnpm format:fix`    | oxfmt write (auto-format files in place)             |
| `pnpm lint`          | oxlint (zero warnings allowed)                       |
| `pnpm lint:fix`      | oxlint --fix                                         |
| `pnpm fix`           | `format:fix` then `lint:fix`                         |
| `pnpm test`          | Vitest, run once                                     |
| `pnpm test:watch`    | Vitest, watch mode                                   |
| `pnpm test:coverage` | Vitest with v8 coverage report                       |
| `pnpm db:generate`   | Generate a new Drizzle migration from schema changes |
| `pnpm db:migrate`    | Apply pending migrations to the Neon database        |

## Database

Schema lives in `lib/db/schema.ts`. Migrations are committed to
`lib/db/migrations/`.

After editing the schema, always regenerate and commit the migration:

```bash
pnpm db:generate   # generates SQL in lib/db/migrations/
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

GitHub Actions is the CI/CD system; Vercel is hosting only. Vercel's Git
integration auto-deploy is disabled (`vercel.json` sets
`git.deploymentEnabled: false`).

On every pull request, a `checks` workflow runs `pnpm format`, `pnpm lint`,
`pnpm typecheck`, and `pnpm test` as required status checks. For same-repo PRs,
a preview deploy job then creates a Neon database branch, runs migrations
against it, and deploys with `vc build` + `vc deploy --prebuilt` to a Preview
Vercel environment.

On push to `main`, the same checks run, then a production deploy job resolves
the production Neon connection string, runs migrations, and deploys with
`vc build --target=production` + `vc deploy --prebuilt --prod`.

There is no separate build step outside CI — the build that is validated is the
exact build that gets deployed. Do not run `vercel deploy` manually for normal
changes; push to a PR branch or merge to `main` instead.

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
