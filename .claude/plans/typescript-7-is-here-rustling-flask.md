# Migrate to TypeScript 7

## Context

TypeScript 7.0 shipped as a native Go port of the compiler — 8–12× faster
type-checking, same type system. This project is on `typescript@5.9.3`, so the
move also inherits every TypeScript 6.0 default change (6.0 was the transitional
release; 7.0 makes its deprecations hard errors).

The obvious blocker is that **TypeScript 7.0 ships no JavaScript compiler API**
(it lands in 7.1). Any tool that calls the compiler programmatically breaks. The
concern raised — typescript-eslint — is real and is the _only_ one in this tree:

| Consumer                 | Needs the JS API? | Status on TS 7                                          |
| ------------------------ | ----------------- | ------------------------------------------------------- |
| `typescript-eslint@8.68` | **Yes**           | Peer range `>=4.8.4 <6.1.0`; crashes without the API    |
| `next build`             | No                | Spawns project-local `typescript/bin/tsc` — TS 7 ready  |
| `vitest --typecheck`     | No                | Spawns the `tsc` binary; only checks the package exists |
| `drizzle-kit`            | No                | No `typescript` dependency                              |
| `shadcn`                 | No                | Uses `ts-morph`, which vendors its own TypeScript       |
| `prettier`               | No                | Own TypeScript parser                                   |

Keeping typescript-eslint would force Microsoft's side-by-side alias layout
(`typescript` → `@typescript/typescript6`, TS 7 under a second name). That
layout **breaks `next build`**: Next resolves the checker at
`typescript/bin/tsc`, and `@typescript/typescript6` ships only `bin/tsc6`, so
the build would have to fall back to `experimental.useTypeScriptCli: false` and
type-check with the TS 6 API. That fallback was judged not worth doing.

The in-flight **oxfmt/oxlint migration removes the blocker outright.** oxlint's
type-aware rules run through `oxlint-tsgolint`, which embeds `typescript-go`;
its release is versioned `7.0.2001` to track TS 7.0.2 and its docs state
_"TypeScript 7.0+ is required"_. It replaces 59 of typescript-eslint's 61
type-aware rules and needs no `typescript` package at all.

**Therefore this branch rebases onto the oxfmt/oxlint branch once that lands,
then does the plain migration:** `typescript` = 7.x, no aliases, `next build`
type-checking with TS 7 through its default CLI checker.

### Prerequisite

`worktree-migrate-to-oxmft-oxlint` must be merged first (it currently has no
commits ahead of `main`). Before starting, confirm typescript-eslint is fully
gone:

```
pnpm why typescript-eslint     # must report nothing
pnpm why eslint                # eslint-config-next also pulls typescript-eslint
```

If anything still depends on it, stop — the alias layout is the only alternative
and it defeats the purpose.

---

## Steps

### 1. Pre-flight report (optional, throwaway)

TypeScript 6 ships a static-analysis pass that lists everything 7.0 will reject.
Run it without adding a dependency:

```
pnpm dlx -p @typescript/typescript6@6.0.2 tsc6 --ts6-migration
```

Also capture a TS 6 baseline to diff against later:

```
pnpm dlx -p @typescript/typescript6@6.0.2 tsc6 --noEmit
```

### 2. Swap the compiler

`package.json` pins exact versions throughout — keep that convention.

```
pnpm remove typescript
pnpm add -D typescript@7.0.2
```

Delete stale incremental state: the Go compiler's `.tsbuildinfo` format is
incompatible with the JS compiler's. `*.tsbuildinfo` is already gitignored, but
local files must go:

```
rm -f *.tsbuildinfo tsconfig.tsbuildinfo
```

### 3. `tsconfig.json`

Audited against the 6.0/7.0 default changes. The existing config is already
compliant on the removed options — `moduleResolution: "bundler"` (not `node10`),
`esModuleInterop: true`, `target: "ES2022"` (not `es5`), no `baseUrl`, no
`outFile`, no `downlevelIteration`. Two changes are needed:

- **Add `"types": ["node"]`.** The default flips from every `@types/*` package
  to `[]`. Four files use bare Node globals (`process.env`) and would fail:
  `app/api/journeys/get.ts`, `lib/ai/model.ts`, `lib/db/index.ts`,
  `lib/components/ai-elements/message.tsx`. `@types/react` does _not_ need an
  entry — React types are reached through imports and `jsx: "react-jsx"`.
  `@types/pg` is imported explicitly.
- **`noUncheckedSideEffectImports` now defaults to `true`.** The CSS side-effect
  imports in `app/layout.tsx:8-9` and `app/global-error.tsx:5` only resolve
  through `next-env.d.ts` → `next/types/global.d.ts`, which declares `*.css`.
  That file is gitignored and generated. See step 4.

