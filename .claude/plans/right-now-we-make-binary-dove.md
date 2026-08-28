# Move CI/CD from the Vercel Git integration to GitHub Actions

## Context

Today the Vercel GitHub integration drives everything. That was zero-config to
start, and preview deploys plus Neon preview branches work well. But the quality
gates got bolted on in the wrong places:

- `vercel.json` sets
  `buildCommand: "pnpm test && pnpm build && pnpm db:migrate"` — the test suite
  and production database migrations run _inside the Vercel build_.
- Lint and typecheck run **nowhere**. (The live project has no Vercel deployment
  checks configured — `/v1/deployments/{id}/checks` returns `[]`. The only merge
  gate today is `pnpm test` short-circuiting `buildCommand`.)
- A GitHub Actions workflow exists solely to clean up Neon branches that a
  Vercel-side integration created — the lifecycle is split across two systems.

The goal: **GitHub Actions owns CI/CD; Vercel is only the hosting platform.**
The only Vercel commands in CI are `vc build` and `vc deploy`.

> **Rebased onto `main` @ `1eb99bc`.** Two toolchain migrations landed while
> this was being planned — `12c967c` (prettier/eslint → oxfmt/oxlint) and
> `1eb99bc` (TypeScript 5.9 → 7.0.2, native Go compiler). Both materially change
> this plan; see §Toolchain impact.

### Decisions taken

| Decision                | Choice                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Neon branches + migrate | Owned in Actions. Disable the Neon integration's preview automation.                                  |
| Production deploy       | Automatic on push to `main` (replicates today).                                                       |
| Required status checks  | Add to the `main` ruleset.                                                                            |
| Preview deploy gating   | `needs: checks` — faithful replication; no preview for a commit that fails checks.                    |
| PR comment              | None. Rely on the `environment.url` job key (Vercel posts no comments today).                         |
| Build                   | `vc build` + `vc deploy --prebuilt` in the deploy job. Builds once, no artifact.                      |
| Checks structure        | `strategy.matrix` — four parallel jobs, four named required checks.                                   |
| CI ↔ scripts            | CI calls `package.json` scripts, extending them with flags only. Split `lint` into `format` + `lint`. |
| AGENTS.md               | Add a CI/CD philosophy section documenting the invariants.                                            |
| Extra scope             | Harden `delete-neon-branch.yml`; fix stale `lib/server/db/` paths.                                    |
| Dependabot              | Out of scope.                                                                                         |

---

## Toolchain impact

Measured on a clean clone of `main` with a warm pnpm store:

| Check       | Command                   | Before | Now        |
| ----------- | ------------------------- | ------ | ---------- |
| `format`    | `oxfmt --check`           | ~3 s   | **0.35 s** |
| `lint`      | `oxlint --max-warnings 0` | ~14 s  | **~4 s**   |
| `typecheck` | `tsc --noEmit` (TS 7)     | ~12 s  | **1.1 s**  |
| `test`      | `vitest run --typecheck`  | 4.8 s  | **2.6 s**  |
| install     | `pnpm install`            | —      | 7.2 s      |

**The entire check suite is now ~9 seconds** — every check job is dominated by
its ~50 s `checkout + setup-node + install`, not by the check. The matrix is
therefore a deliberate trade of runner minutes for four independently-named
required status checks, not a wall-clock optimization. See §checks.yml.

`pnpm build` was also measured: **11.7 s cold** locally, and it needs **no real
secrets** — every route compiles to `ƒ (Dynamic)`, so nothing is prerendered and
neither the database nor Clerk is contacted at build time. A dummy
`DATABASE_URL` is enough. This is what makes the `DATABASE_URL` shadow in the
`Build` step safe rather than load-bearing.

Three of my earlier findings were invalidated and are corrected below:

1. ❗ **`pnpm test` now requires `DATABASE_URL` to be set.** _New blocker._
   `app/api/journeys/[journeyId]/syllabus/chat/tool.test.ts` calls
   `vi.mock('@/lib/journeys/updateSyllabusDraft')` with no factory. Vitest's
   automock still **imports the real module** to enumerate its exports, which
   pulls in `lib/db/index.ts`, which calls
   `drizzlePg(process.env.DATABASE_URL!)` at module scope. With the variable
   unset that throws
   `TypeError: Cannot destructure property 'connection' of 'params[0]'`.

   Verified: bare `pnpm test` on a clean checkout → **1 failed suite**. With
   `DATABASE_URL='postgres://u:p@localhost:5432/db'` → **31 files, 216 tests,
   all pass in 2.6 s**. The pool is constructed but never connected, so a
   syntactically valid fake URL is sufficient — no Postgres service needed.

   This is invisible today because both places that run the suite always have
   the variable: Vercel's build env, and `.env.local` via `loadEnv()` in
   `vitest.config.ts`.

2. ✅ **No `next typegen` step is needed.** The TS7 migration added a `typegen`
   script and its plan doc flagged that `noUncheckedSideEffectImports` (now
   default `true`) might break the CSS side-effect imports in `app/layout.tsx`
   and `app/global-error.tsx` without the generated `next-env.d.ts`. Verified
   empirically: `pnpm run typecheck` on a clean checkout with no `.next/` and no
   `next-env.d.ts` **exits 0 in 1.1 s**. `RouteContext` is still locally
   declared in both chat route handlers rather than taken from generated types.
   The `typegen` script stays unused by CI.

