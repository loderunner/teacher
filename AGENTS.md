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

## Entity layer (`lib/db/`, `lib/journeys/`, `lib/chapters/`, …)

Modules like `lib/db/`, `lib/journeys/`, `lib/chapters/`, `lib/messages/`,
`lib/syllabus/`, `lib/styles/`, and `lib/users/` provide abstractions over
backend entities (schemas, persistence, queries). They are use-case agnostic and
contain no AI prompts, no chat orchestration, no UI-driven flows.

## `lib/api/` — wire-format layer

Modules under `lib/api/` own the Zod schemas and TypeScript types for HTTP
request and response bodies. They contain **no server-only imports, no business
logic, and no HTTP concerns** — making them safe to import from anywhere,
including client components.

**Grouping rule:** organise by the **resource** a schema affects, not by route
path. Chat endpoints are RPC-style operations that act on messages — a
cross-cutting concern not specific to a single REST resource — so they live
under `lib/api/chat/`.

**Import rule:** client components **never** import from `app/api/`; they import
wire-format types from `lib/api/`.

**Import rule:** handlers import their own schemas from `lib/api/`, not the
other way around.

**What stays in the handler:** token codecs (`encodePageToken` /
`decodePageToken`), server auth (`auth()`, `currentUser()`), query/path param
schemas, business orchestration.

**Type authoring rule:** define types explicitly with JSDoc; type schemas as
`z.ZodType<T>` so TypeScript enforces the schema matches the type; use
`z.strictObject` instead of `z.object` for all object schemas; match
`.describe()` strings to the JSDoc property comments.

Example:

```ts
// lib/api/journeys/list.ts

/** Summary of a journey as returned by `GET /api/journeys`. */
export type JourneySummary = {
  /** Unique journey identifier. */
  id: string;
  /** Display title of the journey. */
  title: string;
};

export const journeySummarySchema: z.ZodType<JourneySummary> = z.strictObject({
  id: z.string().describe('Unique journey identifier.'),
  title: z.string().describe('Display title of the journey.'),
});

// app/api/journeys/get.ts (handler)
import { type JourneySummary, journeySummarySchema } from '@/lib/api/journeys';

// app/[locale]/journeys/journeys-view-island.tsx (client component)
import {
  type JourneySummary,
  listJourneysResponseSchema,
} from '@/lib/api/journeys';
```

## Use cases live under `lib/<domain>/`

A module under `lib/<domain>/` (without the `server/` prefix) delivers a domain
operation: assembling a paginated response, activating a journey, orchestrating
an AI chat flow. It may span multiple entity-layer modules, apply business
rules, or call external services. It has no HTTP concerns (`Request`,
`Response`, status codes) and no React.

Example: `lib/syllabus-draft/` owns the chat-driven syllabus-building flow — its
prompts, its tool, and its bootstrap step. `lib/chapter-teaching/` owns the
chapter teaching phase. `lib/chat/` provides the shared client-side chat UI
primitives (hook, view, metadata).

Do not create a use-case module speculatively. Keep logic in the handler until
it earns extraction: a second caller needs it, or it contains rules worth
testing independently of HTTP.

## API handlers own the HTTP boundary

An API handler's job: authenticate the request, parse and validate input, call
into the use-case or entity layer, serialize the response. Wire format belongs
here — pagination token encoding, HTTP status codes, response shape. Business
logic does not.

A handler may call the entity layer (`lib/journeys/`, `lib/db/`, etc.) directly
for simple I/O with no domain logic. When a use-case module exists for a domain,
call that instead.

## Multi-file modules export through a barrel

When a module spans multiple files, expose its public API through a single
barrel. Consumers import from the module directory, not from internal files.

### Feature modules (`index.ts`)

```ts
// correct
import { useChatMessages, ChatView } from '@/lib/chat';

// incorrect — leaks internal file structure to consumers
import { useChatMessages } from '@/lib/chat/use-chat-messages';
import { ChatView } from '@/lib/chat/view';
```

The barrel re-exports only what is part of the module's public contract.
Internal helpers that are not meant for outside use are not re-exported.

### API endpoints (`route.ts`)

