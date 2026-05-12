<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may
all differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code. Heed deprecation
notices.

<!-- END:nextjs-agent-rules -->

---

# Tech stack

| Concern         | Choice                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Framework       | Next.js 16, App Router, TypeScript, React 19                                                                            |
| UI              | shadcn/ui + Tailwind CSS v4, brutalist B&W defaults, no custom styling                                                  |
| Icons           | `@phosphor-icons/react`                                                                                                 |
| AI chat UI      | AI Elements (primitives), Streamdown (markdown + streaming code blocks)                                                 |
| AI SDK          | Vercel AI SDK — `streamText`, `generateObject`, tool calling                                                            |
| AI provider     | Vercel AI Gateway → Anthropic `claude-sonnet-4-6` (plain `"provider/model"` strings — no provider-specific SDK imports) |
| Database        | Neon Postgres (Vercel Marketplace) + Drizzle ORM (`drizzle-orm/neon-http` + `@neondatabase/serverless`)                 |
| Object storage  | Vercel Blob                                                                                                             |
| Auth            | Clerk (Vercel Marketplace) + `@clerk/nextjs`                                                                            |
| i18n            | `next-intl` — `app/[locale]/` dynamic segment routing, middleware locale detection                                      |
| Package manager | pnpm — always use `pnpm add`/`pnpm remove`, never edit `package.json` directly                                          |
| Test runner     | Vitest                                                                                                                  |
| Formatter       | Prettier 3 — `pnpm lint:fix` to auto-format                                                                             |
| Lint            | `next/core-web-vitals` + `eslint-config-loderunner` — `pnpm lint` runs Prettier check then ESLint                       |
| Deploy          | Vercel — pushes to `main` deploy automatically                                                                          |

---

# Architecture

## `lib/server/*` is the entity layer

Modules under `lib/server/*` provide abstractions over backend entities
(schemas, persistence, queries). They are use-case agnostic and contain no AI
prompts, no chat orchestration, no UI-driven flows.

## Use cases live in their own feature module under `lib/<feature-name>/`

A feature module combines entities + AI + UI orchestration to deliver a
user-facing capability. Example: `lib/syllabus-chat/` owns the chat-driven
syllabus-building flow — its prompts, its tool, and its bootstrap step.

## A feature owns its AI config

Prompts, tool definitions, model identifiers, and decoding parameters live with
the feature that uses them. Model strings are inlined at each AI call site, not
centralized — different tasks may pick different models or settings. Tool
descriptions are written inline in the tool definition (not in a separate
strings module) and are not localized — they instruct the model, not the user.

## Text content is decoupled from UI components

The application is built for internationalization (i18n) from the ground up
using `next-intl`. UI components and pages are responsible for layout and
behavior, while display text is injected at runtime via translation
dictionaries. This separation ensures the interface can be fully localized
without modifying component code.

Never hardcode plain text strings in user-facing components.

---

# Coding standards

## Guiding principle

> Clear is better than clever.
>
> — Rob Pike, Go Proverbs

## Naming conventions

### Boolean variables

Use adjective-based names for `boolean` variables, not verb-based.

```ts
// correct
const hidden = true;
const outdated = false;
const closing = true;

// incorrect
const isHidden = true;
const shouldUpdate = false;
const willClose = true;
```

### Acronyms in camelCase and PascalCase

Put acronyms in all uppercase, except when the acronym starts a camelCase name.

```ts
// camelCase
(url, urlError, handleURL, encodeURLComponent, jsonSchema, parseYAML);

// PascalCase
(URL, URLHandler, EncryptedURL, JSONSchema, YAMLParser);

// incorrect
(handleUrl, createUrlHandler, JsonSchema, YamlParser);
```

## Functions

### Closures

When defining a closure inside a function body, prefer assigning an arrow
function to a `const` variable over a `function` declaration.

```ts
// correct
function processItems(items: string[]) {
  const format = (item: string) => item.trim().toLowerCase();
  return items.map(format);
}

// incorrect
function processItems(items: string[]) {
  function format(item: string) {
    return item.trim().toLowerCase();
  }
  return items.map(format);
}
```

### Arguments & return types

When a function takes or returns an object, define it as a named type rather
than inlining the shape at the call site. Named types are easier to document,
reuse, and refactor.