3. ✅ **`vitest --typecheck` works with TS 7** — reports
   `Type Errors  no errors` and still exercises `lib/syllabus/schema.test-d.ts`.
   It remains **not** a substitute for `pnpm typecheck` (it type-checks test
   files; `tsc --noEmit` covers the project).

Also obsolete: the "don't use ESLint `--cache`, it's unsound with
`projectService`" analysis — ESLint is gone. No check-level caching is warranted
at all now; the pnpm store cache is the only one that matters.

And `.prettierignore` was **deleted** by `12c967c`, with `.oxfmtrc.json` already
carrying the correct `lib/db/migrations/` path — so that stale-path housekeeping
item is already done. `README.md` and `.claude/settings.json` are still stale
(verified on `main`).

---

## Target architecture

```
PULL REQUEST (pull-request.yml)
  checks (reusable → checks.yml)     matrix: 4 parallel jobs
    ├─ format     pnpm run format
    ├─ lint       pnpm run lint
    ├─ typecheck  pnpm run typecheck
    └─ test       pnpm run test --reporter=…
         ↓ needs
  preview
    checkout(head_ref) → setup → neon branch → migrate
      → vc build --yes --target=preview
      → vc deploy --prebuilt --env DATABASE_URL=…

PUSH TO MAIN (production.yml)
  checks (same reusable workflow)
         ↓ needs
  deploy
    checkout → setup → resolve prod DB URL → migrate
      → vc build --yes --target=production
      → vc deploy --prebuilt --prod

PR CLOSED (neon-cleanup.yml)
  delete Neon branch preview/<head_ref>
```

### Two structural principles

**1. CI calls `package.json` scripts; it may extend them, never re-spell them.**
The scripts are the single source of truth for what "lint" or "test" _means_, so
local runs and CI cannot drift. Appending flags is fine and expected —
`pnpm run test --reporter=github-actions` extends the shared script with
CI-specific output; `pnpm exec vitest run --typecheck --reporter=…` would be a
re-spelling and is not.

**2. The build runs exactly once, in the job that deploys it.** `vc build`
produces `.vercel/output`; `vc deploy --prebuilt` ships that same directory. The
bytes that get validated are the bytes that get deployed, and nothing crosses a
job boundary. Build failure fails the deploy job, which is a required check — so
the build is a gate without being a separate job.

Measured alternatives, for the record: a separate build job passing
`.vercel/output` as an artifact costs ~25–35 s of compressed round-trip to save
a ~30–50 s rebuild — a wash that adds moving parts, and for previews it would
force the Neon branch to be created ahead of the checks. Building in CI _and_
letting Vercel rebuild during a plain `vc deploy` doubles the build.

**Accepted gap:** fork PRs skip the deploy job, so they get no build signal —
only format/lint/typecheck/test. Fork PRs cannot deploy anyway (no secrets).

---

## Files

### `package.json` (modify) — split `lint` into `format` + `lint`

`lint` bundles two tools behind one `&&`, which forces CI either to duplicate
the command or lose per-tool signal. Split them:

```jsonc
{
  "format": "oxfmt --check",
  "format:fix": "oxfmt",
  "lint": "oxlint --max-warnings 0",
  "lint:fix": "oxlint --fix --max-warnings 0",
  "fix": "pnpm run format:fix && pnpm run lint:fix",
}
```

`fix` preserves today's one-command ergonomics for the `Stop` hook and local
use. `typecheck`, `test`, `test:*`, `build`, `typegen`, `db:*` are unchanged.

**Callers to update in the same PR** (verified against `main`):

- `.claude/settings.json:28` — Stop hook `pnpm lint:fix` → `pnpm fix`
- `AGENTS.md:17-18` — Formatter row ("oxfmt — `pnpm lint:fix` to auto-format")
  and Lint row ("`pnpm lint` runs oxfmt check then oxlint")
- `AGENTS.md:215` — shadcn vendoring says "pass it through `pnpm lint:fix`" →
  `pnpm fix`
- `README.md:27-28` — scripts table still describes **Prettier + ESLint**; needs
  rewriting for oxfmt/oxlint plus the new `format` / `format:fix` / `fix` rows

### `.github/actions/setup/action.yml` (new)

Composite action, used by all three jobs.

```yaml
name: Setup
description:
  Install pnpm and Node.js, then install dependencies from a warm store.

runs:
  using: composite
  steps:
    # Reads `packageManager` from package.json → pnpm 11.3.0.
    - uses: pnpm/action-setup@v6
    # MUST come after pnpm: `cache: pnpm` shells out to `pnpm store path`.
    - uses: actions/setup-node@v7
      with:
        node-version-file: .nvmrc # 24.15
        cache: pnpm
    - shell: bash
      run: pnpm install --frozen-lockfile --prefer-offline
```

Do **not** also set `cache: true` on `pnpm/action-setup` — two cache
implementations on one key produce spurious failures. Do **not** add
`--ignore-scripts`: `pnpm-workspace.yaml` `allowBuilds` lists `@swc/core`,
`esbuild`, `sharp`, `unrs-resolver`, `@parcel/watcher`, `msw`, `@clerk/shared`,
all of which need their postinstall.