API routes follow the same barrel model, but Next.js only picks up `route.ts` as
the entry point — not `index.ts`. Split each HTTP method into its own file; keep
`route.ts` as a thin re-export barrel.

```
app/api/foo/
├── route.ts       ← barrel (Next.js entry point)
├── get.test.ts
├── get.ts
├── post.test.ts
└── post.ts
```

Each method file owns its handler, request/response types, and Zod schemas.
Clients import types from the method file (e.g. `@/app/api/foo/post`), not from
`route.ts`.

```ts
// post.ts
export type RequestBody = {
  /** The name of the Foo to create */
  name: string;
};

const requestBodySchema: z.ZodType<RequestBody> = z.object({
  name: z.string(),
});

export type ResponseBody = {
  /** The created Foo's ID */
  id: string;
  /** The created Foo's name */
  name: string;
};

const responseBodySchema: z.ZodType<ResponseBody> = z.object({
  id: z.string(),
  name: z.string(),
});

export async function POST(
  req: Request,
  context: RouteContext,
): Promise<NextResponse<ResponseBody>> {
  // ...
}
```

```ts
// route.ts
export { POST } from './post';
export { GET } from './get';
```

`route.ts` re-exports only HTTP method handlers. Types, schemas, and helpers
stay in the method files — imported explicitly by consumers and tests.

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

shadcn/ui code is copied into `lib/components/ui/` by the CLI — it lives in this
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

Move a file under a `lib/` subdirectory only when it is used by two or more
unrelated routes. Do not create intermediate shared directories; if genuine
sharing appears, lift directly to `lib/`.

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

### Source directory boundary

No source files live outside `app/` or `lib/`. Config and setup files
(`*.config.ts`, `proxy.ts`, etc.) may remain at the repository root, but all
application source belongs under one of the two canonical directories.

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
under `lib/` do not carry `'use client'` because they cannot know whether a
caller will place them at a server/client boundary.

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
`ChatViewIsland` wraps `ChatView`, lives in `journey-chat-view-island.tsx`. This
makes it immediately obvious the file is a boundary shim, not a semantic
component.

```
app/[locale]/journeys/[journeySlug]/syllabus/
├── syllabus-view.tsx            ← Server Component
└── journey-chat-view-island.tsx ← 'use client' thin wrapper (the boundary)

lib/chat/
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

## JSON validation and serialization

Use Zod schemas at every JSON boundary. Parse untrusted input with the schema
after `JSON.parse` or `req.json()`. Run trusted output through the schema before
`JSON.stringify` or `Response.json()` — this validates shape and strips fields
the schema does not allow.

Infer TypeScript types with `z.infer<typeof …>`; do not maintain parallel
hand-written types for the same shape.

### Schema ownership

Who defines the schema depends on the boundary:

- **API endpoints** — each method file (`get.ts`, `post.ts`, …) owns the Zod
  schemas and exported types for its request and response bodies. Shared helpers
  (e.g. page-token codecs) live in the method file or in colocated modules under
  the same route directory. Clients import types from the method file; they do
  not redefine the shape.
- **Database JSONB columns** — the persistence module that executes the queries
  owns the Zod schemas (e.g. `lib/syllabus/schema.ts` colocated with the queries
  that read and write the column). Callers of that module import the exported
  types; they do not parse or validate JSONB themselves.

Validate all **incoming** JSON:

- API request bodies (`req.json()`, webhook payloads, etc.)
- JSON/JSONB columns read from `SELECT` results

Serialize all **outgoing** JSON:

- API response bodies (`Response.json()`, etc.)
- JSON/JSONB column values written by `INSERT` or `UPDATE`

```ts
// correct — validate after parse
let parsed: RequestBody;
try {
  parsed = requestBodySchema.parse(await req.json());
} catch {
  return new Response('Bad Request', { status: 400 });
}

// incorrect — trust parsed JSON
const parsed = (await req.json()) as RequestBody;

// correct — validate JSON column after SELECT
const syllabus = syllabusSchema.parse(row.syllabus);

// correct — serialize before write
await db.update(journeys).set({ syllabus: syllabusSchema.parse(syllabus) });

