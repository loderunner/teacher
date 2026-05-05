# Tutorial App — Implementation Plan

## Context

A "teach yourself anything with AI" web app for a teenager (initial use case: code/game tutorials, but topic-agnostic). The user-facing flow has three modes: (1) a welcome chat that co-authors a **Syllabus**, (2) a transition that persists Title + Syllabus + Memory and gives the lesson an identity/URI, (3) per-chapter chat windows that teach, surface syllabus-affecting moments, and silently update memory between chapters.

The greenfield repo at `/Users/chrales/Code/teacher` currently contains only `.claude/` and `.agents/` skill caches. Everything below is new code.

---

## Decisions

- **Concept name:** `Journey` (so: Journeys → Chapters → Sections)
- **AI provider:** Vercel AI Gateway → Anthropic; default `claude-sonnet-4-6`
- **Styles in v1:** two seeded presets (`Teacher`, `Tutorial`); custom-style UI deferred
- **Auth:** Clerk required upfront — middleware protects everything except `/sign-in`, `/sign-up`
- **Project name:** _still TBD_ — placeholder `journey` for `package.json`. Trivial to rename later; doesn't affect schema or routes.

---

## Tech stack (locked from brief)

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router), SSR-first: server components fetch initial state, Server Functions handle mutations, Route Handlers only where streaming requires them |
| UI | shadcn/ui + Tailwind, brutalist B&W defaults, no custom styling yet |
| AI | Vercel AI SDK (`streamText`, `generateObject`, tool calling), AI Elements for chat UI primitives, Streamdown for assistant markdown rendering |
| DB | Neon Postgres (Vercel Marketplace integration) + Drizzle ORM |
| Object storage | Vercel Blob |
| Auth | Clerk (Vercel Marketplace integration) |
| Lint | `@loderunner/eslint-config` layered on top of `next/core-web-vitals` |
| Deploy | Vercel |

### Architecture: SSR + isolated backend packages

Three layers, strictly separated:

1. **Backend packages** under `lib/server/<domain>/` — pure async functions that take typed inputs, talk to the DB / AI Gateway / Blob, and return typed outputs. No Next.js, request, or auth concerns inside. Each package is "REST-ready": we could expose any function as a route handler tomorrow without changes.
2. **Server Functions** (Next.js Server Actions) under `lib/actions/<domain>.ts` — thin wrappers that authenticate via `auth()` from Clerk, validate input with Zod, then call into a backend package. These are what client and server components invoke.
3. **Route Handlers** under `app/api/...` — only used when we genuinely need a streaming HTTP response (chat endpoints with `streamText`). They also delegate to backend packages.

Pages are **server components by default** — they import directly from `lib/server/<domain>` to fetch initial data, then pass it to nested client components for interactivity. Streaming chat lives in client components that hit the Route Handlers via AI SDK's `useChat`.

Layouts stay server components; auth gating uses Clerk middleware.

---

## Naming model

- **Journey** = the persisted lesson/tutorial (Title + Syllabus + Memory + Style + Chapters)
- **Syllabus** = ordered list of Chapters; each Chapter has ordered Sections; each has a summary
- **Chapter** = a unit of teaching with its own chat thread and a "completed" state
- **Memory** = JSON document of inferred user/context facts that the agent edits silently
- **Style** = preset system-prompt fragment that controls teaching cadence (`Teacher` or `Tutorial`)

---

## Routing

Notion-style URIs: journey path ends with the id, chapter path does not (uniqueness inside a journey comes from the chapter number).

```
/                                                       Welcome chat → builds Syllabus, then "Start journey"
/journeys                                               List of past journeys
/journeys/[journeySlug]                                 Journey home — last URL segment is `<slug>-<id>`
/journeys/[journeySlug]/[chapterSlug]                   Chapter chat — `<n>-<title-slug>`, e.g. `1-installing-python`
/settings                                               Account
/sign-in, /sign-up                                      Clerk
```

URL helpers (in `lib/url.ts`):
- `journeyPath(journey)` → `/journeys/${slugify(title)}-${id}`
- `chapterPath(journey, chapter)` → `${journeyPath(journey)}/${chapter.idx}-${slugify(chapter.title)}`
- `parseJourneySlug(seg)` → splits trailing `-<id>` off; lookup is by id
- `parseChapterSlug(seg)` → splits leading `<n>-` off; lookup is by `(journeyId, idx)`

