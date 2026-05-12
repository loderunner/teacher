> **Implemented.** This deliverable has been shipped. The codebase may differ from the details below — treat this document as historical context, not a specification of the current state.

# Deliverable 2 — Welcome Chat & First Persisted Journey

## Context

Deliverable 1 (`.claude/plans/01-project-bootstrap.md`) shipped the bootstrap (Next.js 16, Tailwind v4, shadcn, Clerk, Neon + Drizzle, `users` table, `ensureUser`). Since then, **i18n has been added** (post-D1, pre-D2): `next-intl` v4.11.0, locales `en` (default) + `fr`, all pages under `app/[locale]/`, `proxy.ts` composing Clerk + intl middleware, `messages/{en,fr}.json`, `i18n/{routing,request}.ts`. Current `app/[locale]/page.tsx` is a `Welcome — coming soon` placeholder behind `useTranslations('Home')`.

Deliverable 2 turns that into the **first complete user-visible flow**, fully localized:

1. Sign in (`/{locale}/sign-in`) → welcome page (`/{locale}`) with a streaming chat (left), live syllabus-draft panel (right), and `StylePicker` (Teacher | Tutorial).
2. Co-author a syllabus by chatting. The model uses one tool — `updateSyllabusDraft` — to mutate client-side draft state. Tool calls never render as messages; chat history is **ephemeral** (no persistence).
3. Click **Start journey** → server action calls `bootstrapJourney` (`generateText` + `Output.object`) to derive `{ title, memory }` in the user's locale, then transactionally inserts a `Journey` + per-chapter rows; returns `{ id, slug }`.
4. Client `router.push`es to `/{locale}/journeys/<slug>-<uuid>`, a read-only Journey home page showing title, syllabus, persisting `StylePicker`, and a `Begin Chapter 1 — coming soon` placeholder link.

This deliverable proves streaming chat + tool-call interception + Vercel AI Gateway plumbing + the locale-aware navigation pattern, and lands the schema, URL helpers, and server-action conventions D3+ build on.

**Deferred** (each picked up by the deliverable that needs it):
- `messages` table — D3 (chapter chat persistence).
- Chapter chat route + `proposeSyllabusChange` / `updateMemory` / `markChapterComplete` tools — D3.
- `applySyllabusChange` action, chapter completion summaries — D3.
- `/journeys` list page — D5; Settings page — D6.
- Vercel Blob — when the first asset arrives.
- Locale switcher in TopBar — micro-deliverable; users currently switch via URL.
- Clerk UI translation (`<ClerkProvider localization={...}>`) — same micro-deliverable as the switcher.

---

## Decisions

