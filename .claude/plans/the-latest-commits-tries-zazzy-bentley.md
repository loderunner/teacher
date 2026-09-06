# Split CI (GitHub Actions) from CD (Vercel), drop `vc build`

## Context

PR #54 (`ca9c613`) moved both CI and CD into GitHub Actions: `vc build` runs on
the GHA runner, then `vc deploy --prebuilt` ships that artifact. This works, but
the very next commit (`757d16b`, "ci: fix production deployment") had to work
around a real limitation: Vercel's Marketplace-synced env vars (e.g. the
Neon-provisioned `DATABASE_URL`) are marked **Sensitive**, and Sensitive values
are only readable by a build running on Vercel's own infrastructure — never by
`vercel pull` / `vc build --yes` from an external CI runner. That forced
production's workflow to reconstruct both pooled and direct connection strings
via `neonctl` at runtime and thread them through five `--env` flags on
`vercel deploy`, duplicated across `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, and `POSTGRES_PRISMA_URL` — this is
the "hell" the user wants out of.

The fix isn't a new hand-off mechanism (Deploy Hooks, branch-scoped env vars,
etc. — all considered and rejected as unnecessary complexity). It's simpler:
**stop running `vc build` at all.** Drop `--prebuilt` and call plain
`vercel deploy`. The upload becomes full source instead of a prebuilt
`.vercel/output`, and Vercel's own servers run `next build` remotely — the exact
same place Sensitive env vars are already resolvable. Production then needs
**zero** `--env` flags: Vercel already has correctly configured Production env
vars (via the Neon Marketplace sync), and the remote build sees them natively.
The whole `757d16b` reconstruction dance disappears.

GitHub Actions keeps every other responsibility exactly as today: checks
(format/lint/typecheck/test), Neon branch creation/deletion for previews,
migrations, and — critically — it remains the **sole trigger** of every deploy.
`vercel.json`'s `git.deploymentEnabled: false` stays `false`, so Vercel's own
git-push webhook never fires a competing deploy. There is no race to design
around: GHA still creates the Neon branch, runs the migration, and only then
calls `vercel deploy` in the same job, exactly as it sequences things today. The
only thing moving is _where_ `next build` executes.

Verified against the actual CLI source
(`node_modules/vercel/dist/chunks/chunk-VE545BR3.js`, `getVercelIgnore2`):
non-prebuilt uploads use a **hardcoded** ignore list (`node_modules`, `.git`,
`.next`, `.vercel`, `.env.local`, …) and do **not** parse `.gitignore` — it
optionally reads a `.vercelignore`/`.nowignore` file if one exists. This repo
has no `.vercelignore`, so without adding one, `.claude/` and `.github/` (both
git-tracked, neither in Vercel's default ignore list) would be uploaded as
deployment source. Harmless to the build, but needless bloat/surface — add one.

## Target architecture

```
PULL REQUEST (pull-request.yml)
  checks (unchanged)
         ↓ needs
  preview
    checkout(head_ref) → setup → neon branch → migrate
      → vercel deploy --yes --target=preview --archive=tgz --json \
          --env DATABASE_URL=<pooled> --env DATABASE_URL_UNPOOLED=<direct> \
          --env POSTGRES_URL=<pooled> --env POSTGRES_URL_NON_POOLING=<direct> \
          --env POSTGRES_PRISMA_URL=<pooled>
    (no `vc build`, no `--prebuilt` — Vercel's own infra runs `next build`)

PUSH TO MAIN (production.yml)
  checks (unchanged)
         ↓ needs
  deploy
    checkout → setup → resolve prod DB URL (direct only) → migrate
      → vercel deploy --yes --prod --archive=tgz --json
    (no --env at all — Vercel already has the right Production vars)

PR CLOSED (neon-cleanup.yml) — unchanged
```

`--env` on a non-prebuilt `vercel deploy` is a standard deployment-creation
parameter (confirmed in CLI source: `parseEnv(parsedArguments.flags["--env"])`
is called from the same code path regardless of `--prebuilt`), not the
`--prebuilt`-specific edge case the old plan flagged as "undocumented
precedence" — that risk was specifically about whether `--env` could still reach
an _already-built_ artifact. Here the build hasn't happened yet when `--env` is
set, so it's an ordinary per-deployment override, same mechanism a
dashboard-based deploy uses.

## Files to change

**`.github/workflows/pull-request.yml`** — in the `preview` job, delete the
`Build` step entirely; change `Deploy preview` to call
`vercel deploy --yes --target=preview --archive=tgz --json --env ...` (same five
`--env` flags as today, values unchanged) directly, with no `--prebuilt`.

**`.github/workflows/production.yml`** — in the `deploy` job:
`Resolve production database URL` only needs the **direct/unpooled** string now
(drop the `pooled` `neonctl connection-string` call and its output — it had no
other consumer once `--env` disappears from deploy). Delete the `Build` step.
`Deploy production` becomes `vercel deploy --yes --prod --archive=tgz --json` —
no `--env` block at all.

**`.vercelignore`** (new, repo root) — at minimum:

```
.claude
.github
coverage
*.tsbuildinfo
```

(`.git`, `node_modules`, `.next`, `.vercel`, `.env.local` etc. are already in
Vercel CLI's hardcoded default list — don't duplicate them.)

**`vercel.json`** — no change. `git.deploymentEnabled: false` must stay as-is:
it's what prevents Vercel's own GitHub App from _also_ deploying on every push,
which would race the GHA-triggered deploy. `buildCommand`/ `installCommand` stay
— they're what Vercel's remote build now actually runs.

**`AGENTS.md`** ("CI/CD philosophy" section) — update:

- Rule 1: "GitHub Actions owns CI/CD; Vercel is only the hosting platform" →
  rephrase as GitHub Actions owns checks, migrations, and Neon branch lifecycle,
  and is the sole trigger for deploys; Vercel's own infrastructure runs the
  actual build. The only Vercel command left in CI is `vercel deploy` (never
  `vc build`, never `--prebuilt`).
- Rule 3: replace "the build runs once, in the deploying job (`vc build` →
  `vc deploy --prebuilt`)" with: the build runs once, remotely on Vercel,
  triggered by `vercel deploy`; never add a local `next build`/`vc build`
  anywhere in CI, or you'd validate different bytes than what ships.
- Rule 5 stays accurate as written — preview still gets its Neon branch injected
  via the same `--env` list. Add a line clarifying production takes **no**
  `--env` overrides by design, since Vercel's own Production env vars (including
  Sensitive ones) are used directly by the remote build.

**`README.md`** — update the "CI / CD" prose section to match (drop references
to `vc build`/`--prebuilt` for both flows).

No changes needed to `checks.yml`, `neon-cleanup.yml`, or
`.github/actions/setup/action.yml` — `pnpm install` there is still needed to
make the `vercel`/`drizzle-kit`/`neonctl` CLIs available via `pnpm exec`, even
though nothing local gets built anymore.

## Verification

1. **Preflight (Vercel dashboard, no code):** confirm
   `ENABLE_EXPERIMENTAL_COREPACK=1` is set on **Preview** and **Development**
   environments, not just Production. This mattered before PR #54 for pnpm 11
   detection in a Vercel-side build, and it matters again now that the build
   runs there once more. Confirm directly — don't assume the old plan's
   housekeeping step was completed.
2. **Preview, end to end:** open a PR, confirm `checks` and the `preview` job
   both go green with no `Build` step, and that the deployed preview's
   `DATABASE_URL` really is the Neon preview branch (reuse the disposable hash
   probe route pattern from the prior migration's `V3` step if you want
   certainty rather than trust: `app/api/_ci-env-probe/route.ts` returning
   `sha256(process.env.DATABASE_URL).slice(0,12)`, compare against the known
   branch URL, delete before merging).
3. **Production dry run:** `workflow_dispatch` on `main` before merging this
   change (or right after, watched closely) — confirm migrate is a no-op,
   `vercel deploy --prod` succeeds with no `--env`, and the site's DB reads hit
   production (not stale/empty) — i.e. Vercel's own Production env vars really
   are what the remote build/runtime uses.
4. **`.vercelignore` works:** inspect the deployment's uploaded file listing
   (`vercel inspect <url> --logs` or the dashboard "Source" tab) and confirm
   `.claude/` and `.github/` are absent.
5. **A chat route still streams** on both preview and production post-deploy —
   confirms `VERCEL_OIDC_TOKEN` (AI Gateway auth) still injects correctly at
   runtime; this is unaffected by build location but worth a real click-through
   since it's the one thing that would silently break the whole app.
6. **Fork PRs stay mergeable** — same as today, no change expected, but confirm
   `checks / *` all pass and `Deploy Preview` shows skipped, not failed.
