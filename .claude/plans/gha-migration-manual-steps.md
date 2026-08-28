# Manual steps: GitHub Actions CI/CD migration

This is what's left for you to do outside the code. Everything in the plan
(`.claude/plans/right-now-we-make-binary-dove.md`) that could be expressed as a
file has been implemented on this branch:

- `.github/actions/setup/action.yml` (new composite action)
- `.github/workflows/checks.yml` (new, reusable — format/lint/typecheck/test
  matrix)
- `.github/workflows/pull-request.yml` (new — checks + preview deploy)
- `.github/workflows/production.yml` (new — checks + production deploy)
- `.github/workflows/neon-cleanup.yml` (new, replaces `delete-neon-branch.yml`,
  which was deleted)
- `package.json` — split `lint` into `format` / `format:fix` / `lint` /
  `lint:fix` / `fix`
- `vercel.json` — dropped `pnpm test && … && pnpm db:migrate` from
  `buildCommand`, added `git.deploymentEnabled: false`
- `AGENTS.md`, `README.md`, `.claude/settings.json` — updated for the new
  scripts and CI/CD architecture

Locally verified on this branch: `pnpm format`, `pnpm lint`, `pnpm typecheck`,
`pnpm test` (with a fake `DATABASE_URL`), and `pnpm build` all pass standalone.

None of this takes effect until you do the steps below — until then, the old
Vercel Git integration is still live and this branch's `vercel.json` will
silence it for its own PR the moment you open one (see step 3).

---

## 1. Add GitHub secrets and variables

In the repo's Settings → Secrets and variables → Actions:

| Name                     | Kind     | Value                                                                                   |
| ------------------------ | -------- | --------------------------------------------------------------------------------------- |
| `VERCEL_TOKEN`           | secret   | Create at vercel.com → Account Settings → Tokens. **Scope it to the `loderunnr` team.** |
| `VERCEL_ORG_ID`          | variable | `team_WgcotiGNpTyngzjRmameTYYI` (from `.vercel/repo.json`)                              |
| `VERCEL_PROJECT_ID`      | variable | `prj_8pVsY1n2AsdVoKMsY5dS25Y4RbwY` (from `.vercel/repo.json`)                           |
| `NEON_API_KEY`           | secret   | Already exists — no action needed                                                       |
| `NEON_PROJECT_ID`        | variable | Already exists = `nameless-poetry-76945496` — no action needed                          |
| `NEON_PRODUCTION_BRANCH` | variable | **New — confirm the exact branch name in the Neon console, don't guess**                |
| `NEON_DATABASE_NAME`     | variable | **New — confirm in the Neon console (likely `neondb`)**                                 |
| `NEON_ROLE_NAME`         | variable | **New — confirm in the Neon console (likely `neondb_owner`)**                           |

## 2. Vercel and Neon dashboard changes

- **Vercel → Environment Variables**: add `ENABLE_EXPERIMENTAL_COREPACK=1` to
  the **Preview** and **Development** environments (Production already has it).
- **Vercel → Git**: leave the repo connected, keep `createDeployments` enabled.
  `git.deploymentEnabled: false` in `vercel.json` is what stops auto-deploys —
  don't disconnect the repo, and don't use Ignored Build Step instead (canceled
  builds still count against your deployment quota).
- **Neon console → Vercel integration**: leave preview-branch automation **ON**
  for now — turn it off only right before merging (step 5 below). Turning it off
  too early breaks preview branches for every other open PR still on the old
  `vercel.json`.

## 3. Open the migration PR

Push this branch and open a PR against `main`. Because this branch's
`vercel.json` already sets `git.deploymentEnabled: false`, opening the PR
silences the Vercel integration for this branch only — the PR is self-isolating,
so iterating on it is safe.

## 4. Verify before merging

Run through these against the open PR (details and rationale in the plan doc's
"Verification" section — `V0`–`V8`). The ones that matter most:

- **Preview deploy works end-to-end** — push a commit, confirm the `checks`
  matrix and `Deploy Preview` job both go green, and the preview URL loads.
- **A chat route streams correctly on the prebuilt preview** — `--prebuilt`
  skips Vercel's System Environment Variables at build time; confirm
  `VERCEL_OIDC_TOKEN` (which AI Gateway auth needs) still works at runtime by
  exercising a syllabus or chapter chat on the deployed preview.