### `.github/workflows/checks.yml` (new)

`on: workflow_call`. **Four parallel jobs via `strategy.matrix`** — one per
independent check, so each gets its own named status check and a red PR says
which gate failed without opening logs.

```yaml
jobs:
  check:
    name: ${{ matrix.check }}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    strategy:
      # Report all four results, not just the first failure.
      fail-fast: false
      matrix:
        check: [format, lint, typecheck, test]
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: ./.github/actions/setup

      - name: ${{ matrix.check }}
        env:
          # Only consumed by `test`; harmless elsewhere. NOT a real database —
          # Vitest automocks import the real module graph, which evaluates
          # lib/db/index.ts at module scope. The pool is constructed but never
          # connected. See §Toolchain impact ❗1.
          DATABASE_URL: postgres://ci:ci@localhost:5432/ci
          # Extends the shared `test` script with CI-only reporters. `default`
          # is respecified because naming any reporter replaces the default.
          # pnpm forwards these verbatim to `vitest run --typecheck` (verified).
          EXTRA_ARGS:
            ${{ matrix.check == 'test' && '--reporter=default
            --reporter=github-actions' || '' }}
        run: pnpm run ${{ matrix.check }} ${{ env.EXTRA_ARGS }}
```

If the inline `EXTRA_ARGS` expression reads as too clever, the plain alternative
is four sibling jobs sharing the composite setup action — same behavior, ~15
more lines, no expression. Either is fine; prefer whichever the reviewer finds
more obvious.

`--reporter=github-actions` gives inline failure annotations on the PR diff — a
free improvement over a failure buried in a Vercel build log.

**Cost note:** each check is 0.35–4 s but each job pays ~50 s of checkout +
setup-node + install, so the matrix costs ~4× the runner minutes of a single job
to save ~4 s of wall clock. That is the deliberate price of four
independently-named required checks.

### `.github/workflows/pull-request.yml` (new)

`on: pull_request: {branches: [main], types: [opened, synchronize, reopened]}`,
`concurrency: {group: pr-${{ github.event.pull_request.number }}, cancel-in-progress: true}`.

```yaml
jobs:
  checks:
    uses: ./.github/workflows/checks.yml

  preview:
    name: Deploy Preview
    needs: checks
    # Fork PRs get no secrets. A job skipped by a job-level `if` reports as
    # successful to required-check evaluation, so fork PRs stay mergeable.
    # Never use pull_request_target here.
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: read
    environment:
      name: Preview
      url: ${{ steps.deploy.outputs.url }}
    env:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ vars.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ vars.VERCEL_PROJECT_ID }}
    steps:
      # `ref: head_ref` attaches HEAD to the branch — required by createGitMeta.
      - uses: actions/checkout@v7
        with:
          ref: ${{ github.head_ref }}
          persist-credentials: false

      - uses: ./.github/actions/setup

      - name: Create Neon branch
        id: neon
        uses: neondatabase/create-branch-action@v6
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          parent_branch: ${{ vars.NEON_PRODUCTION_BRANCH }}
          branch_name: preview/${{ github.head_ref }}
          role: ${{ vars.NEON_ROLE_NAME }}
          database: ${{ vars.NEON_DATABASE_NAME }}
          api_key: ${{ secrets.NEON_API_KEY }}

      # Action outputs are NOT auto-masked. Mask before anything can echo them.
      - name: Mask connection strings
        env:
          A: ${{ steps.neon.outputs.db_url }}
          B: ${{ steps.neon.outputs.db_url_pooled }}
          C: ${{ steps.neon.outputs.password }}
        run: |
          for v in "$A" "$B" "$C"; do [ -n "$v" ] && echo "::add-mask::$v"; done

      # DDL over the direct (unpooled) endpoint. Today this runs over the pooled
      # endpoint inside the Vercel build; unpooled is safer through pgbouncer.
      - name: Migrate preview database
        env:
          DATABASE_URL: ${{ steps.neon.outputs.db_url }}
        run: pnpm run db:migrate

      # `--yes` makes `vc build` pull project settings + target env itself
      # (it shells `pull --yes --environment preview` internally), so this is
      # still two Vercel commands, not three. `--target=preview` is what gets
      # the correct NEXT_PUBLIC_CLERK_* values inlined into the client bundle.
      - name: Build
        env:
          # Shadow the pulled (production) DATABASE_URL so a build-time query
          # can never reach production. Nothing is prerendered today — every
          # route is `ƒ (Dynamic)` — so the build never connects. Belt and braces.
          DATABASE_URL: ${{ steps.neon.outputs.db_url_pooled }}
        run: pnpm exec vercel build --yes --target=preview

      - name: Deploy preview
        id: deploy
        env:
          DB_POOLED: ${{ steps.neon.outputs.db_url_pooled }}
          DB_DIRECT: ${{ steps.neon.outputs.db_url }}
        run: |
          set -euo pipefail
          pnpm exec vercel deploy \
            --prebuilt --yes --archive=tgz --target=preview --json \
            --env DATABASE_URL="$DB_POOLED" \
            --env DATABASE_URL_UNPOOLED="$DB_DIRECT" \
            --env POSTGRES_URL="$DB_POOLED" \
            --env POSTGRES_URL_NON_POOLING="$DB_DIRECT" \
            --env POSTGRES_PRISMA_URL="$DB_POOLED" \
            > deployment.json || { cat deployment.json; exit 1; }

          url=$(jq -r '.deployment.url // .url' deployment.json)
          inspect=$(jq -r '.deployment.inspectorUrl // .inspectorUrl // empty' deployment.json)
          echo "url=$url" >> "$GITHUB_OUTPUT"
          {
            echo "### Preview deployment"
            echo "- Preview: $url"
            echo "- Inspect: $inspect"
            echo "- Neon branch: \`preview/${{ github.head_ref }}\` (new: ${{ steps.neon.outputs.created }})"
          } >> "$GITHUB_STEP_SUMMARY"
```