- **Scope: ship the full first-flow end-to-end.** Splitting welcome-chat from journey-home would leave a `Start journey` button creating rows the user can't reach. The i18n addition is mechanical (path moves + a translation pass), not architectural — D2 stays one deliverable.
- **Pages under `app/[locale]/`; API routes stay at `app/api/`.** next-intl's `[locale]` segment is for pages only. The streaming route handler is not localized; the client passes `locale` in the request body.
- **`i18n/navigation.ts` (new):** exports `Link`, `redirect`, `permanentRedirect`, `useRouter`, `usePathname` from `createNavigation(routing)`. All in-app navigation (server redirects, client `router.push`) goes through these so the current locale is preserved automatically. No code touches `next/navigation` directly for app pages.
- **`journeyPath` returns locale-relative paths** (`/journeys/<slug>-<id>`). The locale-aware `useRouter`/`permanentRedirect` from `i18n/navigation` prepends `/{locale}` at the call site.
- **Translation namespaces ship in this deliverable:** `Welcome`, `Journey`. Both `messages/en.json` and `messages/fr.json` get full coverage in lockstep — no English fallback strings in code.
- **AI surface is fully localized — no language mixing in system prompts.** The composed prompt for a given request is monolingual end-to-end: style fragment, phase rules, tool description, bootstrap instructions all match the request locale. Mixing English scaffolding with non-English style fragments leaks artifacts (model picks up English words mid-response, drifts in tone).
- **Style preset fragments per locale, JSONB:** `styles.systemPromptFragments` is `jsonb` typed `Record<Locale, string>`. One column scales to N locales without schema churn; we don't need to query inside the JSON. Seed both `en` and `fr` fragments for Teacher + Tutorial in lockstep.
- **AI prompt strings live in `lib/server/ai/prompt-strings.ts`** (not in `messages/*.json`). UI strings are translator-facing; prompt strings are prompt-engineering artifacts kept close to the AI code. Strict `Record<Locale, string>` typing — adding a locale anywhere fails TS until the prompt strings catch up.
- **Tool description must be localized too.** `lib/server/ai/tools.ts` exports a factory `makeUpdateSyllabusDraftTool(locale)` constructed per request. A static tool description would inject English into a French prompt context.
- **IDs (`journeys`, `chapters`):** Postgres-native UUID v4 via `gen_random_uuid()` (Drizzle's `.defaultRandom()`). No new deps; Neon ships it built-in. Trades 36-char URL ugliness for zero dependency surface.
- **`styles.id`:** plain `text` with stable preset ids (`'teacher'`, `'tutorial'`) — referenced from code/URLs without a UUID lookup.
- **Style preset seeding:** appended to the same Drizzle migration that creates `styles`, idempotent via `ON CONFLICT … DO UPDATE`. Source of truth is `lib/server/styles/presets.ts`; the SQL is hand-extended from those constants.
- **AI SDK v6 corrections:** `generateObject` is deprecated → use `generateText({ output: Output.object({ schema }) })` for `bootstrapJourney`. Tool definitions use `inputSchema` (not `parameters`). `useChat` from `@ai-sdk/react`; transport via `DefaultChatTransport` from `'ai'`.
- **Transactions:** D1's `db` uses `drizzle-orm/neon-http`, which does not support multi-statement transactions. Add a parallel WS-based `dbTx` (also from `@neondatabase/serverless` — no new top-level dep).
- **AI Gateway auth:** rely on `VERCEL_OIDC_TOKEN` already in `.env.local`. No `AI_GATEWAY_API_KEY` required for dev or Vercel preview/prod; document it in `.env.example` as the alternative.
- **`createJourney` is a server action that returns `{ id, slug }`** — not a server-side `redirect()`. Per Next 16 docs, redirect-from-action interacts badly with try/catch.
- **Welcome chat persistence:** none. Refresh wipes history.
- **Icons inside `components/ai-elements/`** keep their installed `lucide-react` imports. Phosphor stays default elsewhere.

---

## File-level layout

### New files

**Pure helpers (`lib/`)**
- `lib/slugify.ts` — diacritic-stripping (NFKD + ASCII fold handles French accents), length-capped; never returns empty.
- `lib/url.ts` — `journeyPath(j)` returns locale-relative `/journeys/<slug>-<id>`; `parseJourneySlug(seg)` splits trailing 36-char UUID off `slug-uuid`.
- `lib/url.test.ts` — Vitest: round-trips, accented-title slug, stale-slug detection.

**i18n (`i18n/`)**
- `i18n/navigation.ts` — `export const { Link, redirect, permanentRedirect, useRouter, usePathname } = createNavigation(routing)`. Single source for all locale-aware navigation.

**Backend packages (`lib/server/`, no Next.js imports — REST-ready)**
- `lib/server/ai/gateway.ts` — `MODEL = 'anthropic/claude-sonnet-4-6'` constant.
- `lib/server/ai/prompt-strings.ts` — per-locale phase rules, bootstrap instructions, tool descriptions. Strict `Record<Locale, string>` keyed off `routing.locales`.
- `lib/server/ai/prompts.ts` — `composeSyllabusSystemPrompt({ style, draft, locale })`. Picks `style.systemPromptFragments[locale]` + `PROMPT_STRINGS.syllabusPhase[locale]`. Output is monolingual.
- `lib/server/ai/tools.ts` — exports `makeUpdateSyllabusDraftTool(locale)` factory; description from `PROMPT_STRINGS.tools.updateSyllabusDraft[locale]`.
- `lib/server/syllabus/schema.ts` — `chapterDraftSchema`, `syllabusDraftSchema`, exported types.
- `lib/server/syllabus/bootstrap.ts` — `bootstrapJourney({ draft, messages, locale }) → { title, memory }` via `generateText` + `Output.object`. Locale-specific instructions from `PROMPT_STRINGS`.
- `lib/server/styles/presets.ts` — `STYLE_PRESETS` constants with `systemPromptFragments: { en, fr }` per preset.
- `lib/server/styles/get.ts` — `getStyle(id)`, `listPresets()`. Callers index `style.systemPromptFragments[locale]`.
- `lib/server/journeys/create.ts` — transactional insert (journey + chapter rows) using `dbTx`.
- `lib/server/journeys/get.ts` — `getJourney({ userId, id })` returning journey + chapters joined.
- `lib/server/journeys/setStyle.ts` — `setJourneyStyle({ userId, id, styleId })`.

**Server actions (`lib/actions/`, thin auth + Zod + delegate)**
- `lib/actions/journeys.ts` — `createJourney`, `setJourneyStyle`. Both `'use server'`. Read locale via `getLocale()` from `next-intl/server`, pass into backend calls.

**Pages & routes (`app/`)**
- `app/api/syllabus/chat/route.ts` — POST handler at the unlocalized path; `export const maxDuration = 60`; reads `{ messages, styleId, locale }`; auth → `streamText` with the tool → `result.toUIMessageStreamResponse()`.
- `app/[locale]/_components/welcome-chat.tsx` — client; `useChat` + `DefaultChatTransport`; `sendMessage(text, { body: { styleId, locale } })` (locale via `useLocale()`); intercepts `tool-updateSyllabusDraft` parts (state-guarded) to update local draft; renders Conversation/Message/PromptInput.
- `app/[locale]/_components/syllabus-draft-panel.tsx` — client; renders the live draft.
- `app/[locale]/journeys/[journeySlug]/page.tsx` — server component; `parseJourneySlug` → `getJourney` → `permanentRedirect` (locale-aware) if slug stale → render.
- `app/[locale]/journeys/[journeySlug]/_components/journey-home.tsx` — server view; embeds the persisting `StylePicker` (small client island).

**Cross-page reusables (`components/`)**
- `components/style-picker.tsx` — client; two modes: `select` (controlled, used on welcome) and `persist` (calls `setJourneyStyle` action, used on journey home). Labels via `useTranslations('StylePicker')`.
- `components/message-markdown.tsx` — `<Streamdown>` wrapper with `plugins={{ code }}` and `caret="block"` while streaming.
- `components/ai-elements/{conversation,message,prompt-input}.tsx` — installed via the AI Elements CLI.

### Modified files

- `app/globals.css` — add `@source "../node_modules/streamdown/dist/*.js";` and `@source "../node_modules/@streamdown/code/dist/*.js";` so Tailwind v4 scans Streamdown classes.
- `app/[locale]/page.tsx` — replace placeholder with welcome shell hosting `WelcomeChat` + `SyllabusDraftPanel` + `StylePicker`; pre-load `listPresets()` server-side; keep `ensureUser({ clerkUserId: userId! })`.
- `lib/server/db/schema.ts` — add `chapterStatusEnum`, `styles`, `journeys`, `chapters`.
- `lib/server/db/index.ts` — export `dbTx` alongside `db` (WS driver for transactions).
- `messages/en.json` + `messages/fr.json` — add `Welcome`, `Journey`, `StylePicker` namespaces (full coverage in both — no English fallback in fr.json).
- `.env.example` — note `AI_GATEWAY_API_KEY` as optional alternative to OIDC.

### Lightly modified (existing i18n scaffolding)

- `i18n/routing.ts` — add `export type Locale = (typeof routing.locales)[number]`. This single source feeds `Record<Locale, …>` typing across the AI layer and DB schema.

### Untouched (i18n already configured by the user)

`proxy.ts`, `i18n/request.ts`, `app/layout.tsx` (root shell), `app/[locale]/layout.tsx` (real layout with ClerkProvider + NextIntlClientProvider).

---

## Schema (Drizzle additions)

```ts
export const chapterStatusEnum = pgEnum('chapter_status', ['locked', 'active', 'done'])

export const styles = pgTable('styles', {
  id: text('id').primaryKey(),                            // 'teacher' | 'tutorial' for presets
  name: text('name').notNull(),
  systemPromptFragments: jsonb('system_prompt_fragments')
    .$type<Record<Locale, string>>().notNull(),           // { en: '...', fr: '...' }
  isPreset: boolean('is_preset').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const journeys = pgTable('journeys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  styleId: text('style_id').notNull().references(() => styles.id, { onDelete: 'restrict' }),
  syllabus: jsonb('syllabus').$type<SyllabusDraft>().notNull(),
  memory: jsonb('memory').$type<Memory>().notNull().default({}),
  currentChapterIndex: integer('current_chapter_index').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({ userIdx: index('journeys_user_idx').on(t.userId) }))

export const chapters = pgTable('chapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  journeyId: uuid('journey_id').notNull().references(() => journeys.id, { onDelete: 'cascade' }),
  idx: integer('idx').notNull(),                          // 0-based
  title: text('title').notNull(),
  status: chapterStatusEnum('status').notNull().default('locked'),
  summary: text('summary'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  journeyIdxUnique: uniqueIndex('chapters_journey_idx_unique').on(t.journeyId, t.idx),
  journeyIdx: index('chapters_journey_idx').on(t.journeyId),
}))
```

After `pnpm db:generate`, append the seed inside the same generated `0001_*.sql`:

```sql
INSERT INTO styles (id, name, system_prompt_fragments, is_preset)
VALUES
  ('teacher',  'Teacher',
   jsonb_build_object('en', $$<en teacher fragment>$$, 'fr', $$<fr teacher fragment>$$),
   true),
  ('tutorial', 'Tutorial',
   jsonb_build_object('en', $$<en tutorial fragment>$$, 'fr', $$<fr tutorial fragment>$$),
   true)
ON CONFLICT (id) DO UPDATE
  SET name = excluded.name,
      system_prompt_fragments = excluded.system_prompt_fragments,
      is_preset = excluded.is_preset;
```

Journey title is stored as a single column. The user's locale at creation time decides the language; renaming on locale switch is out of scope.

---

## AI architecture

### Prompt strings (`lib/server/ai/prompt-strings.ts`)

Strict `Record<Locale, string>` typing — `Locale` is exported from `i18n/routing.ts` as a union derived from `routing.locales`. Adding a locale anywhere fails TS until prompt strings catch up.

```ts
import type { Locale } from '@/i18n/routing'

export const PROMPT_STRINGS = {
  syllabusPhase: {
    en: `You are co-authoring a Syllabus for a Journey with the user.

Use the \`updateSyllabusDraft\` tool every time the draft should change — pass the
entire new draft each time. Never describe the draft in prose; always use the tool.

When the draft has at least one chapter and the user signals readiness, suggest
they click "Start journey" — do not call any "start" tool yourself.`,
    fr: `Vous co-rédigez un Syllabus pour un Parcours avec l'utilisateur.

Utilisez l'outil \`updateSyllabusDraft\` chaque fois que le brouillon doit changer
— transmettez à chaque fois l'intégralité du nouveau brouillon. Ne décrivez jamais
le brouillon en prose ; utilisez toujours l'outil.

Lorsque le brouillon contient au moins un chapitre et que l'utilisateur signale
qu'il est prêt, suggérez-lui de cliquer sur « Commencer le parcours » — n'appelez
aucun outil de démarrage vous-même.`,
  },
  tools: {
    updateSyllabusDraft: {
      en: 'Replace the full syllabus draft. Always pass the entire draft.',
      fr: 'Remplacer le brouillon complet du syllabus. Transmettez toujours le brouillon entier.',
    },
  },
  bootstrapInstructions: {
    en: `Produce a Title and a Memory document for this Journey based on the chat
transcript and the syllabus draft below. Both Title and all Memory text values
must be in English.`,
    fr: `Produisez un Titre et un document Mémoire pour ce Parcours à partir de la
transcription du dialogue et du brouillon du syllabus ci-dessous. Le Titre et
toutes les valeurs textuelles de Mémoire doivent être en français.`,
  },
} as const satisfies {
  syllabusPhase: Record<Locale, string>
  tools: { updateSyllabusDraft: Record<Locale, string> }
  bootstrapInstructions: Record<Locale, string>
}
```

### `updateSyllabusDraft` tool factory

```ts
// lib/server/syllabus/schema.ts
export const chapterDraftSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().max(800).optional(),
  sections: z.array(z.string().max(200)).max(20).optional(),
})
export const syllabusDraftSchema = z.object({
  chapters: z.array(chapterDraftSchema).min(0).max(30),
})
export type SyllabusDraft = z.infer<typeof syllabusDraftSchema>