- **The preview's `DATABASE_URL` really is the Neon preview branch, not
  production** — this is the single highest-risk unknown in the whole migration
  (does `--env` on `vercel deploy` actually beat a project-level env var of the
  same name?). The plan's `V3` probe route (`app/api/_ci-env-probe/route.ts`, a
  throwaway route that returns a hash of `process.env.DATABASE_URL`) is the
  concrete way to check this — add it, compare the hash to the known preview DB
  URL, then **delete it before merging**.
- **Fork PRs stay mergeable** — open one from a fork (or simulate via a branch
  without secrets) and confirm `checks / *` all run and pass while
  `Deploy Preview` shows as skipped, not failed.
- **Closing/reopening the PR cleans up and recreates the Neon branch** correctly
  (`neon-cleanup.yml` / `create-branch-action` idempotency).

## 5. Turn off Neon's preview-branch automation

Do this **after** the checks above pass, **immediately before merging**, with no
other PRs open. Neon console → Vercel integration → turn off preview branch
automation. Between doing this and merging, any other open PR still targeting
the old `vercel.json` would get a preview pointed at **production** — keep this
window to minutes.

## 6. Merge

`production.yml` fires on the merge commit: checks → migrate (should be a no-op
the first time) → `vc deploy --prod`. Watch it run. Then:

- Add `ENABLE_EXPERIMENTAL_COREPACK=1` to Preview + Development if you haven't
  already (step 2).
- Delete the old `Test` workflow's remaining runs (workflow id `283621308`) — it
  vanishes from the Actions UI once no runs remain.

## 7. Add required status checks

In the branch protection ruleset for `main` (ruleset `16919406`), alongside the
existing `required_linear_history`, add these as required status checks:

- `checks / format`
- `checks / lint`
- `checks / typecheck`
- `checks / test`
- `Deploy Preview`

Copy the exact strings from a completed workflow run rather than typing them —
reusable-workflow matrix jobs render as `<caller-job> / <matrix-name>` and it's
easy to get the separator wrong. Include `Deploy Preview`: it's the only check
that runs `next build`, which is the only thing that type-checks `proxy.ts` and
the Next.js route validators.

**Do not** enable "require branches to be up to date" — combined with
`required_linear_history` it forces an unnecessary rebase-and-rerun on every
merge.

---

## Ongoing operational note

Any new code that reads `process.env.POSTGRES_*` or `process.env.PG*` (beyond
today's `DATABASE_URL`) must be added to the `--env` list in
`.github/workflows/pull-request.yml`, or that code path will silently read
**production** data from a preview deployment once Neon's automation is off.
This is now written into `AGENTS.md`'s CI/CD philosophy section as a standing
rule, but it's worth knowing about directly.

## If something goes wrong

Revert the merge commit. `vercel.json` returns to no `git.deploymentEnabled` and
the old `buildCommand`, and the Vercel GitHub App resumes auto-deploying on the
next push — then re-enable Neon's preview automation. Secrets/variables added
above are inert and safe to leave in place.

A safe partial-rollback resting point (e.g. if the `--env`-vs-project-var
verification in step 4 fails): keep the new workflow files, drop
`git.deploymentEnabled` from `vercel.json`, restore the old `buildCommand`, and
delete `production.yml` and the `preview` job from `pull-request.yml`. You end
up with Vercel doing deploys and GitHub Actions doing checks — a smaller win,
but a working one.

## Deliberately out of scope (from the plan's Follow-ups)

Not blockers, but worth doing soon after cutover:

- Fix the real bug the CI fake `DATABASE_URL` papers over:
  `app/api/journeys/[journeyId]/syllabus/chat/tool.test.ts` imports the real
  `lib/db` module graph via automock. Add a proper `vi.mock('@/lib/db')` there
  (matching the `lib/db/__mocks__/index.ts` convention every other DB-touching
  test uses).
- Flip `installCommand` in `vercel.json` to `pnpm install --frozen-lockfile`
  once `ENABLE_EXPERIMENTAL_COREPACK` is confirmed on all environments.
- Add a label-triggered `reset-preview-db.yml` for long-lived PRs whose Neon
  branch has drifted from production schema.
- SHA-pin the third-party actions (`neondatabase/*`, `pnpm/action-setup`) and
  add `.github/dependabot.yml` for the `github-actions` ecosystem.
- Split the Vercel token into separate Preview/Production GitHub environments so
  a compromised preview workflow can't deploy to production.
