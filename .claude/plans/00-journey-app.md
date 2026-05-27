# Tutorial App — Implementation Plan

## Context

A "teach yourself anything with AI" web app for a teenager (initial use case:
code/game tutorials, but topic-agnostic). The user-facing flow has three modes:
(1) a welcome chat that co-authors a **Syllabus**, (2) a transition that
persists Title + Syllabus + Memory and gives the lesson an identity/URI, (3)
per-chapter chat windows that teach, surface syllabus-affecting moments, and
silently update memory between chapters.

---

## Decisions

- **Concept name:** `Journey` (so: Journeys → Chapters → Sections)
- **AI provider:** Vercel AI Gateway → Anthropic; default `claude-sonnet-4-6`
  (plain `"provider/model"` string — no provider-specific SDK imports)
- **Styles in v1:** two seeded presets (`Teacher`, `Tutorial`); custom-style UI
  deferred
- **Auth:** Clerk required upfront — middleware protects everything except
  `/sign-in`, `/sign-up`
- **i18n:** `next-intl` v4 with locales `en` (default) and `fr`. All pages live
  under `app/[locale]/`; API routes stay at `app/api/` (locale flows via request
  body, not the URL).
- **IDs:** `nanoid(10)` for journey and chapter primary keys. Compact,
  URL-friendly, no extra dependency.
- **Project name:** _still TBD_ — placeholder `journey` for `package.json`.
  Trivial to rename later.

---

## Tech stack (locked from brief)

| Concern        | Choice                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework      | Next.js 16 (App Router), SSR-first: server components fetch initial state, Server Functions handle mutations, Route Handlers only where streaming requires them |
| UI             | shadcn/ui + Tailwind v4, brutalist B&W defaults, no custom styling yet                                                                                          |
| Icons          | `@phosphor-icons/react` (Lucide accepted only inside `components/ai-elements/`)                                                                                 |
| AI             | Vercel AI SDK (`streamText`, `generateText` + `Output.object`, tool calling), AI Elements for chat UI primitives, Streamdown for assistant markdown rendering   |
| DB             | Neon Postgres (Vercel Marketplace integration) + Drizzle ORM                                                                                                    |
| Object storage | Vercel Blob                                                                                                                                                     |
| Auth           | Clerk (Vercel Marketplace integration)                                                                                                                          |
| i18n           | `next-intl` — `app/[locale]/` dynamic segment routing, middleware locale detection via `proxy.ts`                                                               |
| Lint           | `eslint-config-loderunner` layered on top of `next/core-web-vitals`                                                                                             |
| Deploy         | Vercel — pushes to `main` deploy automatically                                                                                                                  |

### Architecture

Three layers, strictly separated:

1. **Backend packages** under `lib/server/<domain>/` — pure async functions that
   take typed inputs, talk to the DB / Blob, and return typed outputs. No
   Next.js, request, or auth concerns inside. Each package is "REST-ready": we
   could expose any function as a route handler tomorrow without changes.
2. **Feature modules** under `lib/<feature-name>/` — combine entities + AI + UI
   orchestration for one user-facing capability. Example: `lib/syllabus-chat/`
   owns the chat-driven syllabus-building flow — its prompts, its tool
   definition, and its bootstrap step. Prompts, tool definitions, model
   identifiers, and decoding parameters live with the feature, not centralized.
   Tool descriptions are written inline in the tool definition and are **not
   localized** — they instruct the model, not the user.
3. **Server actions** co-located with the component or page that needs them
   (e.g. `app/[locale]/_components/create-journey.ts`). Thin: authenticate via
   `auth()`, validate with Zod, delegate to a backend package or feature module.
   No separate `lib/actions/` directory.
4. **Route Handlers** under `app/api/` — only used when a streaming HTTP
   response is required. They delegate to feature modules and call `auth()` from
   Clerk first.

Pages are **server components by default** — they import directly from
`lib/server/<domain>` to fetch initial data, then pass it to nested client
components for interactivity. Streaming chat lives in client components that hit
the Route Handlers via AI SDK's `useChat`.

Layouts stay server components; auth gating uses Clerk middleware in `proxy.ts`
(not `middleware.ts`).

---

## Naming model

- **Journey** = the persisted lesson/tutorial (Title + Syllabus + Memory +
  Style + Chapters)
- **Syllabus** = ordered list of Chapters; each Chapter has ordered Sections;
  each has a summary
- **Chapter** = a unit of teaching with its own chat thread and a "completed"
  state