Flag rationale:

- **`--prebuilt` is safe here.** The documented cost is that System Environment
  Variables are missing _at build time_. Verified by grep that nothing in `app/`
  or `lib/` reads a `VERCEL_*` variable at build time — the only env reads are
  `NODE_ENV`, `DATABASE_URL`, `AI_MODEL`, `OMLX_BASE_URL`. `VERCEL_OIDC_TOKEN`,
  which AI Gateway auth depends on, is a **runtime** injection and is unaffected
  by `--prebuilt`. Confirm in V2b before relying on it.
- **No `--build-env`** — meaningless with `--prebuilt`; the build already
  happened. Build-time values come from the `Build` step's process env.
- **No `--force`** — it discards Vercel's build cache.
- **No `--no-wait`** — we need the terminal `readyState` to fail the job.
- **`--env` covers the whole Neon family**, not just `DATABASE_URL`. Code reads
  only `DATABASE_URL` today, but once the Neon preview automation is off, the
  project-level Preview `POSTGRES_*`/`PG*` vars point at **production**.
- **Secrets never cross a job boundary.** Neon create + migrate + build + deploy
  live in one job so `db_url` is never a job output — job outputs are unmasked
  and persisted in the run record. This is also why `.vercel/output` never
  becomes an artifact.

### `.github/workflows/production.yml` (new)

`on: {push: {branches: [main]}, workflow_dispatch: {}}`,
`concurrency: {group: production, cancel-in-progress: false}` — never cancel a
production deploy, never interleave two migrations.

`checks` (reusable) → `deploy` (`needs: checks`),
`environment: {name: Production, url: …}`.

Steps: default `actions/checkout@v7` (already attached to `main`) → setup →
resolve prod DB URL → migrate → build → deploy:

```yaml
- name: Build
  run: pnpm exec vercel build --yes --target=production

- name: Deploy production
  id: deploy
  run: |
    set -euo pipefail
    pnpm exec vercel deploy \
      --prebuilt --yes --archive=tgz --prod --json \
      > deployment.json || { cat deployment.json; exit 1; }
    echo "url=$(jq -r '.deployment.url // .url' deployment.json)" >> "$GITHUB_OUTPUT"
```

No `--env` on production (project env vars are already correct, and `vc build`
pulls them). No `--skip-domain` — we want today's automatic promotion/aliasing.
No `DATABASE_URL` shadow: the pulled production value _is_ the right one.

**Production `DATABASE_URL` is derived from the Neon API at run time**, not
stored as a secret:

```bash
api=https://console.neon.tech/api/v2
branch_id=$(curl -fsSL -H "Authorization: Bearer $NEON_API_KEY" \
  "$api/projects/$NEON_PROJECT_ID/branches" \
  | jq -er --arg n "$NEON_PRODUCTION_BRANCH" '.branches[] | select(.name == $n) | .id')
uri=$(curl -fsSL -H "Authorization: Bearer $NEON_API_KEY" \
  "$api/projects/$NEON_PROJECT_ID/connection_uri?branch_id=$branch_id&database_name=$NEON_DATABASE_NAME&role_name=$NEON_ROLE_NAME&pooled=false" \
  | jq -er '.uri')
echo "::add-mask::$uri"
echo "url=$uri" >> "$GITHUB_OUTPUT"
```

`NEON_API_KEY` already exists and already grants full project control, so this
adds **zero blast radius**, and is immune to password rotation silently breaking
a copied secret. Fallback: a `PRODUCTION_DATABASE_URL` secret scoped to the
`Production` GitHub environment, copied from Vercel's Production
`DATABASE_URL_UNPOOLED`.

### `.github/workflows/neon-cleanup.yml` (new — replaces `delete-neon-branch.yml`)

Same Neon naming, so nothing on the Neon side changes. Drops
`tj-actions/branch-names@v8` (March 2025 supply-chain compromise) for the
built-in `github.event.pull_request.head.ref`. Keep the job name
`Delete Neon Branch` for check-name continuity.

```yaml
on:
  pull_request:
    types: [closed]
concurrency:
  group: neon-cleanup-${{ github.event.pull_request.number }}
  cancel-in-progress: false
jobs:
  delete_neon_branch:
    name: Delete Neon Branch
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: neondatabase/delete-branch-action@v3
        continue-on-error: true
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          branch: preview/${{ github.event.pull_request.head.ref }}
          api_key: ${{ secrets.NEON_API_KEY }}
```

Delete `.github/workflows/delete-neon-branch.yml`.

