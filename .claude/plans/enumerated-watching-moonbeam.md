# Migrate to TypeScript 7

## Context

TypeScript 7.0 is the native Go port of the compiler — 8–12× faster
type-checking, same type system. This project is on `typescript@5.9.3`, so the
move also inherits every TypeScript 6.0 default change (6.0 was the transitional
release; 7.0 turns its deprecations into hard errors).

The headline risk is that **TypeScript 7.0 ships no JavaScript compiler API** —
it lands in 7.1. Every tool that calls the compiler programmatically breaks.
Audited against this dependency tree, exactly one does:

| Consumer                 | Needs the JS API? | Status on TS 7                                          |
| ------------------------ | ----------------- | ------------------------------------------------------- |
| `typescript-eslint@8.68` | **Yes**           | Peer range `>=4.8.4 <6.1.0`; crashes without the API    |
| `next build`             | No                | Spawns project-local `typescript/bin/tsc` — TS 7 ready  |
| `vitest --typecheck`     | No                | Spawns the `tsc` binary; only checks the package exists |
| `drizzle-kit`            | No                | No `typescript` dependency                              |
| `shadcn`                 | No                | Uses `ts-morph`, which vendors its own TypeScript       |
| `prettier`               | No                | Own TypeScript parser                                   |

Keeping typescript-eslint would force Microsoft's side-by-side alias layout
(`typescript` → `@typescript/typescript6`, TS 7 installed under a second name).
That layout **breaks `next build`**: Next resolves its checker at
`typescript/bin/tsc`, and `@typescript/typescript6` ships only `bin/tsc6`, so
the build would have to fall back to `experimental.useTypeScriptCli: false` and
type-check with the TS 6 API — i.e. no TS 7 in the build at all. Rejected.

**The oxfmt/oxlint migration removes the blocker.** Its plan
([`../migrate-to-oxmft-oxlint/.claude/plans/oxfmt-oxlint-are-replacements-for-federated-kay.md`](../migrate-to-oxmft-oxlint/.claude/plans/oxfmt-oxlint-are-replacements-for-federated-kay.md))
deletes ESLint and typescript-eslint outright, replacing the eight type-checked
rules with `oxlint --type-aware`, which runs on `oxlint-tsgolint` — a bundled
`typescript-go` checker versioned `7.0.2001` to track TS 7.0.2.

So the two migrations are complementary, and there is a second reason to do this
one: **that plan leaves the repo type-checking on two different TypeScript
versions.** Its verification step 4 says as much — "tsgolint lints with TS 7
semantics while `tsc` stays on 5.9; if oxlint reports type-aware errors that
`tsc` disagrees with, that divergence is the cause." This branch closes that
gap: one TypeScript version, used by the linter, the compiler, the test runner
and the build.

### Prerequisite

`worktree-migrate-to-oxmft-oxlint` must land first (it currently has no commits
ahead of `main`). Rebase this branch onto it, then confirm the blocker is
actually gone before touching anything:

```
pnpm why typescript-eslint     # must report nothing
pnpm why eslint                # eslint-config-next also pulls typescript-eslint
```

If either still resolves, stop — the alias layout is the only alternative and it
costs TS 7 in `next build`, which is the whole point.

---

## Findings that shaped this plan

Verified against npm, the published tarballs, and `node_modules` on 2026-08-25:

- **`next build` is already TS 7 ready and needs no configuration.** Next 16.3
  moved type-checking off the JS API and onto the project-local CLI;
  `experimental.useTypeScriptCli` defaults to **`true`** in the installed
  16.3.2. `verify-typescript-setup.js:82` declares the requirement as
  `typescript/bin/tsc`, and `typescript/runTypeScriptCli.js:59-67` carries an
  explicit workaround for TS 7's extensionless ESM bin. The TS 7.0.2 tarball
  ships `bin/tsc` and `lib/tsc.js`. This all works only while `typescript`
  resolves to the real TS 7 package.
- **TS 7's `lib/` directory is nearly empty**: `tsc.js`, `getExePath.js`,
  `version.cjs`. No `tsserver.js`, no `typescript.js`, **no `lib.*.d.ts`** — the
  standard library is embedded in the Go binary. This breaks the existing
  `.vscode/settings.json` `typescript.tsdk` pointer (step 6).
- **TS 7 has no language-service plugin API**, so `plugins: [{ name: "next" }]`
  stops working in the editor. `tsc` never consulted it anyway.
- **`--incremental` is supported, but Go and JS `.tsbuildinfo` files are
  mutually incompatible** — stale ones must be deleted when switching.
- **This tsconfig is already clean on everything 6.0/7.0 _removed_:**
  `moduleResolution: "bundler"` (not `node10`/`classic`),
  `esModuleInterop: true`, `target: "ES2022"` (not `es5`), no `baseUrl`, no
  `outFile`, no `downlevelIteration`, no legacy `module` namespaces. The
  breakage is entirely in _changed defaults_ (step 3).
