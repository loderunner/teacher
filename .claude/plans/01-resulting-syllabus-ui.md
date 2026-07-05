# Plan: Show the resulting syllabus on the syllabus chat page

## Context

This is **milestone 1 of 3** in the larger refactor tracked in
`chapters-source-of-truth-overview.md` (making the `chapters` table the sole
source of truth after activation, to fix a bug where an AI-driven syllabus edit
destroyed the active chapter's content). That parent plan's section 6 ("UI —
syllabus chat page shows the resulting (frozen) syllabus") calls for the
syllabus chat page to render the syllabus the drafting conversation produced, in
addition to the live sidebar.

The parent plan implements this as part of a bigger schema rename
(`journeys.syllabus` → `journeys.syllabus_draft`, `Journey.syllabus` →
`Journey.syllabusDraft`). That rename is **not** part of this milestone — it
lands in milestone 3 ("core cutover"). This milestone extracts only the
**UI-visible deliverable** — a purely additive rendering change with **zero
schema risk** — so it can ship immediately, independently, and ahead of any
migration:

- No columns, tables, or Zod schemas change.
- No entity-layer types change. `Journey.syllabus: Syllabus | null`
  (`lib/journeys/get.ts`) already exists today and already holds exactly the
  data this milestone needs to display.
- The rendering primitive this milestone needs (`SyllabusPanel mode="draft"`,
  backed by `buildDraftChapters`) already exists and is already used identically
  by `syllabus-chat.tsx`'s sidebar during drafting. This milestone reuses it
  verbatim — it does not modify `syllabus-panel.tsx` or
  `syllabus-panel-data.ts`.

Because milestones 2 and 3 have not landed when this ships, all references use
the **current, pre-rename field name**: `journey.syllabus`. Do not introduce
`journey.syllabusDraft` in this milestone — that field does not exist until
milestone 3 renames the column and the type.

## Decisions

- Render the resulting syllabus **inside `ChatPageShell.Content`**, below the
  chat transcript, on the syllabus chat page's read-only (`active` journey) view
  — `SyllabusView` in
  `app/[locale]/journeys/[journeySlug]/syllabus/syllabus-view.tsx`. This is the
  page shown once a journey is activated (`page.tsx` routes `drafting` journeys
  to `SyllabusChat` instead, which is unaffected by this milestone).
- Source the block from `journey.syllabus` (type `Syllabus | null`, already
  fetched by `getJourney` and passed into `SyllabusView` today).
- Reuse `<SyllabusPanel draft={journey.syllabus} mode="draft" />` as-is. The
  `draft` prop's type in `mode="draft"` is `PartialSyllabus | Syllabus | null`
  (per the `PartialSyllabus` schema introduced in #43, replacing the old
  `DeepPartial<Syllabus>`), and `Syllabus` is an explicit member of that union —
  `journey.syllabus` (`Syllabus | null`) is accepted directly, no adapter or
  cast needed.
- The sidebar (`SyllabusPanel mode="activated"`) is untouched — it already reads
  current chapter state and continues to do so. This milestone only adds a
  second, independent read-only rendering in the content column; it does not
  change what the sidebar shows.
- New i18n key `SyllabusPage.resultingHeader` for the new section's title, added
  to both `en.json` and `fr.json`. Text content stays out of the component per
  the project's i18n rule.

## Changes by area

### `app/[locale]/journeys/[journeySlug]/syllabus/syllabus-view.tsx`

Current body of `ChatPageShell.Content`:

```tsx
<ChatPageShell.Content>
  <ChatPageShell.Header>
    <Title>{t('header')}</Title>
  </ChatPageShell.Header>
  <JourneyChatViewIsland messages={messages} tools={SYLLABUS_TOOLS} />
</ChatPageShell.Content>
```

Add a second header + panel after the chat transcript:

```tsx
<ChatPageShell.Content>
  <ChatPageShell.Header>
    <Title>{t('header')}</Title>
  </ChatPageShell.Header>
  <JourneyChatViewIsland messages={messages} tools={SYLLABUS_TOOLS} />
  <ChatPageShell.Header>
    <Title>{t('resultingHeader')}</Title>
  </ChatPageShell.Header>
  <SyllabusPanel draft={journey.syllabus} mode="draft" />
</ChatPageShell.Content>
```

`SyllabusPanel` is already imported in this file (used in `mode="activated"` for
the sidebar), so no new import is needed beyond what's already there. `journey`
is already a prop of `SyllabusView`; no signature change.

### `lib/i18n/messages/en.json`

Add a key to the existing `SyllabusPage` namespace:

```json
"SyllabusPage": {
  "header": "Syllabus chat",
  "description": "The conversation where we built your syllabus.",
  "resultingHeader": "Resulting syllabus"
}
```

### `lib/i18n/messages/fr.json`

```json
"SyllabusPage": {
  "header": "Chat du programme",
  "description": "La conversation où nous avons construit votre programme.",
  "resultingHeader": "Syllabus obtenu"
}
```

### No changes to (explicitly, to keep the diff minimal and scoped)

- `lib/journeys/get.ts` — `Journey.syllabus` already has the right shape.
- `lib/components/journey/syllabus-panel-data.ts` and `syllabus-panel.tsx` —
  `mode="draft"` already renders `title` / `summary` / `sections` from a
  `PartialSyllabus | Syllabus | null`; this milestone doesn't touch the
  `summary` field name (that becomes `overview` only in milestone 3).
- `syllabus-chat.tsx` — the drafting-mode page is untouched; its own
  `journey.syllabus` reference is renamed to `journey.syllabusDraft` only in
  milestone 3, alongside the column rename.
- `lib/db/schema.ts`, `lib/syllabus/schema.ts` — no schema/type changes at all
  in this milestone.

## Why this is safely deployable alone

- Zero schema, column, or migration changes — nothing to run against the
  database, nothing that can fail a `drizzle-kit` check.
- Zero changes to any exported type (`Journey`, `Syllabus`, `DisplayChapter`,
  etc.) — every consumer of those types is unaffected.
- Purely additive JSX: a new header + an existing, already-battle-tested
  component (`SyllabusPanel mode="draft"`) rendered with data that was already
  being fetched and was already `null`-safe (`SyllabusPanel` and
  `buildDraftChapters` both handle `draft === null` today).
- No behavior change to the sidebar, to the drafting page, to activation, or to
  any API route — the blast radius is one Server Component's JSX and two
  translation files.

## Deploy rules

Normal deploy — push to `main`, Vercel auto-deploys. No migration to run, no DB
reset, no feature flag, no special sequencing. Safe to ship before, alongside,
or after milestone 2 (additive chapter columns); it has no dependency on it and
no conflict with it (milestone 2 only adds new columns and dual-writes; it does
not touch `syllabus-view.tsx`).

## Tests

`syllabus-view.tsx` currently has no colocated test file. Add one:

- `app/[locale]/journeys/[journeySlug]/syllabus/syllabus-view.test.tsx` (unit
  test — mock every import from outside the module under test, per project
  convention):
  - `vi.mock('next-intl/server')` → `mockGetTranslations` returning a
    passthrough `t` (e.g. a function returning its key, or a small fixture map
    including `header` and `resultingHeader`).
  - `vi.mock('./journey-chat-view-island')` → stub `JourneyChatViewIsland`
    rendering a `data-testid` marker.
  - `vi.mock('@/lib/components/chat-page')` → stub `ChatPageShell.Root` /
    `.Content` / `.Header` / `.Sidebar` as simple pass-through wrappers, and
    `Title` as a pass-through span, so structure is inspectable without pulling
    in the real sidebar's client-side context/state.
  - `vi.mock('@/lib/components/journey')` → stub `SyllabusPanel` to render its
    received props (e.g. `JSON.stringify` into a `data-testid` node) and a stub
    `StyleLabel`.
  - Since `SyllabusView` is an async function component, call and `await` it
    directly to get the resolved element, then `render()` the result with
    Testing Library.
  - Cases:
    - Renders two `SyllabusPanel` instances: one `mode="activated"` (sidebar,
      already existing behavior — regression guard) and one `mode="draft"` with
      `draft` equal to the `journey.syllabus` fixture (the new behavior).
    - Renders the `resultingHeader` translation key/text in the content column.
    - Passes `journey.syllabus === null` (mid-drafting-edge-case-safe even
      though this page is only shown for active journeys) through to the new
      panel without throwing — `SyllabusPanel`/`buildDraftChapters` already
      handle `null`.

No changes needed to `syllabus-panel.test.tsx` or `syllabus-panel-data.test.ts`
— their behavior isn't touched by this milestone.

## Verification

```bash
pnpm vitest run app/\[locale\]/journeys/\[journeySlug\]/syllabus
pnpm lint
```

Manual, `pnpm dev`:

1. Draft a new journey via the syllabus chat and let the AI produce a syllabus
   with at least two chapters.
2. Click **Start journey** to activate it.
3. Navigate to the journey's syllabus chat page (the URL the "syllabus chat"
   sidebar link points to, or revisit it directly).
4. Confirm the content column now shows, below the chat transcript, a new
   "Resulting syllabus" section listing the chapters/overviews/sections exactly
   as drafted.
5. Confirm the sidebar still renders `SyllabusPanel mode="activated"` showing
   current chapter status (unaffected by this change).
6. Switch locale to French and confirm the new header renders the `fr.json`
   translation instead of a missing-key fallback.

## Suggested review order

1. `app/[locale]/journeys/[journeySlug]/syllabus/syllabus-view.tsx` — the actual
   UI change.
2. `lib/i18n/messages/en.json` / `lib/i18n/messages/fr.json` — the new strings
   the change depends on.
3. `app/[locale]/journeys/[journeySlug]/syllabus/syllabus-view.test.tsx` —
   coverage for the new block.