- **Memory** = Markdown string summarising inferred learner context (goals,
  prior knowledge, gaps, pace preferences). Generated at journey bootstrap;
  updated between chapters.
- **Style** = preset system-prompt fragment that controls teaching cadence
  (`Teacher` or `Tutorial`)

---

## Routing

Notion-style URIs: journey path ends with the id, chapter path does not
(uniqueness inside a journey comes from the chapter number).

```
/{locale}/                                              Welcome chat → builds Syllabus, then "Start journey"
/{locale}/journeys                                      List of past journeys
/{locale}/journeys/[journeySlug]                        Journey home — last URL segment is `<slug>-<nanoid>`
/{locale}/journeys/[journeySlug]/[chapterSlug]          Chapter chat — `<n>-<title-slug>`, e.g. `1-installing-python`
/{locale}/settings                                      Account
/{locale}/sign-in, /{locale}/sign-up                   Clerk
```

All in-app navigation (server redirects, client `router.push`) uses the
locale-aware exports from `i18n/navigation.ts` (`createNavigation(routing)`).
Code never imports from `next/navigation` directly for app pages.

URL helpers (in `lib/url.ts`):

- `journeyPath(id, title)` → `/journeys/${slugify(title)}-${id}`
  (locale-relative; locale prepended at call site)
- `chapterPath(journey, chapter)` →
  `${journeyPath(journey.id, journey.title)}/${chapter.idx}-${slugify(chapter.title)}`
- `parseJourneySlug(seg)` → splits trailing `-<10-char-nanoid>` off; lookup is
  by id
- `parseChapterSlug(seg)` → splits leading `<n>-` off; lookup is by
  `(journeyId, idx)`

`slugify` is defined in `lib/url.ts` (NFKD + ASCII fold for French accents,
length-capped, never returns empty).

If the slug part is stale (title changed since URL was generated), the page
resolves by id/idx and 308-redirects to the canonical path via
`permanentRedirect` from `i18n/navigation`.

`proxy.ts` (Clerk + next-intl composition) protects everything except
`/sign-in`, `/sign-up`. Do **not** create `middleware.ts`.

---

## Backend packages (`lib/server/`)

Pure functions, REST-ready. No Next.js imports.

```
lib/server/
  db/                    drizzle client (db, dbTx) + schema
  journeys/
    create.ts            createJourney({ userId, title, styleId, syllabus, memory }) → { id, title }
    list.ts              listJourneys({ userId }) → Journey[]
    get.ts               getJourney({ userId, id }) → Journey | null
    updateSyllabus.ts    updateJourneySyllabus({ userId, id, syllabus }) → Journey
    setStyle.ts          setJourneyStyle({ userId, id, styleId }) → void
  chapters/
    get.ts
    complete.ts          completeChapter({ userId, journeyId, idx }) — generates summary, persists, unlocks next
  syllabus/
    schema.ts            zod schemas: chapterSchema, syllabusSchema
  styles/
    presets.ts           STYLE_PRESETS constant with systemPromptFragments: { en, fr } per preset
    get.ts               getStyle(id), listPresets() — served in-memory from presets.ts (no DB table)
  users/
    ensure.ts            ensureUser(clerkUserId) — lazy upsert
```

## Feature modules (`lib/<feature-name>/`)

Each feature module combines AI + entity calls for one user capability.

```
lib/syllabus-chat/
  prompts.ts             composeSyllabusSystemPrompt({ style, locale }) — monolingual, locale-aware
  tool.ts                updateSyllabusDraft tool definition (inline description, not localized)
  bootstrap.ts           bootstrapJourney({ draft, messages, locale }) → { title, memory }
                         uses generateText + Output.object; memory is a Markdown string

lib/chapter-chat/        (D3)
  prompts.ts
  tools.ts               proposeSyllabusChange, updateMemory, markChapterComplete
  complete.ts            chapter completion summary generation
```

## Server actions (co-located with their feature)

Thin wrappers — authenticate, validate, delegate.

| File                                                                       | Action                                               | Calls                                   |
| -------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------- |
| `app/[locale]/_components/create-journey.ts`                               | `createJourneyAction`                                | `bootstrapJourney` then `createJourney` |
| `app/[locale]/journeys/[journeySlug]/_components/set-journey-style.ts`     | `setJourneyStyleAction`                              | `setJourneyStyle`                       |
| _(D3)_ `app/[locale]/journeys/[journeySlug]/[chapterSlug]/_components/...` | `applySyllabusChangeAction`, `completeChapterAction` | corresponding backend packages          |