### `vercel.json` (modify)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "pnpm install",
  "buildCommand": "pnpm build",
  "git": {
    "deploymentEnabled": false
  }
}
```

- `buildCommand` drops `pnpm test &&` and `&& pnpm db:migrate`. This is the
  point of the migration.
- `installCommand` stays **without** `--frozen-lockfile`:
  `ENABLE_EXPERIMENTAL_COREPACK` is set on Production only, so Preview builds
  may infer pnpm 10.x from `lockfileVersion`, where `--frozen-lockfile` against
  a pnpm-11 lockfile can hard-fail. Keep this a zero-delta change at cutover;
  tighten in follow-up. Lockfile drift is already caught by the checks job,
  which _does_ use `--frozen-lockfile`.
- `git.deploymentEnabled: false` is the documented way to stop auto-deploys
  while keeping the repo connected. **Do not** disconnect the repo (loses the
  GitHub App, branch aliasing, deploy hooks). **Do not** use Ignored Build Step
  (canceled builds still count against deployment quota).

### `.vercelignore` — **not needed**

Earlier drafts of this plan added one, because plain source upload does not
apply `.gitignore` and would have swept up `coverage/`, `*.tsbuildinfo`,
`.claude/`, and `.agents/` from the CI workspace. Choosing `--prebuilt` removes
the problem entirely: `getVercelIgnore2()` (`chunk-VE545BR3.js:46344`) takes a
different branch when `prebuilt` is true, building the ignore list as
`["*", "!/.vercel", "!/.vercel/output/**"]` — everything is excluded except the
build output. No source is uploaded at all.

### Housekeeping (same PR — all CI-adjacent)

- `README.md` — rewrite the "CI / CD" section (it says "Do not run
  `vercel deploy` manually; use `git push` instead"), rewrite the scripts table
  (rows 27-28 still describe **Prettier + ESLint**), and fix `lib/server/db/` →
  `lib/db/` at lines 37-43.
- `.claude/settings.json` — Stop hook `pnpm lint:fix` → `pnpm fix`; deny rule
  `Edit(./lib/server/db/migrations/**/snapshot.json)` →
  `Edit(./lib/db/migrations/**/snapshot.json)`.
- `AGENTS.md` — Formatter/Lint rows for the script split, the `pnpm lint:fix`
  reference at line 215, and the Deploy row of the tech-stack table (currently
  "Vercel — pushes to `main` deploy automatically").

### New `AGENTS.md` section: CI/CD philosophy

Add a section after the tech-stack table (before `# Architecture`) stating the
rules a future contributor or agent has to respect, and _why_ — these are all
invariants that are easy to break without noticing:

1. **GitHub Actions owns CI/CD. Vercel is only the hosting platform.** Never
   move a check into `vercel.json`'s `buildCommand`. That file builds; it does
   not validate.
2. **CI calls `package.json` scripts and may only extend them with flags.** If a
   check needs different behavior, change the script — not the workflow. This is
   what keeps a green local run meaning the same thing as a green CI run.
3. **The build runs once, in the deploying job.** `vc build` →
   `vc deploy --prebuilt`. Do not add a second `next build` anywhere; the bytes
   validated are the bytes deployed.
4. **Migrations must be expand/contract.** They run _before_ the code that needs
   them is live, and the gap becomes permanent if a deploy fails. Add nullable
   columns; never drop or rename in the same PR that stops using them; backfill
   separately. Drizzle has no down-migrations — always fix forward. (See Risk
   1.)
5. **Preview deployments get their own Neon branch, injected via `--env`.** Any
   new `process.env.POSTGRES_*` / `PG*` read must be added to the `--env` list
   in `pull-request.yml`, or that code path will reach **production** from a
   preview. (See Risk 5.)
6. **Unit tests must not depend on ambient environment.** Mock `@/lib/db` via
   `lib/db/__mocks__/index.ts`. CI currently sets a fake `DATABASE_URL` to work
   around one test that doesn't. (See Risk 6.)

---

## Vercel CLI facts this design rests on

Verified directly against `node_modules/vercel` (CLI 59.1.4) — several
contradict the public docs.

1. **`vercel deploy --json` emits the inspect URL.** `getDeploymentOutputJson`
   (`commands/deploy/index.js:2689`) returns
   `{id, url, inspectorUrl, readyState, target, deploymentApiUrl}`. When
   `client.nonInteractive` is true the payload is wrapped as
   `{status, deployment: {…}, message, next}` — hence
   `jq -r '.deployment.url // .url'`. No stderr scraping, no second
   `vercel inspect` call.
2. **The CLI auto-populates git metadata.** `createGitMeta()`
   (`chunks/chunk-VE545BR3.js:55071`) sets `commitRef: commit.branch` and sends
   a top-level `gitMetadata` field. It needs an **attached HEAD**, hence
   `ref: ${{ github.head_ref }}`. The `--meta githubDeployment=1 …` block is a
   **fallback**, not the primary mechanism.
3. **All required flags exist in 59.1.4** — confirmed via
   `vercel deploy --help`: `--target`, `--env`/`-e`, `--build-env`/`-b`,
   `--meta`/`-m`, `--archive`, `--prebuilt`, `--skip-domain`, `--prod`, `--yes`,
   `--json`, `--logs`, `--no-wait`, `--non-interactive`.
