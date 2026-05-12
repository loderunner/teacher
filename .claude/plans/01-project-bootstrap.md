> **Implemented.** This deliverable has been shipped. The codebase may differ from the details below — treat this document as historical context, not a specification of the current state.

# Deliverable 1 — Foundation

## Context

First deliverable for the Journey app (overall plan: `.claude/plans/00-journey-app.md`). Scope is "complete bootstrapping": a deployable, signed-in app with the database wired end-to-end. Domain tables and feature code arrive with the deliverables that consume them — strict YAGNI on everything beyond the runway each future feature actually needs.

**Outcome**: a deployed Next.js app where:
- An anonymous visitor is redirected to Clerk sign-in.
- A signed-in visitor lands on a placeholder home page that shows the top bar with their `<UserButton />`.
- That visitor has a row in the Neon `users` table (lazy-upserted on first request) — proving DB connectivity, migrations, and the auth → backend handoff all work.

**What's deferred and why** (each picked up by the deliverable that first needs it):

| Deferred | First needed by |
|---|---|
| `journeys`, `chapters`, `messages`, `styles` tables | Deliverable 2 (persisting a Journey on "Start journey") |
| `lib/server/journeys/*`, `lib/server/syllabus/*`, etc. | Deliverable 2 |
| URL helpers (`lib/url.ts`, `lib/slugify.ts`) | Deliverable 2 (first canonical journey URL) |
| AI Gateway, AI SDK | Deliverable 2 (`/api/syllabus/chat`) |
| Vercel Blob | Whenever the first asset upload appears (post-v1) |
| Style presets in DB | Deliverable 2 (StylePicker reads them) — until then there's no place that needs to reference them |

The `users` table ships now even though no FK targets it yet, because (a) it's the natural seed for "DB is wired" verification and (b) deliverable 2's `journeys.userId` FK lands on it without a schema-evolution detour.

---

## Decisions for this deliverable

- **Package manager**: `pnpm`.
- **Test runner**: `vitest`. No tests written yet — there's nothing pure to unit-test in this deliverable. Wire up the runner so deliverable 2 drops in tests without a config detour.
- **ESLint**: `next/core-web-vitals` + `@loderunner/eslint-config`, with conflicting rules overridden in `.eslintrc.cjs` and a one-line comment per override.
- **Vercel resources**: **Clerk** + **Neon** are provisioned now. Blob and AI Gateway are added in the deliverable that first uses them.
- **DB driver**: `@neondatabase/serverless` + `drizzle-orm/neon-http`. Works in Node and Edge runtimes (we use Node for everything in v1, but this keeps doors open).
- **User-row strategy**: lazy upsert. `lib/server/users/ensure.ts` runs `INSERT … ON CONFLICT (id) DO NOTHING`, idempotent and one round-trip. Called from `app/page.tsx` (the only post-auth page that exists right now). Wrapped in `React.cache` so it deduplicates per request. When deliverable 2 lands, we move the call to wherever a `users` FK gets written.
- **Project name**: `journey` in `package.json` (placeholder per parent plan).

---

## File-level plan

```
package.json                       # pnpm scripts: dev, build, start, lint, typecheck, test, db:generate, db:migrate, db:studio
tsconfig.json                      # strict, paths: "@/*" → "./"
next.config.ts                     # default
tailwind.config.ts, postcss.config.mjs
components.json                    # shadcn neutral, CSS variables on
.eslintrc.cjs                      # next/core-web-vitals + @loderunner, with override comments
.env.example                       # Clerk keys + DATABASE_URL
vitest.config.ts                   # node env, "@/*" alias
drizzle.config.ts                  # schema → lib/server/db/schema.ts, out → lib/server/db/migrations

middleware.ts                      # clerkMiddleware; public: /sign-in(.*), /sign-up(.*)

app/
  layout.tsx                       # <ClerkProvider>, <body>, <TopBar>, {children}
  page.tsx                         # placeholder + ensureUser call
  globals.css                      # tailwind directives + shadcn vars
  sign-in/[[...rest]]/page.tsx     # Clerk <SignIn />
  sign-up/[[...rest]]/page.tsx     # Clerk <SignUp />

components/
  top-bar.tsx                      # server component: app name + <UserButton />

lib/
  server/
    db/
      index.ts                     # drizzle client (neon-http), exports `db`
      schema.ts                    # users table only
      migrations/                  # generated, committed
    users/
      ensure.ts                    # ensure({ clerkUserId }) → void; lazy upsert wrapped in React.cache
```

No `lib/url.ts`, no `lib/server/journeys/`, no domain code, no AI code, no `app/journeys/` route, no `app/api/`. Each arrives with the feature that exercises it.

---

## Step-by-step execution

### Step 1 — Bootstrap