// lib/server/ai/tools.ts
export function makeUpdateSyllabusDraftTool(locale: Locale) {
  return tool({
    description: PROMPT_STRINGS.tools.updateSyllabusDraft[locale],
    inputSchema: z.object({ fullDraft: syllabusDraftSchema }),
    execute: async () => ({ ok: true }),   // server-side no-op; client reads tool part
  })
}
```

Client guards `part.state === 'output-available'` (or `'input-streaming'` for progressive draft updates) before reading `part.input.fullDraft`.

### Composed system prompt (syllabus phase, locale-monolingual)

```
{style.systemPromptFragments[locale]}

{PROMPT_STRINGS.syllabusPhase[locale]}

{ "Current draft snapshot:" / "Brouillon actuel :" — also localized via PROMPT_STRINGS }
{JSON of current draft, or the localized "(empty)" / "(vide)"}
```

Composer (`lib/server/ai/prompts.ts`) accepts `{ style, draft, locale }` and emits a single string. **Every line is in `locale`** — no English fallback, no instruction in one language about a fragment in another.

### Locale flow (welcome → route handler → AI)

```ts
// client (welcome-chat.tsx)
import { useLocale } from 'next-intl'
const locale = useLocale() as Locale
sendMessage({ text }, { body: { styleId, locale } })