If the slug part is stale (title changed since URL was generated), the page resolves by id/idx and 308-redirects to the canonical path.

`middleware.ts` (Clerk) protects everything except `/sign-in`, `/sign-up`.

---

## Backend packages (`lib/server/`)

Pure functions, REST-ready. No Next.js imports.

```
lib/server/
  db/                    drizzle client + schema (re-exported)
  ai/
    gateway.ts           AI Gateway client config (Anthropic, claude-sonnet-4-6)
    prompts.ts           system-prompt composer
    tools.ts             zod tool definitions: updateSyllabusDraft, proposeSyllabusChange,
                         updateMemory, markChapterComplete
  journeys/
    create.ts            create({ userId, title, syllabus, memory, style }) → Journey
    list.ts              list({ userId }) → Journey[]
    get.ts               get({ userId, id }) → Journey | null
    updateSyllabus.ts    updateSyllabus({ userId, id, syllabus }) → Journey
  chapters/
    get.ts
    complete.ts          complete({ userId, journeyId, idx }) — runs generateObject for summary, persists, unlocks next
  syllabus/
    schema.ts            zod schema for Syllabus
    bootstrap.ts         from a syllabus draft + chat → { title, memory } via generateObject
  memory/
    patch.ts             apply JSON-Patch ops to a memory document
  styles/
    presets.ts           Teacher / Tutorial fragments (placeholder text — final wording at impl time)
    get.ts
```

## Server Functions (`lib/actions/`)

Thin wrappers — authenticate, validate, delegate. Imported by client components and (where useful) server components.

| Action | Calls |
|---|---|
| `createJourney(draft, style)` | `syllabus.bootstrap` then `journeys.create` (style chosen on welcome page) |
| `listJourneys()` | `journeys.list` |
| `setJourneyStyle(journeyId, style)` | `journeys.setStyle` + `revalidatePath` |
| `applySyllabusChange(journeyId, syllabus)` | `journeys.updateSyllabus` + `revalidatePath` |
| `completeChapter(journeyId, idx)` | `chapters.complete` + `revalidatePath` |

## Route Handlers (streaming only)

| Route | Purpose |
|---|---|
| `POST /api/syllabus/chat` | Streamed syllabus chat. Tool: `updateSyllabusDraft`. |
| `POST /api/journeys/[id]/chapters/[n]/chat` | Streamed chapter chat. Tools: `proposeSyllabusChange` (UI confirms → `applySyllabusChange` action), `updateMemory` (silent, server-applied), `markChapterComplete` (UI shows next-chapter link → `completeChapter` action). |

Both delegate to `lib/server/ai/*` and call `auth()` from Clerk first.

---

## Data model (Drizzle, Neon Postgres)

```ts
// db/schema.ts
users           (id pk = clerkUserId, createdAt)
journeys         (id, userId fk, title, style, syllabus jsonb, memory jsonb,
                 currentChapterIndex int, createdAt, updatedAt)
chapters        (id, journeyId fk, idx int, title, status enum('locked'|'active'|'done'),
                 summary text nullable)
messages        (id, journeyId fk, chapterId fk nullable, phase enum('syllabus'|'chapter'),
                 role enum('user'|'assistant'|'tool'), parts jsonb, createdAt)
styles          (id, name, systemPromptFragment, isPreset bool)  -- v1: only presets
```

Notes:
- `syllabus` is denormalized as JSONB on the journey (single source of truth for the agent). `chapters` rows mirror it to enforce per-chapter state (locked/active/done) and store `summary`.
- `memory` is a JSONB document; the `updateMemory` tool produces JSON-Patch ops.
- `messages.parts` follows the AI SDK UIMessage shape so re-renders survive refresh.

---

## AI architecture

### System-prompt assembly
A small composer builds the prompt per request:
```
[Style.systemPromptFragment]
[Journey.title + Journey.syllabus snapshot]
[Memory snapshot]
[Phase-specific rules — syllabus building vs. chapter teaching]
[For chapter N: previous chapter summaries]
```

