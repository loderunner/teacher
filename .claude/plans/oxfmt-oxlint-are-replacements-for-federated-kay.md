# Migrate from Prettier + ESLint to oxfmt + oxlint

## Context

`pnpm lint` currently runs `prettier --check .` then `eslint --max-warnings 0`.
Measured on this worktree: **Prettier ~2.5s, ESLint ~17.6s, ~20s total**. The
ESLint cost is dominated by `typescript-eslint`'s `projectService` building a TS
program — the project deliberately uses eight type-checked rules
(`strict-boolean-expressions`, `no-unnecessary-condition`,
`prefer-nullish-coalescing`, `no-misused-promises`, …), so that cost is not
avoidable inside ESLint.

oxfmt and oxlint (oxc project, Rust) are drop-in replacements. The migration is
worth doing now because of one specific finding: oxlint's type-aware mode is
**stable** (July 2026) and covers **all eight** type-checked rules this project
depends on, so the strictness that makes ESLint slow here can be preserved
rather than traded away.

Outcome: one formatter, one linter, no ESLint, lint wall-clock down from ~20s to
low single digits.

---

## Findings that shaped this plan

Verified against oxc docs and npm on 2026-08-25:

- **oxfmt 0.65.0** (beta). Passes 100% of Prettier's JS/TS conformance tests.
  Formats JS/JSX/TS/TSX **and** JSON/JSONC, YAML, CSS, Markdown/MDX, TOML, HTML,
  GraphQL — so it covers every file Prettier currently touches here. Has
  `--migrate=prettier`, reads `.prettierignore` and `.gitignore`, and supports
  `proseWrap` and glob `overrides`.
  - Gotcha: **oxfmt's default `printWidth` is 100, Prettier's is 80.** Must be
    pinned explicitly or the whole codebase reflows.
- **oxlint 1.80.0** (production-ready; used by Kibana, Sentry, Renovate,
  Cloudflare). 865+ rules. Has a native `nextjs` plugin porting
  `@next/eslint-plugin-next`, and `react` (incl. `rules-of-hooks` and
  `exhaustive-deps`).
- **Type-aware linting is stable.** `oxlint --type-aware` + `oxlint-tsgolint`
  covers 59 of typescript-eslint's 61 type-aware rules.
  - **`oxlint-tsgolint@7.0.2001` has no `typescript` peer dependency** — it
    ships platform Go binaries (`@oxlint-tsgolint/darwin-arm64`, …) with its own
    TypeScript 7 checker. The docs' "TypeScript 7.0+ is required" is about
    _tsconfig validity under TS 7_, not about the installed `typescript`
    package. **This project stays on `typescript@5.9.3`; no TS 6/7 upgrade.**
  - This tsconfig is TS7-clean: no `baseUrl` (it uses bare `paths` with `@/*`),
    no removed module modes.
- **`next lint` was already removed in Next.js 16** and this repo already calls
  `eslint` directly, so nothing in the Next.js build couples to the linter.
- Confirmed **absent** from oxlint: `react/jsx-sort-props`, `import/order`,
  `import/no-deprecated` (all return 404 in the rule reference).

---

## Target state

| Concern                | Now                           | After                   |
| ---------------------- | ----------------------------- | ----------------------- |
| Format JS/TS/JSX       | Prettier 3                    | oxfmt                   |
| Format md/json/css/yml | Prettier 3                    | oxfmt                   |
| Import ordering        | `import-x/order` (ESLint)     | oxfmt `sortImports`     |
| Lint                   | ESLint 9 + 6 configs          | oxlint (`--type-aware`) |
| Custom rule            | `loderunner/no-chained-arrow` | oxlint JS plugin (port) |

Dependencies **removed**: `prettier`, `eslint`, `eslint-config-loderunner`,
`eslint-config-next`, `eslint-config-prettier`, `eslint-plugin-import-x`,
`@vitest/eslint-plugin`.

Dependencies **added**: `oxfmt`, `oxlint`, `oxlint-tsgolint`, `@oxlint/plugins`.

Scripts:

