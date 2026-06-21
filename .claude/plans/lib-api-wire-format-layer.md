# Plan: `lib/api/` wire-format layer

## Context

Client components that call API routes sometimes need the same Zod schemas and
TypeScript types as the handlers that serve those routes. Previously, schemas
lived in `app/api/<route>/get.ts` alongside handler logic that pulls in
server-only imports (`@clerk/nextjs/server`). Importing from a server-only file
in a client component causes a build error.

The short-term fix was a colocated `app/api/journeys/schema.ts`. This plan
formalises the pattern: a `lib/api/` layer that owns **only** wire-format
schemas and types — no server imports, no business logic — making them safely
importable from anywhere. It also adds an architecture section to `AGENTS.md`.

### Grouping principle

`lib/api/` is organised by the **resource** a schema affects, not by route path.
Chat endpoints are RPC-style operations that act on messages — a cross-cutting
concern not specific to a single REST resource — so they live under
`lib/api/chat/`, separate from `lib/api/journeys/`.

---

## New directory structure

```
lib/api/
  journeys/
    index.ts       ← barrel: re-exports all public symbols
    list.ts        ← GET /api/journeys schemas/types
  chat/
    index.ts       ← barrel: re-exports all public symbols
    chapter.ts     ← POST /api/journeys/[id]/chapters/[id]/chat request types
    syllabus.ts    ← POST /api/journeys/[id]/syllabus/chat request types
```

---

## What belongs in `lib/api/<resource>/`

**Include:**

- Explicit TypeScript types with full JSDoc documentation
- Zod schemas typed as `z.ZodType<T>` to enforce compliance with the explicit
  type, with `.describe()` on each field matching the JSDoc
- Strict schemas (`.strict()` on every object schema) to reject extra fields

**Exclude:**

- Pagination token codecs (`encodePageToken` / `decodePageToken`) — handler
  concern; clients never construct or inspect tokens
- Server auth (`auth()`, `currentUser()`)
- Query/path param parsing — handler concern
- Business logic, entity-layer calls

---

## Type authoring pattern

Types are defined explicitly (not inferred with `z.infer<…>`). The Zod schema is
then typed as `z.ZodType<T>` so TypeScript enforces that the schema matches the
type. Field descriptions in `.describe()` mirror the JSDoc on the type property.

```ts
/**
 * Summary of a journey as returned by `GET /api/journeys`.
 */
export type JourneySummary = {
  /** Unique journey identifier. */
  id: string;
  /** Display title of the journey. */
  title: string;
};

export const journeySummarySchema: z.ZodType<JourneySummary> = z
  .object({
    id: z.string().describe('Unique journey identifier.'),
    title: z.string().describe('Display title of the journey.'),
  })
  .strict();
```

---

## Files to create

### `lib/api/journeys/list.ts`

Replaces `app/api/journeys/schema.ts`. Defines explicit types with JSDoc:

- `JourneySummary` type + `journeySummarySchema`
- `ListJourneysResponse` type + `listJourneysResponseSchema`

Note: `journeySummarySchema` replaces the current `journeySummarySchema` but
uses explicit type + `z.ZodType<JourneySummary>` + `.strict()`.

### `lib/api/journeys/index.ts`

Barrel re-exporting all public symbols from `list.ts`.

### `lib/api/chat/chapter.ts`

Replaces the inline types in the chapter chat route. Defines:

- `ChapterChatRequest` type +
  `chapterChatRequestSchema: z.ZodType<ChapterChatRequest>`

The `message` field uses `z.custom<UIMessage<ChatMessageMetadata>>()` (the AI
SDK `UIMessage` type is not representable as a plain Zod schema). `.strict()`
applies to the outer object.

### `lib/api/chat/syllabus.ts`

Same pattern for syllabus chat:

- `SyllabusChatRequest` type +
  `syllabusChatRequestSchema: z.ZodType<SyllabusChatRequest>`

### `lib/api/chat/index.ts`

Barrel re-exporting `ChapterChatRequest` and `SyllabusChatRequest` (no name
collision since the types are named distinctly in their source files).

---

## Files to update

### `app/api/journeys/get.ts`

- Remove: `journeySummarySchema`, `listJourneysResponseSchema`,
  `ListJourneysResponse`
- Add import from `@/lib/api/journeys`
- Keep re-exporting `ListJourneysResponse` for callers that import from the
  method file

### `app/api/journeys/[journeyId]/chapters/[chapterId]/chat/route.ts`

- Remove: local `RequestBody` type and `requestBodySchema`
- Add:
  `import { type ChapterChatRequest, chapterChatRequestSchema } from '@/lib/api/chat/chapter'`
- Update references from `RequestBody` → `ChapterChatRequest`

### `app/api/journeys/[journeyId]/syllabus/chat/route.ts`

- Same pattern; rename `RequestBody` → `SyllabusChatRequest`

### `app/[locale]/journeys/journeys-view-island.tsx`

- Change import from `@/app/api/journeys/schema` → `@/lib/api/journeys`

---

## Files to delete

- `app/api/journeys/schema.ts` — superseded by `lib/api/journeys/list.ts`

---

## `AGENTS.md` addition

Add a new section `## lib/api/ — wire-format layer` immediately after the
existing `## lib/server/*` section. Cover:

- **What it is**: shared Zod schemas and TypeScript types for HTTP request and
  response bodies; no server-only imports, safe to import from anywhere
- **Grouping rule**: organise by the **resource** a schema affects, not by route
  path — chat endpoints live under `lib/api/chat/` regardless of which REST
  route they hang off
- **Import rule**: client components **never** import from `app/api/`; they
  import wire-format types from `lib/api/`
- **Import rule**: handlers import their own schemas from `lib/api/`, not the
  other way around
- **What stays in the handler**: token codecs, server auth, query/path param
  schemas, business orchestration
- **Type authoring rule**: define types explicitly with JSDoc; type schemas as
  `z.ZodType<T>`; use `.strict()` on all object schemas; match `.describe()`
  strings to JSDoc property comments
- **Worked example** illustrating the pattern (type → schema → handler import →
  client import)

---

## Verification

1. `pnpm typecheck` — no errors
2. `pnpm lint` — no errors
3. `pnpm build` — clean build, no `server-only` boundary errors
4. Manual smoke-test: journeys page loads and "load more" pagination works