4. **`vercel build --yes` pulls target env itself.**
   `commands/build/index.js:1066` shells `pull --yes --environment <target>`,
   and `--yes` is documented as "Skip the confirmation prompt about pulling
   environment variables and project settings when not found locally". So
   `vc build` + `vc deploy --prebuilt` is two Vercel commands, not three — no
   explicit `vercel pull`, no `vercel link`.
5. **`--prebuilt` changes what gets uploaded.** `getVercelIgnore2()` takes a
   `prebuilt` branch that ignores `*` except `/.vercel/output/**`. Only build
   output is uploaded; no source, no `node_modules`.

---

## Secrets and variables

| Name                     | Kind       | Value / source                                                             |
| ------------------------ | ---------- | -------------------------------------------------------------------------- |
| `VERCEL_TOKEN`           | **secret** | vercel.com → Account Settings → Tokens. **Scope to the `loderunnr` team.** |
| `VERCEL_ORG_ID`          | variable   | `team_WgcotiGNpTyngzjRmameTYYI` (`.vercel/repo.json`). Not a credential.   |
| `VERCEL_PROJECT_ID`      | variable   | `prj_8pVsY1n2AsdVoKMsY5dS25Y4RbwY` (`.vercel/repo.json`).                  |
| `NEON_API_KEY`           | secret     | **already exists**                                                         |
| `NEON_PROJECT_ID`        | variable   | **already exists** = `nameless-poetry-76945496`                            |
| `NEON_PRODUCTION_BRANCH` | variable   | **new** — confirm in the Neon console, do not guess                        |
| `NEON_DATABASE_NAME`     | variable   | **new** — likely `neondb`, confirm                                         |
| `NEON_ROLE_NAME`         | variable   | **new** — likely `neondb_owner`, confirm                                   |

`VERCEL_ORG_ID` + `VERCEL_PROJECT_ID` as env vars are the CLI's link-free
mechanism — **no `vercel link` step**. Combined with `vc build --yes` pulling
its own env, CI runs exactly two Vercel commands: `vc build` and `vc deploy`.

## Vercel / Neon dashboard changes

| Where                             | Change                                                                | Why                                                       |
| --------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| Neon console → Vercel integration | **Turn OFF preview branch automation**                                | Non-negotiable — see Risk 4                               |
| Vercel → Env Vars                 | Add `ENABLE_EXPERIMENTAL_COREPACK=1` to **Preview** + **Development** | pnpm 11 parity across environments                        |
| Vercel → Git                      | Leave the repo **connected**, `createDeployments` enabled             | `git.deploymentEnabled: false` is what stops auto-deploys |

---

## Replication audit

| Behavior today                                     | After migration                                | Risk                                                                       |
| -------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| Preview deploy per PR push                         | `pull-request.yml` → `preview`                 | ✅ equivalent                                                              |
| Production deploy on push to `main`                | `production.yml` → `deploy`                    | ✅ equivalent                                                              |
| Deploy on push to **any** branch                   | Only PR branches                               | ⚠️ **deliberate loss** — open a draft PR to get a preview                  |
| `pnpm test` gates the build                        | `checks` matrix + `needs: checks`              | ✅ better (format/lint/typecheck now run at all)                           |
| `pnpm build` gates the deploy                      | `vc build` in the deploy job                   | ✅ equivalent, and now builds once instead of twice                        |
| `pnpm db:migrate` inside the build                 | GHA step before `vc deploy`                    | ⚠️ ordering change — Risk 1                                                |
| Neon `preview/<branch>` via Vercel webhook         | `create-branch-action@v6`                      | ⚠️ must disable the integration — Risk 4                                   |
| Neon per-deployment env injection                  | explicit `--env` / `--build-env`               | ❗ **undocumented precedence** — verification V3, highest risk in the plan |
| The `Vercel` PR check                              | 4 `checks / *` + `Deploy Preview`              | ⚠️ name changes; nothing references the old name today                     |
| Preview link in the PR timeline                    | `environment: {name, url}`                     | ✅ equivalent                                                              |
| Branch alias `journey-git-<branch>-…`              | auto `gitMetadata` from attached-HEAD checkout | ⚠️ unverified — V2                                                         |
| `VERCEL_GIT_*` build-time vars                     | auto `gitMetadata`, `--meta` fallback          | ⚠️ unverified — V2; no app code reads them                                 |
| Vercel PR comments                                 | n/a — `gitComments` already off                | ✅ nothing to replicate                                                    |
| Fork PR previews                                   | skipped via `if:`                              | ⚠️ **loss**; correct posture, `pull_request_target` is not acceptable      |
| Type errors in `proxy.ts`, route validators        | caught by `next build` inside the deploy job   | ⚠️ deploy-time, not check-time — **same as today**; not covered on forks   |
| Vercel remote build cache                          | **gone** — the build now runs on the runner    | ⚠️ **regression**: every deploy is a cold build (~30–50 s). See below.     |
| OIDC / AI Gateway auth                             | preserved — runtime injection, not build-time  | ✅ unaffected by `--prebuilt`; verify in V2b                               |
| Clerk vars, skew protection, fluid compute, `iad1` | untouched                                      | ✅ equivalent                                                              |
| Instant Rollback / manual promote                  | untouched                                      | ✅ equivalent                                                              |