```json
"lint":     "oxfmt --check && oxlint --type-aware --max-warnings 0",
"lint:fix": "oxfmt && oxlint --type-aware --fix --max-warnings 0"
```

---

## Steps

Do these as separate commits — step 3 and step 5 each produce a large mechanical
diff, and mixing them makes review impossible.

### 1. Install

```
pnpm add -D oxfmt oxlint oxlint-tsgolint @oxlint/plugins
```

### 2. Formatter config — `.oxfmtrc.json`

Seed with `pnpm exec oxfmt --migrate=prettier`, then hand-correct. Target:

```jsonc
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "printWidth": 80, // Prettier's default; oxfmt's is 100
  "singleQuote": true,
  "ignorePatterns": [
    ".claude/skills/",
    ".claude/worktrees/",
    ".agents/skills/",
    "lib/db/migrations/", // NOTE: current .prettierignore says lib/server/migrations/ — stale path, fix it
    "pnpm-lock.yaml",
    "vercel.json",
  ],
  "overrides": [{ "files": ["**/*.md"], "options": { "proseWrap": "always" } }],
}
```

Every other Prettier default (`semi`, `tabWidth`, `trailingComma: "all"`,
`arrowParens`, `bracketSpacing`, `quoteProps`, `endOfLine`, `objectWrap`)
already matches oxfmt's default — do not restate them.

Delete `prettier.config.mjs` and `.prettierignore`.

**Watch `sortPackageJson` — it defaults to `true`** and will reorder
`package.json` keys. Inspect that diff and set it to `false` if unwanted.

### 3. Reformat + verify zero drift (own commit)

Run `pnpm exec oxfmt` with `sortImports` still **off**. Goal is a near-empty
diff on `.ts`/`.tsx`. Any hunk that appears is either a genuine oxfmt/Prettier
divergence or a mis-set option — investigate before accepting. Markdown, JSON,
CSS and YAML are the likeliest places for real differences.

### 4. Port the custom rule

`node_modules/eslint-config-loderunner/src/rules/no-chained-arrow.js` is a
40-line standard ESLint rule (bans `x => y => …` expression bodies, suggests a
block body). oxlint's JS plugin API is ESLint-v9 compatible, so this is close to
a copy. Create `oxlint-plugin.ts` at the repo root using `definePlugin` /
`defineRule` from `@oxlint/plugins`, and reference it from `jsPlugins`.

JS plugins are **alpha** — if the port misbehaves or conflicts with
`--type-aware`, drop the rule rather than blocking the migration, and say so.

### 5. Linter config — `.oxlintrc.json` (own commit)

