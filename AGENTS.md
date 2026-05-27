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

## Multi-file modules export through a barrel

When a feature module spans multiple files, expose its public API through a
single `index.ts` barrel. Consumers import from the module directory, not from
internal files.

```ts
// correct
import { useJourneyChat, JourneyChatView } from '@/lib/journey-chat';

// incorrect — leaks internal file structure to consumers
import { useJourneyChat } from '@/lib/journey-chat/use-journey-chat';
import { JourneyChatView } from '@/lib/journey-chat/view';
```

The barrel re-exports only what is part of the module's public contract.
Internal helpers that are not meant for outside use are not re-exported.

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

## shadcn/ui components are vendored, not imported

shadcn/ui code is copied into `components/ui/` by the CLI — it lives in this
repository like any other source file. Treat each newly added component as
unreviewed contributor code: pass it through `pnpm lint:fix`, then review it
against the coding standards below before using it. Typical adjustments are the
`cn` import path (`@/lib/tailwind`, not `@/lib/utils`), icon library
(`@phosphor-icons/react`, not `lucide-react`), quote style, JSDoc on exported
symbols, and naming conventions. The generated file should feel native to the
codebase by the time it is committed.

## File colocation in `app/`

Route-specific components, server actions, and other modules live directly in
the route directory alongside `page.tsx` — no `_components/` subdirectory.
Next.js only serves files named `page`, `layout`, `loading`, etc. as routes, so
plain `.ts` / `.tsx` files are safe to colocate without becoming endpoints.

```
app/[locale]/journeys/[journeySlug]/[chapterSlug]/
├── page.tsx                 ← route entry point
├── chapter-page.tsx         ← layout component
├── syllabus-panel.tsx       ← colocated, not a route
├── style-picker-persist.tsx ← colocated, not a route
└── set-journey-style.ts     ← colocated server action
```

Move a file to `components/` (root-level) only when it is used by two or more
unrelated routes. Do not create intermediate shared directories; if genuine
sharing appears, lift directly to the root.

## Testing

Tests live alongside the source files they exercise. A module `lib/foo/bar.ts`
has its unit tests in `lib/foo/bar.test.ts` and its integration tests in
`lib/foo/bar.integration.test.ts`.

Two test types, each with a different mocking contract:

- **Unit tests** — test a single module in isolation. Mock every import from
  outside the module under test using `vi.mock()`, `vi.fn()`.
- **Integration tests** — test a module with its real collaborators. Mock only
  externalities: network calls, databases, file system access, and third-party
  APIs.

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
function to a `const` variable over a nested `function` declaration.

An inline arrow callback is fine when the whole callback is three lines or fewer
(counting the line that contains `=>` and any continuation lines), for example
in `filter`, `map`, `reduce`, or Vitest `expect` helpers. If it grows past that,
assign it to a `const` (or extract a named function) instead of inlining.

```ts
// correct — short enough to inline
function processItems(items: string[]) {
  return items.map((item: string) => item.trim().toLowerCase());
}

// correct — named when you want a stable reference or clearer call site
function processItems(items: string[]) {
  const format = (item: string) => item.trim().toLowerCase();
  return items.map(format);
}

// incorrect — nested function declaration
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

## Component composition

When a component accepts content that ends up in the DOM, accept it as
**children** (or as a named-slot subcomponent), not as a string prop. String
props that render into DOM elements are a leaky interface — the parent ends up
reaching across the primitive to customize a grandchild's text, icon, or class.

```tsx
// incorrect — leaky string props
<Button label="Start journey" icon={ArrowRightIcon} onClick={…} />
<Header title="Limits and continuity" />

// correct — children-based composition
<Button onClick={…}>
  <ArrowRightIcon size={15} weight="bold" />
  {t('startJourney')}
</Button>

<ChatPageShell.Header>
  <Title>{chapter.title}</Title>
</ChatPageShell.Header>
```

When composition gets complex enough to warrant explicit slots, use the
**named-slot subcomponent pattern**:

```tsx
<Shell>
  <Shell.Header>…</Shell.Header>
  <Shell.Sidebar>…</Shell.Sidebar>
  <Shell.Content>…</Shell.Content>
