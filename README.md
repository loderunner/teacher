# Journey

AI-powered "teach yourself anything" app. Built with Next.js 16 (App Router), Clerk auth, Neon Postgres, Drizzle ORM, Tailwind v4, and shadcn/ui.

## Prerequisites

- Node.js 20+
- pnpm
- Vercel CLI (`npm install -g vercel`)
- A Vercel project linked to this repo (`vercel link`)

## Local setup

```bash
pnpm install
vercel env pull .env.local   # pulls Clerk + Neon credentials from Vercel
```

## Daily development

```bash
pnpm dev        # start dev server at http://localhost:3000
pnpm typecheck  # TypeScript type check (no emit)
pnpm lint       # ESLint (next/core-web-vitals + eslint-config-loderunner)
pnpm test       # vitest (run once)
pnpm test:watch # vitest (watch mode)
```

## Database

All DB commands read credentials from `.env.local` via `drizzle.config.ts`.

```bash
pnpm db:generate  # generate a new migration from schema changes
pnpm db:migrate   # apply pending migrations to the Neon dev database
pnpm db:studio    # open Drizzle Studio (browser UI for the DB)
```

Schema lives in `lib/server/db/schema.ts`. Migrations are committed to `lib/server/db/migrations/`.

## Deployment

```bash
vercel deploy           # preview deployment
vercel deploy --prod    # promote to production
```

The Vercel project has Clerk and Neon provisioned via the Marketplace. Environment variables are managed there — do not commit `.env.local`.