Seed with `pnpm dlx @oxlint/migrate --type-aware`, then reconcile against the
mapping table below. Target shape:

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": [
    "eslint",
    "typescript",
    "unicorn",
    "oxc",
    "react",
    "nextjs",
    "jsx-a11y",
    "import",
    "vitest",
  ],
  "jsPlugins": ["./oxlint-plugin.ts"],
  "categories": { "correctness": "error" },
  "options": { "typeAware": true },
  "rules": {/* see mapping */},
  "ignorePatterns": [
    ".next/",
    "out/",
    "build/",
    "next-env.d.ts",
    ".agents/",
    ".claude/",
    "coverage/",
  ],
  "overrides": [
    {
      "files": ["**/*.test.ts", "**/*.test.tsx"],
      "rules": {
        "typescript/no-explicit-any": "off",
        "typescript/unbound-method": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-member-access": "off",
      },
    },
  ],
}
```

Note `plugins` **overwrites** the default set, so `eslint`, `typescript`,
`unicorn` and `oxc` must be listed explicitly even though they are on by
default.

Delete `eslint.config.mjs`.

### 6. Enable `sortImports`, drop `import-x/order` (own commit)

Add to `.oxfmtrc.json`:

```jsonc
"sortImports": {
  "ignoreCase": false,        // matches import-x alphabetize: { order: 'asc' } (case-sensitive)
  "newlinesBetween": true,    // matches 'newlines-between': 'always'
  "internalPattern": ["@/"],
  "sortSideEffects": false    // keeps `import 'client-only';` pinned at the top
}
```

oxfmt's default `groups` already match `import-x/order`'s grouping. Expect a
one-time reflow across ~144 files; review it.

### 7. Remove ESLint

```
pnpm remove eslint eslint-config-loderunner eslint-config-next eslint-config-prettier eslint-plugin-import-x @vitest/eslint-plugin prettier
```

Update `package.json` scripts. Add the `oxc.oxc-vscode` extension to
`.vscode/extensions.json` and point `editor.defaultFormatter` at it in
`.vscode/settings.json` (keep the existing `typescript.tsdk` and
`tailwindCSS.classFunctions` entries).

---

## Rule mapping (also the reference for an oxlint variant of `eslint-config-loderunner`)

**`loderunner/base`** → oxlint `correctness` category ≈ `eslint:recommended`,
plus:

| ESLint                                   | oxlint                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `eqeqeq`                                 | `eslint/eqeqeq`                                                                                              |
| `no-var`                                 | `eslint/no-var`                                                                                              |
| `no-duplicate-imports`                   | `eslint/no-duplicate-imports`                                                                                |
| `no-unused-vars` (+ `_` ignore patterns) | `eslint/no-unused-vars` — same options, and it covers TS files too (there is no `typescript/no-unused-vars`) |
| `loderunner/no-chained-arrow`            | JS plugin port (step 4)                                                                                      |

**`loderunner/typescript`** → `plugins: ["typescript"]` +
`options.typeAware: true`. All eight rules exist with matching option names:

| ESLint                                           | oxlint                                   | Notes                                                                                                                                                    |
| ------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@typescript-eslint/switch-exhaustiveness-check` | `typescript/switch-exhaustiveness-check` | type-aware; `considerDefaultExhaustiveForUnions` supported                                                                                               |
| `@typescript-eslint/strict-boolean-expressions`  | `typescript/strict-boolean-expressions`  | type-aware; **oxlint defaults differ** (`allowString`/`allowNumber`/`allowNullableObject` default `true`) — restate all eight `allow*: false` explicitly |
| `@typescript-eslint/prefer-nullish-coalescing`   | `typescript/prefer-nullish-coalescing`   | type-aware                                                                                                                                               |
| `@typescript-eslint/no-unnecessary-condition`    | `typescript/no-unnecessary-condition`    | type-aware                                                                                                                                               |
| `@typescript-eslint/no-misused-promises`         | `typescript/no-misused-promises`         | type-aware; `checksVoidReturn: false`                                                                                                                    |
| `@typescript-eslint/consistent-type-imports`     | `typescript/consistent-type-imports`     | style category; `prefer` + `fixStyle: "inline-type-imports"` supported                                                                                   |
| `@typescript-eslint/no-deprecated`               | `typescript/no-deprecated`               | type-aware, pedantic → set `"warn"`                                                                                                                      |
| `@typescript-eslint/require-await`               | `typescript/require-await`               | set `"off"`                                                                                                                                              |
| `no-redeclare` off                               | `eslint/no-redeclare`                    | set `"off"`                                                                                                                                              |

**`loderunner/react`** → `plugins: ["react"]` (oxlint's `react` plugin bundles
`eslint-plugin-react`, `react-hooks`, `react-refresh` and React Compiler rules).
`react/react-in-jsx-scope` and `react/prop-types` stay off.
`react/jsx-sort-props` **dropped — no oxlint equivalent.**

**`loderunner/import`** → `import-x/order` becomes oxfmt `sortImports` (step 6);
`import-x/no-deprecated` is covered by the type-aware
`typescript/no-deprecated`.

**`loderunner/vitest`** → the four `off` rules move into the `overrides` block.

**`loderunner/formatting`** → `eslint/curly: ["error", "all"]` (exists, style
category, auto-fixable).