- **The `types: []` default change probably already affects the oxlint branch.**
  tsgolint builds a real TS 7 program from this tsconfig, so it sees `types: []`
  today — with `process` unresolved, type-aware rules reason over error types.
  Adding `"types": ["node"]` is a fix both branches want; if the oxlint branch
  hits inexplicable type-aware findings, this is the first thing to check.
- **No TS 7-capable typescript-eslint exists** — `latest` is 8.68.0, `canary` is
  `8.68.1-alpha.3`, both capped below TS 6.1. There is no "wait a week" option
  short of TS 7.1.

---

## Target state

| Concern                 | Now                         | After                      |
| ----------------------- | --------------------------- | -------------------------- |
| `pnpm typecheck`        | `tsc@5.9.3`                 | `tsc@7.0.2` (Go)           |
| `next build` type check | TS 5.9 JS API               | TS 7 CLI checker (default) |
| `vitest --typecheck`    | spawns `tsc@5.9.3`          | spawns `tsc@7.0.2`         |
| oxlint `--type-aware`   | tsgolint TS 7 semantics     | tsgolint TS 7 semantics    |
| Editor language server  | workspace `typescript.tsdk` | TS 7 VS Code extension     |

One compiler version across all four consumers.

---

## Steps

### 1. Pre-flight report (throwaway, no dependency added)

TypeScript 6 ships a static-analysis pass listing everything 7.0 will reject,
and a baseline error list to diff against:

```
pnpm dlx -p @typescript/typescript6@6.0.2 tsc6 --ts6-migration
pnpm dlx -p @typescript/typescript6@6.0.2 tsc6 --noEmit    # keep this output
```

### 2. Swap the compiler

`package.json` pins exact versions throughout — keep that convention.

```
pnpm remove typescript
pnpm add -D typescript@7.0.2
rm -f *.tsbuildinfo tsconfig.tsbuildinfo
```

`*.tsbuildinfo` is already gitignored; the local files still have to go, since
the Go compiler cannot read the JS compiler's format.

### 3. `tsconfig.json`

Two changes, both driven by changed defaults rather than removed options:

- **Add `"types": ["node"]`.** The default flips from every `@types/*` package
  to `[]`. Four files use bare Node globals (`process.env`) and would fail:
  `app/api/journeys/get.ts`, `lib/ai/model.ts`, `lib/db/index.ts`,
  `lib/components/ai-elements/message.tsx`. `@types/react` needs **no** entry —
  React types are reached through imports and `jsx: "react-jsx"`. `@types/pg` is
  imported explicitly. Do not add anything else; a broad `types` array is the
  cost this default change exists to remove.
- **`noUncheckedSideEffectImports` now defaults to `true`.** The CSS side-effect
  imports in `app/layout.tsx:8-9` and `app/global-error.tsx:5` resolve only
  through `next-env.d.ts` → `next/types/global.d.ts`, which declares `*.css`.
  That file is generated and gitignored — see step 4.

`rootDir` also changes (inferred → `.`), but every `include` entry is already
under the repo root, so there is nothing to do.

Leave `plugins: [{ name: "next" }]` in place — `tsc` has never consulted it, and
removing it would only hurt if the editor plugin returns in 7.1. If TS 7 rejects
the key with a TS5023, move it into a `tsconfig.editor.json` that extends the
base rather than deleting it.

### 4. Guarantee generated types exist before type-checking

`next-env.d.ts` and `.next/types` are gitignored and produced by `next dev` /
`next build` / `next typegen`. The project already depends on them:
`RouteContext` is used in
`app/api/journeys/[journeyId]/chapters/[chapterId]/chat/route.ts` and
`app/api/journeys/[journeyId]/syllabus/chat/route.ts`, and under the new
`noUncheckedSideEffectImports` default the CSS imports join them.

`vercel.json` runs `pnpm test && pnpm build && pnpm db:migrate` — and
`pnpm test` is `vitest run --typecheck`, which type-checks the whole project
_before_ `next build` has generated anything.

Add a script:

```json
"typegen": "next typegen"
```

Verification step 2 determines whether a clean checkout actually fails today. If
it does, prepend the step in `vercel.json`:

```json
"buildCommand": "pnpm typegen && pnpm test && pnpm build && pnpm db:migrate"
```

Leave `vercel.json` alone if the current ordering already works — this is a
pre-existing condition that TS 7 may or may not expose, not something the
upgrade introduces.

### 5. Confirm `next build` picks up TS 7

No code change expected. Do **not** set `experimental.useTypeScriptCli` — the
default is already what we want, and setting it to `false` on TS 7 makes
`next build` exit with `E1467` ("does not provide the compiler API"). The build
log is the check: diagnostics print as raw `tsc` output with no Next.js code
frames.