```ts
// correct
type CreateUserParams = {
  name: string;
  email: string;
  role: "admin" | "student";
};

type CreateUserResult = {
  id: string;
  createdAt: Date;
};

function createUser(params: CreateUserParams): CreateUserResult { ... }

// incorrect
function createUser(params: {
  name: string;
  email: string;
  role: "admin" | "student";
}): { id: string; createdAt: Date } { ... }
```

Destructure object parameters in the function signature, not the body.

```ts
// correct
function createUser({ name, email, role }: CreateUserParams): CreateUserResult { ... }

// incorrect
function createUser(params: CreateUserParams): CreateUserResult {
  const { name, email, role } = params;
  ...
}
```

## Type narrowing

Do not cast with `as`. Use type predicates (`value is Foo`) or type assertion
functions (`asserts value is Foo`) instead.

## Types and definitions

Do not create `types.ts` files. Define types close to their point of usage.

## Project structure

Organize files around feature concerns, not code categories. Prefer directories
named after what the code _does_ (`auth/`, `billing/`) over what it _is_
(`components/`, `hooks/`, `adapters/`).

## Documentation

Document exported TypeScript symbols with JSDoc. Document properties
individually on object types. Document function parameters. Add examples where
useful. Do not document unexported symbols.

## JSX

Keep JSX clean. Inline JavaScript is fine for simple expressions — string
interpolation, short ternaries, mapping a list to simple elements. When the
logic gets heavy, pull it out.

Two signals that logic belongs outside the JSX:

- It would span more than ~5 lines inside the expression.
- It produces nested component structure (conditionally rendered subtrees, lists
  of lists, etc.).

In those cases, extract a named `const` above the `return`, or a separate
component.

```tsx
// ✅ simple interpolation — fine inline
<p>Hello, {user.name}</p>

// ✅ short ternary — fine inline
<button>{loading ? 'Loading...' : 'Submit'}</button>

// ✅ list of simple elements — fine inline
<ul>
  {items.map((item) => (
    <li key={item.id}>{item.label}</li>
  ))}
</ul>

// ❌ conditional subtree with nesting — extract it
<div>
  {user.role === "admin" ? (
    <div>
      <h2>Admin panel</h2>
      <p>{user.email}</p>
      <button onClick={handleRevoke}>Revoke access</button>
    </div>
  ) : (
    <div>
      <h2>Member</h2>
      <p>{user.email}</p>
    </div>
  )}
</div>

// ✅ extracted — readable
const panel =
  user.role === "admin" ? (
    <AdminPanel email={user.email} onRevoke={handleRevoke} />
  ) : (
    <MemberPanel email={user.email} />
  );

return <div>{panel}</div>;
```

## `'use client'`

`'use client'` marks a boundary in the module graph. Place it on the
**outermost** file that requires client-only capabilities — everything that file
imports becomes part of the client bundle automatically; you do not re-declare
the directive in child files.

A file needs `'use client'` when it uses:

- `useState`, `useReducer`, `useRef`, or any hook that holds mutable state
- `useEffect`, `useLayoutEffect`, or other lifecycle hooks
- Event handlers wired to DOM elements (`onClick`, `onChange`, etc.)
- Browser-only APIs (`window`, `localStorage`, `navigator`, etc.)
- `useRouter` from `@/i18n/navigation` (wraps Next.js `useRouter`)
- Any custom hook that uses the above internally

A file does **not** need `'use client'` for:

- `useTranslations` / `useLocale` from `next-intl` (v3+ supports Server
  Components)
- Pure data-in → markup-out components with no interactivity
- Components that only forward `children` without adding state or handlers

Push the boundary as deep as possible: if only one small button in a large
layout needs interactivity, extract it into its own file and mark only that.

## CSS

Do not use `!important`.

## Logging

Log levels:

- `error` — something went wrong, the program could not function correctly
- `warning` — functioned as expected, but something warrants attention
- `info` — the program did something as expected
- `debug` — extra detail, or "the program is about to do something"

Never emit an `error`-level log and then rethrow. Either handle the error or
throw it — not both. Logging before rethrowing causes duplicate log lines for
the same error and false positives when errors are caught higher in the stack.

## Git

Keep commit messages to a single line, maximum 80 characters.