**`next/core-web-vitals` + `next/typescript`** →
`plugins: ["nextjs", "react", "jsx-a11y"]` with `correctness` at error. oxlint's
`nextjs` plugin ports 20 `@next/next` rules including `no-img-element`,
`no-html-link-for-pages`, `no-sync-scripts`, `no-async-client-component`,
`google-font-display`.

---

## What is deliberately lost

State these in the commit message; do not let them surface as surprises.

1. **`react/jsx-sort-props`** — no oxlint equivalent. Was `warn`. Existing files
   keep their current prop order; it just stops being enforced.
2. **Named-specifier sorting inside import braces** — `import-x/order`'s
   `named: true` sorted the identifiers inside `{ … }`. oxfmt's `sortImports`
   sorts import _statements_ only ([oxc#20160] is open for this). Existing code
   is already sorted, so no reflow — it stops being enforced going forward.
3. **`import-x/no-deprecated`** — partially covered by
   `typescript/no-deprecated`, which is type-aware and broader for TS but does
   not do import-graph analysis of JS.
4. **`eslint-config-loderunner` is no longer consumed by this repo.** The
   mapping table above is the source material for an oxlint config package.

---

## Verification

1. `pnpm lint` — must be clean, and time it. Expect low single-digit seconds vs
   the ~20s baseline (`time pnpm lint`).
2. `git diff --stat` after step 3 must show essentially no `.ts`/`.tsx` churn.
   Non-trivial churn means an oxfmt option is wrong.
3. **Cross-check for lost coverage.** Before deleting ESLint (step 7), with both
   tools installed, run each and diff the findings:
   ```
   pnpm exec eslint -f json > /tmp/eslint.json
   pnpm exec oxlint --type-aware --format json > /tmp/oxlint.json
   ```
   Any file/rule ESLint flags that oxlint does not must be explained — either
   mapped to an oxlint rule or listed as an accepted loss above.
4. `pnpm typecheck` — confirms `tsc@5.9` still passes. tsgolint lints with TS 7
   semantics while `tsc` stays on 5.9; if oxlint reports type-aware errors that
   `tsc` disagrees with, that divergence is the cause. Investigate before
   suppressing.
5. `pnpm test` — 30 test files; confirms the vitest `overrides` block and that
   nothing in the reformat broke a snapshot or import.
6. `pnpm build` — Next.js 16 build must succeed (it no longer runs lint, so this
   only catches reformat damage).
7. Introduce a deliberate violation of each of the eight type-aware rules in a
   scratch file and confirm oxlint reports it — this is the load-bearing claim
   of the whole migration and should be proven, not assumed.
8. Verify the ported `no-chained-arrow` rule fires on
   `const f = (a) => (b) => a + b;`.

[oxc#20160]: https://github.com/oxc-project/oxc/issues/20160

## Sources

- [Oxfmt docs](https://oxc.rs/docs/guide/usage/formatter.html) ·
  [config reference](https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html)
  ·
  [migrate from Prettier](https://oxc.rs/docs/guide/usage/formatter/migrate-from-prettier.html)
  · [Oxfmt Beta announcement](https://oxc.rs/blog/2026-02-24-oxfmt-beta)
- [Oxlint docs](https://oxc.rs/docs/guide/usage/linter.html) ·
  [config](https://oxc.rs/docs/guide/usage/linter/config.html) ·
  [plugins](https://oxc.rs/docs/guide/usage/linter/plugins.html) ·
  [migrate from ESLint](https://oxc.rs/docs/guide/usage/linter/migrate-from-eslint)
- [Type-aware linting](https://oxc.rs/docs/guide/usage/linter/type-aware.html) ·
  [Type-Aware Linting Stable](https://oxc.rs/blog/2026-07-22-type-aware-linting-stable)
  · [tsgolint](https://github.com/oxc-project/tsgolint)
- [Oxlint JS Plugins Alpha](https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha.html)
- [Real-world migration report — Nicolas Charpentier, May 2026](https://charpeni.com/blog/migrating-from-eslint-biome-prettier-to-oxlint-oxfmt)
- [Next.js 16 upgrade guide (`next lint` removal)](https://nextjs.org/docs/app/guides/upgrading/version-16)