### 6. Editor

`.vscode/settings.json` currently pins
`"typescript.tsdk": "node_modules/typescript/lib"`. That directory no longer
contains a `tsserver.js`, so **the entry must be removed** or VS Code fails to
start a workspace server. Keep `tailwindCSS.classFunctions`.

Install the dedicated **TypeScript 7 VS Code extension** (toggled with the
"Enable/Disable TypeScript 7 Language Server" commands). Add it to the
`.vscode/extensions.json` that the oxlint branch creates for `oxc.oxc-vscode`.

### 7. Update `CLAUDE.md`

The tech-stack table's Framework row names TypeScript generically. Pin it to
TypeScript 7 and note that type-checking runs through the native CLI, next to
whatever the oxlint branch changed in the Formatter/Lint rows.

---

## What is deliberately lost

State these in the commit message.

1. **The Next.js tsserver plugin.** TS 7.0 has no plugin API, so the editor
   stops warning about invalid route segment config values, `'use client'`
   misuse, and client hooks in Server Components. Expected back in 7.1. The
   generated route types in `.next/types` are unaffected and still checked by
   `tsc` and `next build`.
2. **Next.js-formatted type errors in the build.** The CLI checker prints native
   `tsc` diagnostics without Next's code frames or route-specific rewriting.
3. **`--debug-build-paths` no longer narrows type-checking** — the CLI checker
   always checks the whole project selected by `tsconfig.json`, and Next warns
   when the two flags are combined.

---

## Verification

Run from a genuinely clean state — the point is to prove a fresh CI checkout
works, not an incrementally warm one.

```
rm -rf .next node_modules *.tsbuildinfo && pnpm install
```

1. **Compiler identity** — `pnpm exec tsc --version` reports 7.0.2 and
   `node -p "require('typescript/package.json').version"` agrees. If the second
   disagrees, an alias crept in.
2. **Clean-checkout ordering** — run `pnpm test` _before_ any typegen. Failures
   on `RouteContext` or the CSS imports confirm step 4's `vercel.json` change is
   required; re-run after `pnpm typegen` to confirm the fix. A pass means leave
   `vercel.json` as it is.
3. **Type-check parity** — `pnpm typecheck` against the TS 6 baseline from step
   1. Every difference must be explained, not suppressed. The two expected
      sources of genuinely new errors are TS 6's stricter inference for untyped
      parameters and TS 7's Unicode-correct template literal types
      (`${infer Head}` against astral-plane characters). `tsconfig.json`'s
      `plugins` key must not produce a TS5023.
4. **Type tests** — `pnpm test` exercises `lib/syllabus/schema.test-d.ts` via
   `vitest --typecheck`, which spawns
   `tsc --noEmit --pretty false --incremental --tsBuildInfoFile …`. Vitest 4.1.5
   predates TS 7, so confirm it parses the output rather than assuming it. If it
   mis-parses, the fallback is dropping `--typecheck` from the `test` script:
   `tsc --noEmit` already covers that file through the `lib/**/*.ts` include, so
   only the per-test reporting is lost.
5. **Build** — `pnpm build` succeeds and the log shows raw `tsc` diagnostics.
   Introduce a deliberate type error and confirm the build _fails_ — a silently
   skipped checker is the failure mode worth ruling out explicitly.
6. **Lint agreement** — `pnpm lint` with `--type-aware`. This is the payoff:
   oxlint and `tsc` now share a TypeScript version, so any type-aware finding
   that `tsc` contradicts is a real bug rather than the 5.9-vs-7 divergence the
   oxlint plan had to tolerate.
7. **Timing** — `time pnpm typecheck` against the 5.9 baseline. Record it; the
   8–12× claim should be checked on this codebase, not taken on faith.
8. **Runtime smoke** — `pnpm dev`, load a journey and a chapter chat, confirm
   streaming works. `noEmit` is on and Next compiles with SWC, so no emitted
   code changes; this is a sanity check, not a deep pass.

## Rollback

One dependency swap: `pnpm add -D typescript@5.9.3`, revert `tsconfig.json` and
`.vscode/settings.json`, delete `.tsbuildinfo`. The oxlint migration is
independent and unaffected — tsgolint keeps its own TS 7 checker either way.

## Sources

- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
  ·
  [Announcing TypeScript 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)
- [Next.js `useTypeScriptCli`](https://nextjs.org/docs/app/api-reference/config/next-config-js/useTypeScriptCli)
  ·
  [Next.js TypeScript config — "Using TypeScript 7"](https://nextjs.org/docs/app/api-reference/config/typescript)
- [Oxlint type-aware linting](https://oxc.rs/docs/guide/usage/linter/type-aware.html)
  · [tsgolint](https://github.com/oxc-project/tsgolint)
- [Vitest `typecheck.checker`](https://vitest.dev/config/typecheck)