**On the lost build cache.** Moving the build to the runner forfeits Vercel's
per-project build cache. Do **not** try to replace it with `actions/cache` on
`.next/cache`: that directory measures **252 MB** here, against a cold build of
11.7 s locally / ~30–50 s on a runner. Restoring a quarter-gigabyte to save
under a minute is a net loss, and a stale Next cache is a classic source of
phantom build failures. Accept the cold build.

---

## Verification

Run **in order**. V0–V4 do not touch production or the live PR checks.

- **V0 — scratch project.** `vercel build --yes --target=preview` then
  `vercel deploy --prebuilt --project journey-ci-lab --yes --archive=tgz --json`
  from a local clone. Confirms token scope, that `vc build --yes` pulls env
  without a separate `vercel pull`, that `--prebuilt` uploads only
  `.vercel/output`, and the exact `--json` shape (flat vs `.deployment`-wrapped)
  in a non-TTY pipe.
- **V2b — `--prebuilt` does not break the running app.** _New, and the reason
  `--prebuilt` was previously ruled out._ After the first prebuilt preview
  deploys, exercise a route that calls the AI Gateway (a syllabus or chapter
  chat) and confirm streaming works. This proves `VERCEL_OIDC_TOKEN` is still
  injected at runtime. Grep already shows no build-time `VERCEL_*` read, so this
  is confirmation rather than discovery — but it is the failure mode that only
  shows up under real traffic.
- **V2c — `vc build` env precedence.** Confirm the `Build` step's process-env
  `DATABASE_URL` shadows the value `vc build` pulls from the Preview target.
  Simplest check: set it to a deliberately malformed value in a throwaway run
  and confirm the build still succeeds (nothing connects at build time), then
  reason from the V3 probe for the runtime value. If process env does _not_ win,
  the shadow is merely ineffective, not harmful — every route is dynamic, so no
  build-time query happens either way.
- **V1 — `git.deploymentEnabled: false` does not block CLI deploys.** _Blocker
  if it fails._ The CLI sends all of `vercel.json` as `nowConfig` on the
  create-deployment payload, so this is worth 60 s of certainty. If it blocks,
  fall back to disabling auto-deploys in the dashboard instead.
- **V2 — `gitMetadata` and branch aliasing.** Run the preview job on a real PR
  branch; check the Vercel dashboard shows correct branch/SHA/message/author and
  whether a `journey-git-<branch>` alias appears. If blank, add the `--meta`
  fallback — but use `github.event.pull_request.head.sha`, since `github.sha` on
  `pull_request` is the **merge** commit. Watch for a _duplicate_ GitHub
  Deployment; if `githubDeployment=1` causes one, drop that key.
- **V3 — does `--env` beat a project-level env var of the same name?** _The
  critical unknown._ Add a temporary route returning only a **hash**:

  ```ts
  // app/api/_ci-env-probe/route.ts — DELETE BEFORE MERGE
  import { createHash } from 'node:crypto';
  export const dynamic = 'force-dynamic';
  export function GET() {
    const url = process.env.DATABASE_URL ?? '';
    return Response.json({
      fp: createHash('sha256').update(url).digest('hex').slice(0, 12),
    });
  }
  ```

  Print the same fingerprint of `db_url_pooled` in the workflow, deploy, `curl`,
  compare. Match ⇒ plan is sound. Mismatch ⇒ **stop**; switch to per-branch env
  vars set via the Vercel API, or leave migrations in `buildCommand`. Never
  return the raw URL or hostname.

- **V4 — `create-branch-action@v6` idempotency.** Push twice; second run must
  report `created: false`, return the same `db_url`, and migrate as a no-op.
  Confirms `NEON_ROLE_NAME` / `NEON_DATABASE_NAME` / `NEON_PRODUCTION_BRANCH` —
  a wrong role silently yields a URL for the wrong credentials.
- **V5 — Neon webhook silence.** With the integration's preview automation off,
  confirm no unexpected `preview/*` branch appears after a CLI deploy, and
  re-use the V3 probe to confirm the injected env is ours.
- **V6 — reopen and cleanup.** Close the test PR → branch deleted. Reopen →
  recreated with `created: true`, full migration replay, deploy succeeds.
- **V7 — fork PR.** `Deploy Preview` must be _skipped_ (not failed), all four
  `checks / *` jobs must run and pass, and the PR must stay mergeable under the
  ruleset. Note fork PRs get no build signal — accepted gap.
- **V8 — production dry run.** `workflow_dispatch` on `main` **before** the
  cutover PR merges. Confirm the Neon API resolves the prod URL, `db:migrate` is
  a clean no-op, and `vc deploy --prod` aliases the production domain. This is
  the only step touching production — hence last.

---

## Cutover

1. **Add secrets and variables.** Nothing consumes them yet. Confirm the three
   new Neon values against the console rather than assuming.
2. **Run V0 and V1** against a scratch Vercel project; delete it afterward.
3. **Open the migration PR** with all files above plus the temporary probe
   route. `vercel.json` in the PR silences the Vercel integration _for that
   branch_, so the PR is self-isolating.
4. **Iterate V2–V7** on that PR. Concurrency cancellation makes force-pushes
   cheap.