// server (route handler)
const { messages, styleId, locale } = (await req.json()) as {
  messages: UIMessage[]; styleId: string; locale: Locale
}
if (!routing.locales.includes(locale)) return new Response('Invalid locale', { status: 400 })

const style = await getStyle(styleId); if (!style) return new Response('Invalid style', { status: 400 })
const draft = extractLatestDraft(messages)
const system = composeSyllabusSystemPrompt({ style, draft, locale })

const result = streamText({
  model: MODEL,
  system,
  messages: await convertToModelMessages(messages),
  tools: { updateSyllabusDraft: makeUpdateSyllabusDraftTool(locale) },
})
```

Per-request body so style and locale changes both take effect on the next turn. Locale is validated against `routing.locales` to prevent prompt-injection via arbitrary `Record` keys.

### `bootstrapJourney` schema (fed to `generateText` via `Output.object`)

```ts
const bootstrapSchema = z.object({
  title: z.string().min(3).max(80),
  memory: z.object({
    learner: z.object({
      goals: z.array(z.string()).default([]),
      knownTopics: z.array(z.string()).default([]),
      gaps: z.array(z.string()).default([]),
    }).default({ goals: [], knownTopics: [], gaps: [] }),
    notes: z.array(z.string()).default([]),
  }),
})
```

Bootstrap prompt is built from `PROMPT_STRINGS.bootstrapInstructions[locale]` — fully localized. The transcript is fed in user-language as-is (already in the user's locale because they typed it). Memory schema **keys stay English** (machine paths for D3's JSON-Patch ops like `/learner/goals/-`); only the leaf string values are localized free-text.

### `journeys.create` (transactional via `dbTx`)

```ts
return dbTx.transaction(async (tx) => {
  const [j] = await tx.insert(journeys).values({ userId, title, styleId, syllabus, memory }).returning()
  await tx.insert(chapters).values(
    syllabus.chapters.map((c, i) => ({
      journeyId: j.id, idx: i, title: c.title,
      status: i === 0 ? 'active' : 'locked',
    })),
  )
  return j
})
```

### Auth pattern (mirrors D1)

Route handler and server action both: `auth()` from `@clerk/nextjs/server` → on missing `userId`, 401/throw → `ensureUser({ clerkUserId: userId })` → proceed. Middleware (`proxy.ts`) already gates non-public routes; the in-handler check is defense-in-depth.

---

## URL helpers + redirect

```ts
// lib/url.ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Locale-relative — call sites use the locale-aware navigation from i18n/navigation
export function journeyPath(j: { id: string; title: string }) {
  return `/journeys/${slugify(j.title)}-${j.id}`
}