## Route Handlers (streaming only)

| Route                                       | Purpose                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `POST /api/syllabus/chat`                   | Streamed syllabus chat. Tool: `updateSyllabusDraft`.                                          |
| `POST /api/journeys/[id]/chapters/[n]/chat` | Streamed chapter chat. Tools: `proposeSyllabusChange`, `updateMemory`, `markChapterComplete`. |

Both call `auth()` from Clerk first and delegate to the relevant feature module.

---

## Data model (Drizzle, Neon Postgres)

```ts
users    (id pk = clerkUserId, createdAt)

journeys (id text pk = nanoid(10), userId fk → users, title,
          styleId text,                         -- validated app-side via getStyle(); no DB FK (styles are in-memory)
          syllabus jsonb,                       -- SyllabusDraft shape
          memory text default '',              -- Markdown string; generated at bootstrap, updated between chapters
          currentChapterIndex int default 0,
          createdAt, updatedAt)

chapters (id text pk = nanoid(10), journeyId fk → journeys,
          idx int,                              -- 0-based
          title, status enum('locked'|'active'|'done'),
          summary text nullable,
          createdAt)
          -- unique index on (journeyId, idx)

messages (id, journeyId fk, chapterId fk nullable,
          phase enum('syllabus'|'chapter'),
          role enum('user'|'assistant'|'tool'),
          parts jsonb,                          -- AI SDK UIMessage shape
          createdAt)
          -- added in D3 (chapter chat persistence)
```

Notes:

- `styles` is **not** a DB table. Style presets live in
  `lib/server/styles/presets.ts` and are served in-memory. `journeys.styleId` is
  validated at the application layer.
- `memory` is a plain `text` column (Markdown). The bootstrap step and later
  chapter completions produce free-text summaries; no JSON-Patch ops.
- `syllabus` is denormalized as JSONB on the journey. `chapters` rows mirror it
  for per-chapter state and store `summary`.
- `dbTx` (WS-based Drizzle client from `@neondatabase/serverless`) is used for
  multi-statement transactions. `db` (HTTP-based) handles everything else.

---

## AI architecture

### Locale-monolingual prompts

Every composed system prompt is monolingual end-to-end. The locale comes from
the request (chat route handlers) or from `getLocale()` (server actions). Style
fragments, phase rules, and bootstrap instructions all match the request locale.
Tool descriptions are **not** localized — they instruct the model and are
written inline in the tool definition.

### System-prompt assembly (syllabus phase)

```
{style.systemPromptFragments[locale]}

{syllabusPhase rules in locale}
```

The model is told to rely on its own `updateSyllabusDraft` tool call history for
the current draft state.

### Phase 1 — Syllabus chat (`/api/syllabus/chat`)

- `streamText` with tool `updateSyllabusDraft` (full draft replacement,
  validated by Zod).
- Client reads tool parts (state `'output-available'` or `'input-available'`) to
  derive the latest draft.
- Chat history is ephemeral (no DB persistence in D2). Refresh wipes history.
- On "Start journey": server action calls `bootstrapJourney` (`generateText` +
  `Output.object`) to produce `{ title, memory }`, then transactionally inserts
  `Journey` + `Chapter` rows.

### Phase 2 — Chapter chat (`/api/journeys/[id]/chapters/[n]/chat`) — D3

- `streamText` with three tools:
  - `proposeSyllabusChange(reason, newSyllabus)` — emits a UI event; client
    renders a confirm dialog; on confirm → `applySyllabusChangeAction`.
  - `updateMemory(patch)` — applied server-side immediately, silent to user.
  - `markChapterComplete()` — sets a flag in the stream so the client shows "Go
    to next chapter".
- Markdown rendered via `MessageResponse` from AI Elements (wraps Streamdown
  with code, math, mermaid plugins).

### Phase 3 — Chapter transition — D3

- `completeChapterAction` runs `generateText` + `Output.object` over chapter
  messages → `summary`, persists, unlocks chapter `n+1`.

### Styles

Two presets in `lib/server/styles/presets.ts`: **Teacher** and **Tutorial**,
each with `systemPromptFragments: { en: string, fr: string }`. User picks one on
the welcome page (syllabus chat already uses the chosen tone) and can change it
on the journey-home page. Persisted on `journeys.styleId`.

### `generateObject` is deprecated