</Shell>
```

Slots are exposed as static properties on the parent (e.g.
`Shell.Header = function ShellHeader(…)`), and the parent inspects its children
— or simply renders the subcomponents in fixed positions — to lay them out.

Data-driven props are still fine where the content is intrinsically structured
(e.g. a list of chapters, a table of rows). Rendering each item via `children`
would push every caller into hand-rolling the same item markup, which is the
duplication this rule exists to prevent.

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

## `'use client'` and `client-only`

`'use client'` marks a boundary in the React module graph — everything in its
import subtree becomes part of the client bundle. Place it **only on files
inside `app/`** (pages, layouts, and route-colocated components). Reusable files
under `lib/` and `components/` do not carry `'use client'` because they cannot
know whether a caller will place them at a server/client boundary.

Reusable files that require client-only capabilities instead import the
[`client-only`](https://www.npmjs.com/package/client-only) package, which
produces a build-time error if the file is accidentally imported into a Server
Component:

```ts
import 'client-only';
// hooks, browser APIs, event handlers safe to use below
```

A file needs `client-only` when it uses:

- `useState`, `useReducer`, `useRef`, or any hook that holds mutable state
- `useEffect`, `useLayoutEffect`, or other lifecycle hooks
- Event handlers wired to DOM elements (`onClick`, `onChange`, etc.)
- Browser-only APIs (`window`, `localStorage`, `navigator`, etc.)
- `useRouter` from `@/i18n/navigation` (wraps Next.js `useRouter`)
- Any custom hook that uses the above internally

A file does **not** need `client-only` for:

- `useTranslations` / `useLocale` from `next-intl` (v3+ supports Server
  Components)
- Pure data-in → markup-out components with no interactivity
- Components that only forward `children` without adding state or handlers

When a server-rendered page needs a small interactive island, create a thin
`'use client'` wrapper colocated in the route directory. The wrapper establishes
the boundary; the reusable components it imports are guarded by `client-only`.

Name the wrapper after the component it wraps with an `Island` suffix:
`JourneyChatViewIsland` wraps `JourneyChatView`, lives in
`journey-chat-view-island.tsx`. This makes it immediately obvious the file is a
boundary shim, not a semantic component.

```
app/[locale]/journeys/[journeySlug]/syllabus/
├── syllabus-view.tsx            ← Server Component
└── journey-chat-view-island.tsx ← 'use client' thin wrapper (the boundary)

lib/journey-chat/
└── view.tsx                     ← import 'client-only'; no 'use client'
```

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

## HTTP status codes

Use status codes that accurately reflect the nature of the failure, not just the
nearest approximation.

- **400 Bad Request** — the request body or query parameters are malformed or
  semantically invalid. The client sent something that cannot be understood or
  processed as-is.
- **404 Not Found** — the addressed resource does not exist. This includes route
  parameters that are syntactically invalid (e.g. a non-numeric ID segment): the
  URL simply points to nothing.
- **401 Unauthorized** — the request lacks valid authentication credentials.
- **403 Forbidden** — the request is authenticated but the caller does not have
  permission to access the resource.

The key distinction between 400 and 404 when parsing route parameters: if the
parameter is part of the URL path and its value makes no sense as a resource
identifier, the address is effectively non-existent — return 404, not 400.
Reserve 400 for problems with the request _body_.

## Testing

### Test structure

Group tests by exported symbol, then by method or scenario, using nested
`describe` blocks. Each `it` block must be fully independent — no test may rely
on state left behind by a sibling.

```ts
describe('UserService', () => {
  describe('createUser', () => {
    it('creates a user with valid input', async () => { ... });
    it('throws when email is already taken', async () => { ... });
  });

  describe('deleteUser', () => {
    it('deletes an existing user', async () => { ... });
  });
});
```

Use `beforeEach` to produce a fresh instance or mock for every test. Use
`beforeAll`/`afterAll` only for expensive shared resources that are genuinely
read-only within the suite (e.g. a started server).

### Mocking in unit tests

Declare all `vi.mock()` calls at the top of the file, after all imports. Extract
mocked exports into named `const mock*` variables with `vi.mocked()`, then call
mock function methods on those variables. Prefer this over returning a mock
object from the `vi.mock` factory — it keeps setup close to the test and avoids
hidden state.

```ts
import { send } from './mailer';

vi.mock('./mailer');

const mockSend = vi.mocked(send);

describe('UserService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends a welcome email on creation', async () => {
    mockSend.mockResolvedValueOnce({ messageId: 'abc' });

    await new UserService().createUser('a@b.com');

    expect(mockSend).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ to: 'a@b.com' }),
    );
  });
});
```

Rules:

- Use `mockDeep<T>()` from `vitest-mock-extended` only for class mocks, not
  plain objects or functions.
- Use `chainMock()` / `chainMocked()` from `chain-mock` for objects with
  chainable method APIs; do not use `vi.mocked()` for these.
- Extract mocked exports into `const mock*` variables with `vi.mocked()`; prefer
  calling mock function methods on those over returning a mock object from the
  `vi.mock` factory.
- Name mock variables with a `mock` prefix: `mockDB`, `mockClient`, `mockUser`.
- Call `vi.clearAllMocks()` in `beforeEach` to prevent state bleed between
  tests.
- Use `vi.useFakeTimers()` / `vi.useRealTimers()` in `beforeAll`/`afterAll` when
  the module under test uses `Date`, `setTimeout`, or `setInterval`.

### Assertions

Use `expect` from Vitest. Prefer the most specific matcher available — it
produces a better failure message than a generic `toBe(true)`.

```ts
// correct
expect(result).toEqual({ id: 1, name: 'Dan' });
expect(fn).toHaveBeenCalledExactlyOnceWith('arg');
await expect(promise).rejects.toThrow('error message');
expect(items).toHaveLength(3);
expect(str).toContain('substring');

// incorrect — prefer specific matchers
expect(result !== null).toBe(true);
expect(fn.mock.calls.length).toBe(1);
```

## Git

Keep commit messages to a single line, maximum 80 characters.