### Phase 1 — Syllabus chat (`/api/syllabus/chat`)
- `streamText` with tool `updateSyllabusDraft` (full draft replacement, validated by Zod).
- Server keeps the draft in the response stream; client maintains it in URL-less local state until the user clicks "Start journey" → `POST /api/journeys`.
- On "Start journey": one-shot call to `generateObject` to (a) generate a Title, (b) compress the chat into an initial Memory document.

### Phase 2 — Chapter chat (`/api/journeys/[id]/chapters/[n]/chat`)
- `streamText` with three tools:
  - `proposeSyllabusChange(reason, newSyllabus)` — emits a UI event; client renders a confirm dialog; on confirm → `PATCH /api/journeys/[id]/syllabus`.
  - `updateMemory(ops: JsonPatch[])` — applied server-side immediately, silent to user.
  - `markChapterComplete()` — sets a flag in the stream so the client shows "Go to next chapter".
- Markdown rendered with **Streamdown** (handles streaming code blocks + syntax highlighting).

### Phase 3 — Chapter transition
- `POST /api/journeys/[id]/chapters/[n]/complete` runs `generateObject` over the chapter messages → `summary`, persists, unlocks chapter `n+1`.

### Styles (v1)
Two presets seeded into `styles`: **Teacher** and **Tutorial**. The user picks one on the **welcome page** (so the syllabus-building chat already matches the chosen tone) and can change it on the journey-home page or between chapters; persisted on `journeys.style`. Custom styles are post-v1.

Detailed prompt wording is deferred to implementation time — the package interface is what matters here. The composer accepts a `Style` and emits its `systemPromptFragment` at the top of the assembled prompt; that's the only contract callers depend on.

---

## UI composition

Page components live with the page; only cross-page reusables go to `components/`.

Reusable building blocks from **AI Elements**: `Conversation`, `Message`, `PromptInput`, `Suggestions`, `Loader`. Wrap assistant `Message` content in `<Streamdown>` (via the cross-page `<MessageMarkdown>` wrapper).

### `/` Welcome page (server component shell + client chat)
- Server: renders shell, no data needed.
- Client subtree: chat + sticky right panel containing (a) the live draft `SyllabusPanel` and (b) a `StylePicker` (Teacher / Tutorial). Two-column layout, collapses on mobile.
- The chosen style is in scope while building the syllabus — it's passed into `/api/syllabus/chat` so the agent's tone matches what the user will get during chapters.
- "Start journey" button enables once draft has ≥1 chapter and a style is picked; click → `createJourney` server function (carrying the chosen style) → router.push to `journeyPath(...)`.

### `/journeys` List
- Server component fetches via `journeys.list` (through `auth()`). Renders cards.

### `/journeys/[journeySlug]` Journey home
- Server component resolves id from slug, calls `journeys.get`. If slug stale, 308-redirect to canonical.
- Renders title, full syllabus, style picker (same `<StylePicker>` component reused — persists via a server function `setJourneyStyle`), "Begin / Resume Chapter N" link.
- Style can be changed here at any time before / between chapters.

### `/journeys/[journeySlug]/[chapterSlug]` Chapter page
- Server component resolves journey + chapter (`chapters.get`), checks `status !== 'locked'`. Loads previous chapter summaries.
- Passes initial messages + journey context to a client `ChapterChat` component that uses `useChat` against the chapter chat route handler.
- Right panel: syllabus with current chapter highlighted; previous chapters clickable, future locked.
- `SyllabusChangeDialog` triggered by `proposeSyllabusChange` tool call.
- "Go to next chapter" link appears when `markChapterComplete` fires; click → `completeChapter` action → router.push.

### Global layout
- Top bar (server): app name, current journey title (when in a journey), Clerk `<UserButton />`, link to `/journeys`.

---

## Files to create (high level)