Use `generateText({ output: Output.object({ schema }) })` for all structured
output calls.

---

## UI composition

Page components live with the page; only cross-page reusables go to
`components/`.

Reusable building blocks from **AI Elements**: `Conversation`, `Message`,
`MessageResponse`, `PromptInput`. `MessageResponse` wraps Streamdown internally
— no separate `<MessageMarkdown>` wrapper needed.

### `/{locale}/` Welcome page

- Server component: `ensureUser`, `listPresets()`, renders shell.
- Client subtree (`WelcomeChat`): chat + sticky right panel with live
  `SyllabusDraftPanel` and `StylePicker`. Two-column layout.
- Locale sent in every `sendMessage` body so the route handler composes a
  monolingual system prompt.
- "Start journey" enabled once draft has ≥1 chapter and a style is picked →
  `createJourneyAction` → `router.push(journeyPath(...))` via `useRouter` from
  `i18n/navigation`.

### `/{locale}/journeys` List — D5

- Server component fetches via `listJourneys`. Renders cards.

### `/{locale}/journeys/[journeySlug]` Journey home

- Server component resolves id from slug, calls `getJourney`. If slug stale,
  308-redirect via `permanentRedirect` from `i18n/navigation` (locale
  preserved).
- Renders title, full chapter list, `StylePickerPersist` (client island that
  calls `setJourneyStyleAction`), "Begin / Resume Chapter N" placeholder.

### `/{locale}/journeys/[journeySlug]/[chapterSlug]` Chapter page — D3

- Server component resolves journey + chapter (`chaptersGet`), checks
  `status !== 'locked'`. Loads stored messages.
- Passes initial messages + journey context to client `ChapterChat` that uses
  `useChat` against the chapter chat route handler.
- Right panel: syllabus with current chapter highlighted.
- `SyllabusChangeDialog` triggered by `proposeSyllabusChange` tool call.
- "Go to next chapter" link appears when `markChapterComplete` fires →
  `completeChapterAction` → `router.push`.

### `/{locale}/settings` — D6

- Clerk `<UserProfile />`.

### Global layout

- `app/[locale]/layout.tsx`: ClerkProvider + NextIntlClientProvider + TopBar +
  fonts.
- `app/layout.tsx`: thin root shell only.
- TopBar (server): app name, current journey title (when in a journey), Clerk
  `<UserButton />`, link to `/{locale}/journeys`.

---

## Translation

All UI strings live in `messages/{en,fr}.json`. Every key added to `en.json`
ships with a `fr.json` translation in the same commit. A Vitest parity test
(`messages/parity.test.ts`) verifies recursive key equality between the two
files.

AI prompt strings live with their feature module (not in `messages/`). They are
`Record<Locale, string>` typed off the `Locale` type exported from
`i18n/routing.ts` — adding a locale fails TS until prompt strings catch up.

---

## Files (current layout)