// incorrect — persist unvalidated JSON
await db.update(journeys).set({ syllabus });
```

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

## Pagination

List endpoints that are paginated use **cursor-based pagination** — never offset
(`?page=` / `?offset=`).

Pagination tokens are an **API concern**. Route handlers own the full token
lifecycle: deserialize and validate incoming `pageToken` query parameters, call
underlying the entity layer (`lib/journeys/`, `lib/db/`, etc.) functions with
the decoded cursor fields, then serialize `nextPageToken` on the way out.
Entity-layer functions never accept or return opaque token strings — they take
plain cursor values (e.g. `updatedAt` and `id`) that the handler extracted from
a valid token.

```ts
// route handler — owns tokens
const decoded = decodePageToken(rawToken);
if (decoded === null) {
  return new Response('Bad Request', { status: 400 });
}
const items = await listJourneys({ userId, limit, ...decoded });

// entity layer — owns the query, not the wire format
type ListJourneysParams = {
  userId: string;
  limit: number;
  updatedAt?: Date;
  id?: string;
};
```

### Naming

Use Google's page token convention:

- Request: `?pageToken=<token>` — omit for the first page
- Response: `{ items: T[], nextPageToken: string | null }` — `null` signals the
  last page

Clients **never construct tokens**. They only echo back what the server placed
in `nextPageToken`. This makes inclusiveness, sort direction, and tie-breaking
invisible to the caller.

### Cursor encoding

Implement `encodePageToken` / `decodePageToken` next to the route handler (or in
colocated modules under the same route directory). Do not put token codecs in
the entity layer (`lib/journeys/`, `lib/db/`, etc.).

Encode cursors as a **fixed-width binary struct** serialized to `base64url` — no
JSON, no field names, no separators. Map each cursor field to a fixed byte range
(e.g. an `int64` for a timestamp, a fixed-length ASCII ID). Decode by reading
the same offsets in reverse. This keeps tokens short and opaque.

Example for an `(updatedAt, id)` cursor:

```
[0..7]  int64 big-endian — updatedAt milliseconds since Unix epoch
[8..17] ASCII            — 10-char nanoid
→ 18 bytes → 24 base64url chars
```

### Stability

When the sort key can have ties, include a secondary key (e.g. the row ID) in
both the cursor and the `WHERE` predicate:

```sql
WHERE (updated_at < $1) OR (updated_at = $1 AND id < $2)
ORDER BY updated_at DESC, id DESC
```

The database index must cover all fields in the predicate.

## Git

Keep commit messages to a single line, maximum 80 characters.

<!-- NEXT-AGENTS-MD-START -->

[Next.js Docs Index]|root: ./node_modules/next/dist/docs|STOP. What you remember
about Next.js is WRONG for this project. Always search docs and read before any
task.|If docs missing, run this command first: npx @next/codemod agents-md
--output
AGENTS.md|01-app:{04-glossary.md}|01-app/01-getting-started:{01-installation.md,02-project-structure.md,03-layouts-and-pages.md,04-linking-and-navigating.md,05-server-and-client-components.md,06-fetching-data.md,07-mutating-data.md,08-caching.md,09-revalidating.md,10-error-handling.md,11-css.md,12-images.md,13-fonts.md,14-metadata-and-og-images.md,15-route-handlers.md,16-proxy.md,17-deploying.md,18-upgrading.md}|01-app/02-guides:{ai-agents.md,analytics.md,authentication.md,backend-for-frontend.md,caching-without-cache-components.md,cdn-caching.md,ci-build-caching.md,content-security-policy.md,css-in-js.md,custom-server.md,data-security.md,debugging.md,deploying-to-platforms.md,draft-mode.md,environment-variables.md,forms.md,how-revalidation-works.md,incremental-static-regeneration.md,instant-navigation.md,instrumentation.md,internationalization.md,json-ld.md,lazy-loading.md,local-development.md,mcp.md,mdx.md,memory-usage.md,migrating-to-cache-components.md,multi-tenant.md,multi-zones.md,open-telemetry.md,package-bundling.md,ppr-platform-guide.md,prefetching.md,preserving-ui-state.md,preventing-flash-before-hydration.md,production-checklist.md,progressive-web-apps.md,public-static-pages.md,redirecting.md,rendering-philosophy.md,sass.md,scripts.md,self-hosting.md,single-page-applications.md,static-exports.md,streaming.md,tailwind-v3-css.md,third-party-libraries.md,videos.md,view-transitions.md}|01-app/02-guides/migrating:{app-router-migration.md,from-create-react-app.md,from-vite.md}|01-app/02-guides/testing:{cypress.md,jest.md,playwright.md,vitest.md}|01-app/02-guides/upgrading:{codemods.md,version-14.md,version-15.md,version-16.md}|01-app/03-api-reference:{07-edge.md,08-turbopack.md}|01-app/03-api-reference/01-directives:{use-cache-private.md,use-cache-remote.md,use-cache.md,use-client.md,use-server.md}|01-app/03-api-reference/02-components:{font.md,form.md,image.md,link.md,script.md}|01-app/03-api-reference/03-file-conventions/01-metadata:{app-icons.md,manifest.md,opengraph-image.md,robots.md,sitemap.md}|01-app/03-api-reference/03-file-conventions/02-route-segment-config:{dynamicParams.md,instant.md,maxDuration.md,preferredRegion.md,runtime.md}|01-app/03-api-reference/03-file-conventions:{default.md,dynamic-routes.md,error.md,forbidden.md,instrumentation-client.md,instrumentation.md,intercepting-routes.md,layout.md,loading.md,mdx-components.md,not-found.md,page.md,parallel-routes.md,proxy.md,public-folder.md,route-groups.md,route.md,src-folder.md,template.md,unauthorized.md}|01-app/03-api-reference/04-functions:{after.md,cacheLife.md,cacheTag.md,catchError.md,connection.md,cookies.md,draft-mode.md,fetch.md,forbidden.md,generate-image-metadata.md,generate-metadata.md,generate-sitemaps.md,generate-static-params.md,generate-viewport.md,headers.md,image-response.md,next-request.md,next-response.md,not-found.md,permanentRedirect.md,redirect.md,refresh.md,revalidatePath.md,revalidateTag.md,unauthorized.md,unstable_cache.md,unstable_noStore.md,unstable_rethrow.md,updateTag.md,use-link-status.md,use-params.md,use-pathname.md,use-report-web-vitals.md,use-router.md,use-search-params.md,use-selected-layout-segment.md,use-selected-layout-segments.md,userAgent.md}|01-app/03-api-reference/05-config/01-next-config-js:{adapterPath.md,allowedDevOrigins.md,appDir.md,assetPrefix.md,authInterrupts.md,basePath.md,cacheComponents.md,cacheHandlers.md,cacheLife.md,compress.md,crossOrigin.md,cssChunking.md,deploymentId.md,devIndicators.md,distDir.md,env.md,expireTime.md,exportPathMap.md,generateBuildId.md,generateEtags.md,headers.md,htmlLimitedBots.md,httpAgentOptions.md,images.md,incrementalCacheHandlerPath.md,inlineCss.md,logging.md,mdxRs.md,onDemandEntries.md,optimizePackageImports.md,output.md,pageExtensions.md,poweredByHeader.md,productionBrowserSourceMaps.md,proxyClientMaxBodySize.md,reactCompiler.md,reactMaxHeadersLength.md,reactStrictMode.md,redirects.md,rewrites.md,sassOptions.md,serverActions.md,serverComponentsHmrCache.md,serverExternalPackages.md,staleTimes.md,staticGeneration.md,taint.md,trailingSlash.md,transpilePackages.md,turbopack.md,turbopackFileSystemCache.md,turbopackIgnoreIssue.md,turbopackLocalPostcssConfig.md,typedRoutes.md,typescript.md,urlImports.md,useLightningcss.md,viewTransition.md,webVitalsAttribution.md,webpack.md}|01-app/03-api-reference/05-config:{02-typescript.md,03-eslint.md}|01-app/03-api-reference/06-cli:{create-next-app.md,next.md}|01-app/03-api-reference/07-adapters:{01-configuration.md,02-creating-an-adapter.md,03-api-reference.md,04-testing-adapters.md,05-routing-with-next-routing.md,06-implementing-ppr-in-an-adapter.md,07-runtime-integration.md,08-invoking-entrypoints.md,09-output-types.md,10-routing-information.md,11-use-cases.md}|02-pages/01-getting-started:{01-installation.md,02-project-structure.md,04-images.md,05-fonts.md,06-css.md,11-deploying.md}|02-pages/02-guides:{analytics.md,authentication.md,babel.md,ci-build-caching.md,content-security-policy.md,css-in-js.md,custom-server.md,debugging.md,draft-mode.md,environment-variables.md,forms.md,incremental-static-regeneration.md,instrumentation.md,internationalization.md,lazy-loading.md,mdx.md,multi-zones.md,open-telemetry.md,package-bundling.md,post-css.md,preview-mode.md,production-checklist.md,redirecting.md,sass.md,scripts.md,self-hosting.md,static-exports.md,tailwind-v3-css.md,third-party-libraries.md}|02-pages/02-guides/migrating:{app-router-migration.md,from-create-react-app.md,from-vite.md}|02-pages/02-guides/testing:{cypress.md,jest.md,playwright.md,vitest.md}|02-pages/02-guides/upgrading:{codemods.md,version-10.md,version-11.md,version-12.md,version-13.md,version-14.md,version-9.md}|02-pages/03-building-your-application/01-routing:{01-pages-and-layouts.md,02-dynamic-routes.md,03-linking-and-navigating.md,05-custom-app.md,06-custom-document.md,07-api-routes.md,08-custom-error.md}|02-pages/03-building-your-application/02-rendering:{01-server-side-rendering.md,02-static-site-generation.md,04-automatic-static-optimization.md,05-client-side-rendering.md}|02-pages/03-building-your-application/03-data-fetching:{01-get-static-props.md,02-get-static-paths.md,03-get-server-side-props.md,05-client-side.md}|02-pages/03-building-your-application/06-configuring:{12-error-handling.md}|02-pages/04-api-reference:{06-edge.md,08-turbopack.md}|02-pages/04-api-reference/01-components:{font.md,form.md,head.md,image-legacy.md,image.md,link.md,script.md}|02-pages/04-api-reference/02-file-conventions:{instrumentation.md,proxy.md,public-folder.md,src-folder.md}|02-pages/04-api-reference/03-functions:{get-initial-props.md,get-server-side-props.md,get-static-paths.md,get-static-props.md,next-request.md,next-response.md,use-params.md,use-report-web-vitals.md,use-router.md,use-search-params.md,userAgent.md}|02-pages/04-api-reference/04-config/01-next-config-js:{adapterPath.md,allowedDevOrigins.md,assetPrefix.md,basePath.md,bundlePagesRouterDependencies.md,compress.md,crossOrigin.md,deploymentId.md,devIndicators.md,distDir.md,env.md,exportPathMap.md,generateBuildId.md,generateEtags.md,headers.md,httpAgentOptions.md,images.md,logging.md,onDemandEntries.md,optimizePackageImports.md,output.md,pageExtensions.md,poweredByHeader.md,productionBrowserSourceMaps.md,proxyClientMaxBodySize.md,reactStrictMode.md,redirects.md,rewrites.md,serverExternalPackages.md,trailingSlash.md,transpilePackages.md,turbopack.md,typescript.md,urlImports.md,useLightningcss.md,webVitalsAttribution.md,webpack.md}|02-pages/04-api-reference/04-config:{01-typescript.md,02-eslint.md}|02-pages/04-api-reference/05-cli:{create-next-app.md,next.md}|02-pages/04-api-reference/06-adapters:{01-configuration.md,02-creating-an-adapter.md,03-api-reference.md,04-testing-adapters.md,05-routing-with-next-routing.md,06-implementing-ppr-in-an-adapter.md,07-runtime-integration.md,08-invoking-entrypoints.md,09-output-types.md,10-routing-information.md,11-use-cases.md}|03-architecture:{accessibility.md,fast-refresh.md,nextjs-compiler.md,supported-browsers.md}|04-community:{01-contribution-guide.md,02-rspack.md}

<!-- NEXT-AGENTS-MD-END -->