1. `pnpm dlx create-next-app@latest` into the existing repo (TypeScript, Tailwind, ESLint, App Router, `@/*` alias). Resolve any conflicts with the existing `.claude/`, `.agents/`, `IDEA.md`, `skills-lock.json` — none should overlap.
2. `pnpm dlx shadcn@latest init` — neutral base, CSS variables on. No components installed yet.
3. `package.json` scripts: `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:watch`, `db:generate` (`drizzle-kit generate`), `db:migrate` (`drizzle-kit migrate`), `db:studio` (`drizzle-kit studio`).
4. Install + wire ESLint: `@loderunner/eslint-config` extending after `next/core-web-vitals`. Run `pnpm lint`; fix or override any conflicts inline.
5. `vitest.config.ts` with the `@/*` alias and `node` environment. No test files yet.
6. `.env.example`: `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`, `DATABASE_URL`.
7. Initial commit.

### Step 2 — Provision Clerk + Neon on Vercel

Use the **vercel:bootstrap** skill — it does linking, marketplace provisioning, and env pull in the right order.

Manually if needed:
1. `vercel link` (project name: `journey`).
2. Install the **Clerk** and **Neon Postgres** Marketplace integrations on the Vercel project.
3. `vercel env pull .env.local`. Confirm `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and `DATABASE_URL` are populated.
4. Verify `.env.local` is gitignored.

### Step 3 — Drizzle + `users` table

Use the **neon-drizzle** skill for canonical wiring.

1. `pnpm add drizzle-orm @neondatabase/serverless`. Dev: `pnpm add -D drizzle-kit tsx`.
2. `drizzle.config.ts`: dialect `postgresql`, schema `lib/server/db/schema.ts`, out `lib/server/db/migrations`, credentials from `process.env.DATABASE_URL`.
3. `lib/server/db/schema.ts`:
   ```ts
   export const users = pgTable('users', {
     id: text('id').primaryKey(),       // Clerk userId
     createdAt: timestamp('created_at').notNull().defaultNow(),
   })
   ```
4. `lib/server/db/index.ts`: create the neon-http client from `DATABASE_URL`, export `db`.
5. `lib/server/users/ensure.ts`:
   ```ts
   export const ensureUser = cache(async ({ clerkUserId }: { clerkUserId: string }) => {
     await db.insert(users).values({ id: clerkUserId }).onConflictDoNothing()
   })
   ```
   Wrapped in `React.cache` so multiple Server Components in one request only hit the DB once.
6. `pnpm db:generate` → produces the initial migration. Commit it.
7. `pnpm db:migrate` against the Neon dev branch.
8. `pnpm db:studio` to confirm the empty `users` table exists.

### Step 4 — Clerk wiring

Use the **vercel:auth** skill for the canonical Next.js App Router setup.

1. `pnpm add @clerk/nextjs`.
2. `middleware.ts` with `clerkMiddleware` and `createRouteMatcher`. Public matcher: `['/sign-in(.*)', '/sign-up(.*)']`. Everything else calls `auth.protect()`. Default `config.matcher` from Clerk's docs.
3. `app/layout.tsx`: wrap children in `<ClerkProvider>`. Render `<TopBar />` above `{children}`.
4. `app/sign-in/[[...rest]]/page.tsx`, `app/sign-up/[[...rest]]/page.tsx`: render Clerk's hosted `<SignIn />` / `<SignUp />`.
5. `components/top-bar.tsx`: server component. App name on the left. On the right, Clerk's `<SignedIn>{<UserButton />}</SignedIn>`.
6. `app/page.tsx`: server component. `const { userId } = await auth(); await ensureUser({ clerkUserId: userId! });` then render `<h1>Welcome — coming soon</h1>`. The real welcome chat lands in deliverable 2.

---

## Verification

- [ ] `pnpm install` clean.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm db:generate` produces no diff (migration committed and up to date).
- [ ] `pnpm db:migrate` is idempotent against the Neon dev branch.
- [ ] `pnpm db:studio` shows an empty `users` table.
- [ ] `pnpm dev` boots without warnings.
- [ ] Anonymous visit to `/` redirects to `/sign-in`. Same for any unknown path (e.g. `/anything`).
- [ ] Sign-up flow completes; lands back on `/`. Top bar shows `<UserButton />`.
- [ ] After sign-in, `pnpm db:studio` shows a `users` row whose `id` matches the Clerk userId — proves lazy upsert wired correctly.
- [ ] Sign-out returns to `/sign-in`.
- [ ] `pnpm build` succeeds.
- [ ] Vercel preview deploy: same flow works against the deployed URL.

If all green → ready for deliverable 2 (welcome page + syllabus chat), which is where the `journeys` / `chapters` / `messages` / `styles` tables, URL helpers, AI Gateway, and the rest of `lib/server/*` arrive — each justified by a feature that uses it the same day.