```
app/
  layout.tsx                                  root shell (thin)
  [locale]/
    layout.tsx                                ClerkProvider + NextIntlClientProvider + TopBar
    page.tsx                                  Welcome (server shell)
    _components/
      welcome-chat.tsx                        client: useChat + draft state + Start journey
      syllabus-draft-panel.tsx               client: live draft view
      create-journey.ts                       server action: bootstrapJourney + createJourney
    journeys/
      page.tsx                                List (server) — D5
      _components/journey-card.tsx            — D5
      [journeySlug]/
        page.tsx                              Journey home (server)
        _components/
          journey-home.tsx                    server view + StylePickerPersist island
          style-picker-persist.tsx           client island: calls setJourneyStyleAction
          set-journey-style.ts               server action: setJourneyStyle
        [chapterSlug]/
          page.tsx                            Chapter page (server shell) — D3
          _components/
            chapter-chat.tsx                 client: useChat — D3
            syllabus-change-dialog.tsx       client — D3
            chapter-syllabus-panel.tsx       client — D3
    settings/page.tsx                         Clerk <UserProfile /> — D6
    sign-in/[[...rest]]/page.tsx
    sign-up/[[...rest]]/page.tsx
  api/
    syllabus/chat/route.ts                    streaming syllabus chat
    journeys/[id]/chapters/[n]/chat/route.ts  streaming chapter chat — D3
proxy.ts                                      Clerk + next-intl middleware composition

i18n/
  routing.ts                                  locales, defaultLocale, exports Locale type
  request.ts                                  message loading
  navigation.ts                               locale-aware Link, redirect, useRouter, usePathname

lib/
  url.ts                                      journeyPath, chapterPath, parseJourneySlug, parseChapterSlug, slugify
  url.test.ts                                 Vitest: round-trips, French-accent slug
  cn.ts
  server/
    db/
      index.ts                                db (neon-http) + dbTx (neon-serverless WS)
      schema.ts                               users, journeys, chapters (messages in D3)
    journeys/
      create.ts  list.ts  get.ts  updateSyllabus.ts  setStyle.ts
    chapters/
      get.ts  complete.ts (D3)
    syllabus/
      schema.ts                               chapterSchema, syllabusSchema (Zod)
    styles/
      presets.ts                              STYLE_PRESETS with { en, fr } fragments
      get.ts                                  getStyle(id), listPresets() — in-memory
    users/
      ensure.ts
  syllabus-chat/
    prompts.ts                                composeSyllabusSystemPrompt({ style, locale })
    tool.ts                                   updateSyllabusDraft tool (inline description)
    bootstrap.ts                              bootstrapJourney → { title, memory }
  chapter-chat/                               D3
    prompts.ts
    tools.ts
    complete.ts

components/                                   cross-page reusables only
  style-picker.tsx                            Teacher / Tutorial picker (welcome + journey home)
  message-markdown.tsx                        Streamdown wrapper (available; MessageResponse preferred)
  ai-elements/
    conversation.tsx  message.tsx  prompt-input.tsx
  top-bar.tsx
  ui/                                         shadcn components

messages/
  en.json  fr.json
  parity.test.ts                              Vitest: recursive key equality check
```

---

## Build order

1. **Bootstrap**: Next.js 16, Tailwind v4, shadcn, ESLint.
2. **Provision Vercel resources** via Marketplace: Neon Postgres, Clerk, Blob,
   AI Gateway. Pull env with `vercel env pull`.
3. **Drizzle schema + migration**: `users`, `journeys`, `chapters`. Style
   presets seeded in `lib/server/styles/presets.ts` (in-memory, no migration
   needed).
4. **Backend packages skeleton**: journeys, syllabus, styles, users.
5. **Clerk + next-intl wiring**: `proxy.ts`, `i18n/routing.ts`,
   `i18n/request.ts`, `i18n/navigation.ts`, sign-in/up pages, layouts.
6. **URL helpers + tests**: `lib/url.ts`, `lib/url.test.ts` (slug round-trips,
   French accents).
7. **Syllabus chat feature module**:
   `lib/syllabus-chat/{prompts,tool,bootstrap}.ts`.
8. **Welcome page** + `/api/syllabus/chat` route handler.
9. **`createJourneyAction`** wired to "Start journey" button.
10. **Journey home page** with persisting `StylePicker`.
11. **Chapter chat route handler + page** with all three tools (D3).
12. **`completeChapterAction`** + summary generation + next-chapter unlock (D3).
13. **`/journeys` list** page (D5).
14. **Settings page**: Clerk `<UserProfile />` (D6).
15. **Deploy to Vercel**, verify end-to-end in both locales.

---

## Verification

- **Local**: `pnpm dev`. Walk the full flow: build a syllabus in `/en`, start
  journey, run chapter 1, trigger a syllabus change to see the confirm dialog,
  complete chapter, resume in a new tab.
- **Locale**: same flow on `/fr` — assistant responses must contain no English
  words. Slug navigation must preserve locale (e.g. `/fr/journeys/...` not
  `/en/journeys/...`).
- **URL canonicalization**: visit `/{locale}/journeys/wrong-slug-<id>` — must
  308 to canonical with locale preserved. Same for chapter slug.
- **Package isolation**: smoke-import a `lib/server/journeys/*` function from a
  Node script — must work without Next.js context.
- **DB**: `drizzle-kit studio` to inspect `journeys.memory` + `chapters.summary`
  after each step.
- **Streaming**: confirm code blocks render progressively in chapter chat
  (Streamdown via `MessageResponse`).
- **Auth**: hit `/api/syllabus/chat` while signed out — must 401.
- **Persistence**: refresh mid-chapter — message history must reload from DB
  (D3+).
- **Deploy**: preview deployment loads, env vars resolve, Clerk sign-in works on
  the Vercel URL in both locales.
- **Tests**: `pnpm test` — `url.test.ts` (slug round-trips + accented titles) +
  `messages/parity.test.ts` (en/fr key parity) both pass.