Leave `plugins: [{ name: "next" }]` in place — it is editor-only and never
consulted by `tsc`. If TS 7 rejects the key outright (verify in step 6), move it
into a `tsconfig.editor.json` that extends the base rather than deleting it.

### 4. Guarantee generated types exist before type-checking

`next-env.d.ts` and `.next/types` are gitignored and produced by `next dev` /
`next build` / `next typegen`. The project already depends on them:
`RouteContext` is used in
`app/api/journeys/[journeyId]/chapters/[chapterId]/chat/route.ts` and
`app/api/journeys/[journeyId]/syllabus/chat/route.ts`, and under the new
`noUncheckedSideEffectImports` default the CSS imports join them.

`vercel.json` currently runs `pnpm test && pnpm build && pnpm db:migrate` — and
`pnpm test` runs `vitest --typecheck`, which type-checks the whole project
_before_ `next build` has generated anything.

Add a script to `package.json`:

```json
"typegen": "next typegen"
```

Verify whether a clean checkout actually fails (step 6). If it does, prepend the
step in `vercel.json`:

```json
"buildCommand": "pnpm typegen && pnpm test && pnpm build && pnpm db:migrate"
```

Do not change it if the current ordering already works.

### 5. Turn on type-aware oxlint

Once on TS 7, enable the linting that was previously typescript-eslint's job:

```
pnpm add -D oxlint-tsgolint@7.0.2001
```

Enable via `options.typeAware: true` in the oxlint config (or `--type-aware` on
the CLI). Reconcile against `eslint.config.mjs`'s previous intent — the rules
that were deliberately tuned there were `import/no-deprecated` and
`@typescript-eslint/no-deprecated` at `warn`, plus the disabled
`react/react-in-jsx-scope` and `react/prop-types`.

Keep oxlint's `include` narrow: type-aware linting builds a real TypeScript
program, so an over-broad glob is the main performance trap.

### 6. Editor

TS 7 has no `lib/typescript.js`, so VS Code's "Use Workspace Version" no longer
works with the built-in TypeScript extension. Install the dedicated **TypeScript
7 extension** (toggled with the "Enable/Disable TypeScript 7 Language Server"
commands).

Known regression, worth stating in the PR: **the Next.js tsserver plugin stops
loading** — TS 7.0 has no plugin API. That costs the editor-side checks for
invalid route segment config, `'use client'` misuse, and client-hook placement
until 7.1. `next build` still validates everything the generated route types
cover.

Add `.vscode/extensions.json` recommending the extension.

### 7. Update `CLAUDE.md`

The tech-stack table names the toolchain. Update the TypeScript entry to 7 and
note the editor caveat, alongside whatever the oxlint branch already changed in
the Formatter/Lint rows.

---

## Verification

Run from a clean state — the point is to prove a fresh CI checkout works, not
just an incrementally warm one.

```
rm -rf .next node_modules *.tsbuildinfo && pnpm install
```

1. **Compiler identity** — `pnpm exec tsc --version` reports 7.0.2, and
   `node -p "require('typescript/package.json').version"` agrees.
2. **Clean-checkout ordering** — run `pnpm test` _before_ any typegen. If it
   fails on `RouteContext` or the CSS imports, that confirms step 4's
   `vercel.json` change is required; re-run after `pnpm typegen` to confirm the
   fix.
3. **Type-check parity** — `pnpm typecheck` against the TS 6 baseline from step
   1. Investigate any error that appears in one and not the other; the expected
      new-behaviour sources are TS 6's stricter untyped-parameter inference and
      TS 7's Unicode-correct template literal types. `tsconfig.json`'s `plugins`
      key must not produce a TS5023.
4. **Type tests** — `pnpm test` exercises `lib/syllabus/schema.test-d.ts`
   through `vitest --typecheck`, which spawns
   `tsc --noEmit --pretty false --incremental`. Confirm Vitest 4.1.5 parses TS
   7's diagnostic output. If it mis-parses, the fallback is dropping
   `--typecheck` from the `test` script — `tsc --noEmit` already covers that
   file via the `lib/**/*.ts` include, so only the per-test reporting is lost.
5. **Build** — `pnpm build`. Diagnostics should now print as raw `tsc` output
   without Next.js code frames; that is the expected signature of the CLI
   checker. Confirm `experimental.useTypeScriptCli` is _not_ set to `false`
   anywhere.
6. **Lint** — `pnpm lint` with type-aware rules on, `--max-warnings 0`.
7. **Runtime smoke** — `pnpm dev`, load a journey and a chapter chat, confirm
   streaming still works. Nothing here changes emitted code (`noEmit` is on and
   Next compiles with SWC), so this is a sanity check, not a deep pass.

## Rollback

Single dependency swap: `pnpm add -D typescript@5.9.3`, revert `tsconfig.json`,
delete `.tsbuildinfo`. The oxlint migration is independent and stays.