5. **Turn off Neon preview branch automation** — after V3/V5 pass, before merge.
   ⚠️ Between this moment and the merge, any PR still on the old `vercel.json`
   gets a preview pointed at the **production** database. Keep the window to
   minutes; land it with no other open PRs.
6. **Delete the probe route, merge.** `production.yml` fires immediately: checks
   → migrate (no-op) → `vc deploy --prod`. Watch it. Then add
   `ENABLE_EXPERIMENTAL_COREPACK=1` to Preview + Development, and clear the
   orphaned `Test` workflow registration (id `283621308`) by deleting its
   remaining runs — it vanishes from the UI once no runs remain.
7. **Add required status checks** to ruleset `16919406` alongside
   `required_linear_history`: `checks / format`, `checks / lint`,
   `checks / typecheck`, `checks / test`, and `Deploy Preview`. Include
   `Deploy Preview` — it is the **only** gate that runs `next build`, which is
   the only thing typechecking `proxy.ts` and the Next route validators. Copy
   the exact strings from a completed run rather than typing them
   (reusable-workflow matrix jobs render as `<caller-job> / <matrix-name>`). Do
   **not** enable "strict / require branches up to date" — with
   `required_linear_history` it forces a rebase-and-rerun on every merge.

### Rollback

Revert the merge commit. `vercel.json` returns to no `git.deploymentEnabled` and
the old `buildCommand`; the Vercel GitHub App resumes auto-deploying on the next
push. Then re-enable Neon's preview automation. Secrets/variables can stay —
they are inert.

Partial rollback (a fine resting point if V3 fails): keep the workflows, drop
`git.deploymentEnabled`, restore the old `buildCommand`, delete `production.yml`
and the `preview` job. You get Vercel deploys plus GHA checks.

The only irreversible thing in the sequence is a production migration — and that
is already true today.

---

## Risks

1. **Expand/contract is now mandatory, in writing.** Migrations run before the
   code that needs them is live, and the gap becomes permanent if the deploy
   fails. **This is not new** — today `db:migrate` runs mid-build while the old
   deployment still serves traffic, so production already spends a window
   running old code against a new schema. The change widens that window from
   seconds to "until the build succeeds". Commits `95557ad` (dual-write only)
   and `47f2ea3` (source-of-truth cutover) show the discipline already exists;
   write it into `AGENTS.md`. **Never write a down-migration** — Drizzle has no
   down, and reversing prod schema under live traffic is worse than fixing
   forward.
2. **A canceled preview run can leave a partial migration.** Each migration file
   is transactional, so you get a consistent prefix, never a torn file; the next
   push applies the rest. Preview-only — production uses
   `cancel-in-progress: false`.
3. **Long-lived PRs drift from production schema.** The Neon branch is forked at
   PR-open and never re-forked, so a migration authored before another but
   merged after can apply in a different relative order on preview than on prod.
   Mitigation: a `reset-preview-db` label workflow (follow-up).
4. **Two systems creating the same Neon branch.** It is undocumented whether the
   Vercel→Neon webhook fires for CLI deployments. If it does and automation is
   left on, Neon injects `DATABASE_URL` at build time while we pass `--env` at
   deployment-creation time — which wins is unknowable without testing, and the
   failure is silent and severe (a preview writing to production). **Disabling
   the integration's preview automation is not optional.** V5 verifies it.
5. **Preview env vars silently point at production.** Once automation is off,
   the project-level Preview `DATABASE_URL`/`POSTGRES_*` values are whatever
   Neon last set — production. **Any new `process.env.POSTGRES_*` / `PG*`
   reference must be added to the `--env` list** — the highest-consequence
   maintenance trap this migration introduces.
6. **The test suite depends on ambient `DATABASE_URL`.** The CI fix is a fake
   URL, but the underlying fragility is real: a unit test's module graph reaches
   a module that throws at import time on a missing env var. See follow-ups.
7. **`github.sha` on `pull_request` is the merge commit.** Use
   `github.event.pull_request.head.sha` for anything describing the deployed
   code and `github.head_ref` for the branch. The `ref: head_ref` checkout also
   means CI tests the head commit, not the merge preview — which is what Vercel
   does today.

## Follow-ups (not at cutover)

- **Fix the `DATABASE_URL` test coupling properly** — either add
  `vi.mock('@/lib/db')` to
  `app/api/journeys/[journeyId]/syllabus/chat/tool.test.ts` (matching the
  convention every other DB-touching test follows via
  `lib/db/__mocks__/index.ts`), or make `lib/db/index.ts` construct its clients
  lazily so importing it is side-effect-free. Then drop the fake env var from
  CI.
- Flip `installCommand` to `pnpm install --frozen-lockfile` once
  `ENABLE_EXPERIMENTAL_COREPACK` is on all environments.
- Add `reset-preview-db.yml` (label-triggered branch reset) for Risk 3.
- SHA-pin third-party actions (`neondatabase/*`, `pnpm/action-setup`) and add
  `.github/dependabot.yml` for the `github-actions` ecosystem — consistent with
  removing `tj-actions` for exactly this reason.
- Split the Vercel token in two (Preview vs Production GitHub environments) so a
  compromised preview workflow cannot deploy to production.