export function parseJourneySlug(seg: string) {
  if (seg.length < 37 || seg[seg.length - 37] !== '-') return null
  const id = seg.slice(seg.length - 36)
  if (!UUID_RE.test(id)) return null
  return { id, slugPart: seg.slice(0, seg.length - 37) }
}
```

```tsx
// app/[locale]/journeys/[journeySlug]/page.tsx
import { permanentRedirect } from '@/i18n/navigation'   // locale-aware
import { notFound } from 'next/navigation'              // notFound is locale-agnostic

export default async function Page({ params }: { params: Promise<{ journeySlug: string; locale: string }> }) {
  const { journeySlug } = await params
  const parsed = parseJourneySlug(journeySlug); if (!parsed) notFound()

  const { userId } = await auth()
  await ensureUser({ clerkUserId: userId! })

  const journey = await getJourney({ userId: userId!, id: parsed.id }); if (!journey) notFound()

  const canonical = journeyPath(journey)
  if (`/journeys/${journeySlug}` !== canonical) permanentRedirect(canonical)

  return <JourneyHome journey={journey} />
}
```

`permanentRedirect` from `i18n/navigation` (308 + locale-aware). `params` is async (Next 16). Client-side navigation from the welcome page also uses `useRouter` from `i18n/navigation` so `router.push(journeyPath(...))` lands on the correct locale.

---

## Translation surface (en + fr in lockstep)

```jsonc
// messages/en.json (additions)
{
  "Welcome": {
    "title": "Start a Journey",
    "tagline": "What do you want to learn?",
    "draftHeader": "Your syllabus",
    "emptyDraft": "Chat to start sketching out your syllabus.",
    "startJourney": "Start journey",
    "startJourneyDisabledHint": "Add at least one chapter and pick a style to begin.",
    "promptPlaceholder": "Describe what you want to learn…"
  },
  "Journey": {
    "syllabusHeader": "Syllabus",
    "beginChapter": "Begin Chapter {n} — coming soon",
    "resumeChapter": "Resume Chapter {n} — coming soon"
  },
  "StylePicker": {
    "label": "Teaching style",
    "teacher": "Teacher",
    "tutorial": "Tutorial"
  }
}
```

`messages/fr.json` mirrors with French strings. Every key added to `en.json` ships with a `fr.json` translation in the same commit. Verification fails the deliverable if any key is missing in either file.

---

## Step-by-step execution

Each step is independently verifiable. `[par]` = can run alongside the previous group.

1. **AI Gateway**: install Marketplace integration on the linked Vercel project; `vercel env pull .env.local`. Confirm chat completions resolve via `VERCEL_OIDC_TOKEN`. Update `.env.example`.
2. **Deps**: `pnpm add ai @ai-sdk/react zod streamdown @streamdown/code`.
3. **[par]** **AI Elements**: `pnpm dlx ai-elements@latest add conversation message prompt-input`. `pnpm lint`.
4. **Streamdown Tailwind v4 wiring**: edit `app/globals.css` to add the two `@source` lines.
5. **i18n navigation**: create `i18n/navigation.ts` wrapping `createNavigation(routing)`.
6. **Schema + migration + seed**: extend `lib/server/db/schema.ts`; `pnpm db:generate`; append seed `INSERT … ON CONFLICT … DO UPDATE` in the generated migration; `pnpm db:migrate`; verify in `db:studio`. Add `dbTx` (WS driver) to `lib/server/db/index.ts`.
7. **[par]** **URL helpers + tests**: `lib/slugify.ts`, `lib/url.ts`, `lib/url.test.ts` (cover `Apprendre Python` → `apprendre-python`). `pnpm test` should pass.
8. **[par]** **Backend packages (no AI yet)**: `styles/{presets,get}`, `journeys/{create,get,setStyle}`. Smoke: `tsx -e "import('./lib/server/styles/get').then(m => m.listPresets()).then(console.log)"`.
9. **AI layer**: `ai/gateway.ts`, `ai/prompt-strings.ts` (en + fr fragments for phase rules / tool desc / bootstrap instructions), `ai/prompts.ts` (composer is locale-monolingual), `syllabus/{schema,bootstrap}` (locale-aware), `ai/tools.ts` (factory takes `locale`).
10. **Translations**: add `Welcome`, `Journey`, `StylePicker` namespaces to both `messages/en.json` and `messages/fr.json`. Lint with `pnpm lint`.
11. **Route handler**: `app/api/syllabus/chat/route.ts` with auth + `{ messages, styleId, locale }` body + `streamText` + tool. Smoke-test from a signed-in browser.
12. **Welcome page**: replace `app/[locale]/page.tsx` placeholder; create `_components/welcome-chat.tsx`, `_components/syllabus-draft-panel.tsx`, `components/style-picker.tsx`, `components/message-markdown.tsx`. Verify chat streams in both `/en` and `/fr`, draft updates, style switch affects next turn.
13. **Server action + wiring**: `lib/actions/journeys.ts → createJourney` (uses `getLocale()` from `next-intl/server`). "Start journey" → `useTransition` → `router.push(journeyPath(...))` via `i18n/navigation`.
14. **Journey home**: `app/[locale]/journeys/[journeySlug]/page.tsx`, `_components/journey-home.tsx`. Verify slug 308 (locale preserved), persisting `StylePicker`, "Begin Chapter 1 — coming soon" placeholder.
15. **End-to-end + deploy**: `pnpm build`, push to a PR, verify on Vercel preview URL in both locales.

---

## Risks / gotchas

- **`proxy.ts` not `middleware.ts`** — current Next 16 + next-intl convention in this repo. Do NOT recreate `middleware.ts`.
- **Two layouts** — `app/layout.tsx` is a thin root shell; `app/[locale]/layout.tsx` is where Clerk + NextIntl + fonts live. Don't duplicate providers.
- **API route is NOT under `[locale]`** — locale flows via request body, not the URL. Don't move the route handler under `[locale]/api/...`.
- **`i18n/navigation` is the only navigation API for app pages** — using `next/navigation`'s `redirect`/`router.push` directly would strip the locale.
- **Translation lockstep** — every key added to `en.json` must ship with a `fr.json` translation in the same commit. Add a tiny test (Vitest) that `Object.keys` recursively match between the two files.
- **Adding a locale touches three places** — `i18n/routing.ts` (locales array), `messages/<locale>.json`, `lib/server/ai/prompt-strings.ts`, and every `STYLE_PRESETS[*].systemPromptFragments` entry. The `Record<Locale, string>` typing makes the AI side fail TS until caught up; `messages/*.json` failure is runtime-only — keep both sides green via the parity test above.
- **No language mixing in the system prompt** — the entire composed prompt is monolingual. Tool descriptions are constructed per-request via the factory, not statically. Forgetting this re-introduces English artifacts in French responses.
- **Validate locale at the API boundary** — request body's `locale` is checked against `routing.locales` before indexing into `Record<Locale, …>`. Otherwise an attacker could push odd keys into `style.systemPromptFragments[arbitrary]`.
- **Bootstrap title language** — must be in the user's locale at creation time. Renaming on later locale switch is out of scope; the title is a fixed artifact of the journey's birth.
- **Slugify with French accents** — NFKD + ASCII fold handles `é`, `à`, `ç` correctly. Add a test case for `Apprendre la programmation`.
- **Tailwind v4 `@source`** for Streamdown — without it, classes ship unstyled.
- **`generateObject` is deprecated** in AI SDK v6 — use `generateText` + `Output.object`.
- **Tool definition** uses `inputSchema`, not `parameters`.
- **`useChat` v6** has no managed input/handleInputChange — pair `useState` + `sendMessage`. Tool parts need state-guarded reads.
- **`neon-http` no transactions** — `dbTx` parallel WS client is the workaround.
- **AI Elements icons** import from `lucide-react`; accept inside `components/ai-elements/` only.
- **`maxDuration`** — explicit `export const maxDuration = 60` on the streaming route is cheap insurance.
- **Server-action redirect** — return `{ id, slug }`; let the client navigate via `useRouter` from `i18n/navigation`.

---

## Verification

- `pnpm install` clean. `pnpm typecheck` + `pnpm lint` + `pnpm test` (slugify + parseJourneySlug round-trips, accented-title slug, en/fr key parity) all pass.
- `pnpm db:generate` produces no further diff. `pnpm db:migrate` idempotent. `db:studio` shows `styles` populated with `teacher` + `tutorial`.
- `pnpm dev`. Sign in → land on `/en`. Two-column layout, style picker labels in English, prompt placeholder in English.
- Visit `/fr` directly: same layout, French labels, French prompt placeholder.
- Send a message in English on `/en`: assistant streams via Streamdown in English; draft panel populates in English; style switch affects next turn's tone.
- Send a message in French on `/fr`: assistant streams in French; draft chapters in French. Inspect: response should contain **no English words** (proves the system prompt is monolingual). Spot-check 3–5 turns.
- "Start journey" disabled until ≥1 chapter + style. Click on `/fr` → `router.push` to `/fr/journeys/<slug>-<uuid>` (NOT `/en/...`). Page renders title (in French), syllabus (in French), persisting style picker, French "Begin Chapter 1 — coming soon".
- Visit `/fr/journeys/wrong-slug-<correct-uuid>` → 308 to canonical, locale preserved.
- `db:studio`: `journeys` row matches `userId`, has populated `syllabus` + `memory`. `chapters` rows: idx 0 status `active`, others `locked`. `(journeyId, idx)` unique enforced.
- Hit `/api/syllabus/chat` from incognito → 401.
- Backend-package smoke (proves no Next.js coupling): `tsx -e "import('./lib/server/journeys/get').then(m => console.log(typeof m.getJourney))"`.
- `pnpm build` succeeds. Push → Vercel preview deploy works against the deployed URL in both `/en` and `/fr`.

---

## Critical files

**Modified:**
- `lib/server/db/schema.ts` — three new tables + enum.
- `lib/server/db/index.ts` — add `dbTx` (WS driver) export.
- `app/globals.css` — Streamdown `@source` directives.
- `app/[locale]/page.tsx` — welcome shell.
- `messages/en.json` + `messages/fr.json` — `Welcome`, `Journey`, `StylePicker` namespaces.
- `.env.example` — `AI_GATEWAY_API_KEY` documented as optional.

**New (most-touched):**
- `i18n/navigation.ts` — locale-aware navigation API.
- `lib/server/ai/prompt-strings.ts` — per-locale phase rules, tool descriptions, bootstrap instructions.
- `lib/server/journeys/create.ts` — transactional insert.
- `app/api/syllabus/chat/route.ts` — streaming + tool factory (unlocalized path; locale via body).
- `app/[locale]/_components/welcome-chat.tsx` — `useChat` + tool intercept + locale flow.
- `app/[locale]/journeys/[journeySlug]/page.tsx` — slug parse + locale-aware 308 + render.
- `lib/url.ts` + `lib/slugify.ts` — URL helpers.

**Reused from D1 + the i18n integration:**
- `lib/server/users/ensure.ts` — `ensureUser` lazy upsert.
- `proxy.ts` — Clerk + intl middleware composition.
- `app/[locale]/layout.tsx` — ClerkProvider + NextIntlClientProvider + TopBar.
- `i18n/{routing,request}.ts` — locales + message loading.