```
app/
  layout.tsx                                          # ClerkProvider, top bar, font
  page.tsx                                            # Welcome (server shell)
  _components/welcome-chat.tsx                        # client: chat + draft state
  _components/syllabus-draft-panel.tsx                # client: live draft view
  journeys/
    page.tsx                                          # List (server)
    _components/journey-card.tsx
    [journeySlug]/
      page.tsx                                        # Journey home (server)
      [chapterSlug]/
        page.tsx                                      # Chapter page (server shell)
        _components/chapter-chat.tsx                  # client: useChat
        _components/syllabus-change-dialog.tsx        # client
        _components/chapter-syllabus-panel.tsx        # client (committed syllabus, with current highlight)
  settings/page.tsx                                   # Clerk <UserProfile />
  sign-in/[[...rest]]/page.tsx
  sign-up/[[...rest]]/page.tsx
  api/
    syllabus/chat/route.ts                            # streaming syllabus chat
    journeys/[id]/chapters/[n]/chat/route.ts          # streaming chapter chat
middleware.ts                                         # Clerk

lib/
  url.ts                                              # journeyPath / chapterPath / parsers
  slugify.ts
  server/                                             # backend packages (REST-ready)
    db/{index.ts,schema.ts,migrations/}
    ai/{gateway.ts,prompts.ts,tools.ts}
    journeys/{create.ts,list.ts,get.ts,updateSyllabus.ts,setStyle.ts}
    chapters/{get.ts,complete.ts}
    syllabus/{schema.ts,bootstrap.ts}
    memory/patch.ts
    styles/{presets.ts,get.ts}
  actions/                                            # Server Functions
    journeys.ts                                       # createJourney, listJourneys, applySyllabusChange, setJourneyStyle
    chapters.ts                                       # completeChapter

components/                                           # cross-page reusables only
  message-markdown.tsx                                # Streamdown wrapper
  style-picker.tsx                                    # Teacher / Tutorial (used in welcome + journey home)

.eslintrc.cjs                                         # next + @loderunner/eslint-config
drizzle.config.ts
```

Convention: `_components/` (Next.js underscore = private folder, not routable) holds page-local components.

---

## Build order

1. **Bootstrap**: `create-next-app`, Tailwind, shadcn init, ESLint (`next/core-web-vitals` + `@loderunner/eslint-config`).
2. **Provision Vercel resources** via Marketplace: Neon Postgres, Clerk, Blob, AI Gateway. Pull env with `vercel env pull`.
3. **Drizzle schema + migration** in `lib/server/db/`. Seed the two preset styles.
4. **Backend packages skeleton**: `lib/server/{journeys,chapters,syllabus,memory,styles,ai}` — function signatures + tests passing on the simple cases.
5. **Clerk wiring**: middleware, sign-in/up pages, layout `<ClerkProvider>`, top bar.
6. **URL helpers** (`lib/url.ts`, `lib/slugify.ts`).
7. **Welcome page** (server shell) + client chat + `/api/syllabus/chat` route handler with `updateSyllabusDraft` tool.
8. **`createJourney` server function** (calls `syllabus.bootstrap` for title + memory, then `journeys.create`) wired to the welcome page's "Start journey" button.
9. **Journey home page** (server) with style picker (server function to persist).
10. **Chapter chat route handler + page** with all three tools, Streamdown rendering, syllabus-change dialog hooked to `applySyllabusChange` action.
11. **`completeChapter` action** + summary generation + next-chapter unlock.
12. **`/journeys` list** page.
13. **Settings page**: Clerk `<UserProfile />`.
14. **Deploy to Vercel**, verify end-to-end.

Each step is a working app — no half-states.

---

## Verification

- **Local**: `pnpm dev`. Walk the full flow: build a syllabus, start journey, run chapter 1, trigger a syllabus-affecting comment to see the confirm dialog, complete chapter, resume in a new tab.
- **URL canonicalization**: visit `/journeys/wrong-slug-<id>` — must 308 to canonical. Same for chapter slug.
- **Package isolation**: a quick smoke test importing a `lib/server/journeys/*` function from a Node script — must work without any Next.js context (proves REST-readiness).
- **DB**: `drizzle-kit studio` to inspect `journeys.memory` + `chapters.summary` after each step.
- **Streaming**: confirm code blocks render progressively in chapter chat (Streamdown).
- **Auth**: hit `/api/syllabus/chat` while signed out — must 401.
- **Persistence**: refresh mid-chapter — message history must reload from DB (server component re-renders with stored messages).
- **Deploy**: preview deployment loads, env vars resolve, Clerk sign-in works on the Vercel URL.
