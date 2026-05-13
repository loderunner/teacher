# Story 1 — Chapter Page (D3.1)

## Context

D2 is done: the welcome chat builds a syllabus, "Start journey" bootstraps a
Journey with a title + memory + locked/active chapters, and the journey home
page renders the chapter list with a non-functional "Begin Chapter N — coming
soon" label on the active chapter.

Story 1 of D3 turns the chapter into a real destination:

- The journey URL itself stops being a landing page — it's useless friction —
  and instead redirects straight to the active chapter.
- The chapter page renders the chapter title, its position in the journey, and
  a right-side syllabus panel that highlights the current chapter and links to
  any other unlocked (active/done) chapter.
- The `StylePickerPersist` control (currently on the journey home) follows the
  user onto the chapter page so the style stays adjustable mid-journey.
- Locked or out-of-range chapters return 404.
- No chat yet — the main column has a placeholder where Story 2 will mount it.

This unblocks the rest of D3 (chat, completion, syllabus changes) by
establishing the route, URL helpers, server resolution pattern, and shell
layout that subsequent stories will build inside.

---

## Decisions

- **Chapter URL slug: `<n>-<title-slug>-<id>`.** Same shape as journeys (trailing 10-char `nanoid`) but with the human-friendly 1-based chapter number prepended. Example: `1-installing-python-abc123def4`. Rationale: titles and ordering both change over time (rename, reorder via Story 4); the only stable handle is the DB id. The leading `n` matches the visible "Chapter N" numbering and stays in the URL purely for human readability; staleness in either the title-slug *or* the `n` prefix triggers a 308 to the canonical path. Resolution is by `id`, not by `(journeyId, idx)`.
- **Journey URL = smart redirect.** `/journeys/[journeySlug]` no longer renders content. It resolves the journey, picks a target chapter (active if any, else the last `done` chapter, else the first chapter), and `redirect`s to its canonical path. Stale journey-slug redirect is preserved (308) before the active-chapter redirect (307).
- **`JourneyHome` component is removed.** Its only consumer is the journey page, which now redirects.
- **`StylePickerPersist` moves to the chapter page sidebar**, mounted inside the right-hand panel (above or below the syllabus list).
- **Resolution strategy.** Both pages call `getJourney` (existing) and look up the chapter inside the returned `chapters[]`. No new `lib/server/chapters/get.ts` is needed for Story 1.
- **Locked / out-of-range → notFound.** Visiting a locked or non-existent chapter returns `notFound()`.
- **Stale slug → 308** via `permanentRedirect({ href, locale })` from `@/i18n/navigation`. A single redirect at the end of the chapter page handler corrects both journey-slug and chapter-slug staleness in one hop.
- **Syllabus panel = server component.** No client interactivity in Story 1.
- **Shared chat layout shell.** The chapter page's two-column layout is identical in structure to the welcome page (chat region left, sidebar right with style picker + syllabus). Extract two shared building blocks in this story so both pages render through them: `components/chat-page-shell.tsx` (outer `flex flex-1 gap-6 overflow-hidden p-6` + named `sidebar` slot) and `components/syllabus-panel.tsx` (one component with two modes — `'draft'` for the welcome page, `'navigate'` for the chapter page; shares the inner `ChapterRow` primitive). Retrofit `welcome-chat.tsx` in the same diff so the two layouts stay aligned by construction. This keeps the user's mental model consistent and avoids the two pages drifting on padding/scroll behavior. Story 2 will extract a third shared piece (`chat-scaffold`) when it introduces the chapter chat.

---

## Files to modify

### 1. `lib/url.ts` — add chapter helpers; export `slugify`

```ts
export function slugify(text: string): string { /* …unchanged body… */ }

export function chapterPath(
  journey: { id: string; title: string },
  chapter: { id: string; idx: number; title: string },
): string {
  return `${journeyPath(journey.id, journey.title)}/${chapter.idx + 1}-${slugify(chapter.title)}-${chapter.id}`;
}

export type ParsedChapterSlug = { n: number; slugPart: string; id: string };

export function parseChapterSlug(seg: string): ParsedChapterSlug | null {
  // shape: <n>-<title-slug>-<10-char-nanoid>; the separator before the id is at position -11
  if (seg.length < 13 || seg[seg.length - 11] !== '-') {
    return null;
  }
  const id = seg.slice(seg.length - 10);
  const head = seg.slice(0, seg.length - 11);
  const match = head.match(/^(\d+)-(.*)$/);
  if (match === null) return null;
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n < 1) return null;
  return { n, slugPart: match[2], id };
}
```

Looking up a chapter by `id` instead of by `(journeyId, idx)` keeps URLs valid across renames and reorderings; the `n` prefix is presentation, not identification.

### 2. `lib/url.test.ts` — new

Vitest covering:

- `journeyPath` / `parseJourneySlug` round-trips (currently untested).
- `chapterPath({id, title}, {id, idx, title})` → `/journeys/<jslug>-<jid>/<idx+1>-<cslug>-<cid>`.
- `parseChapterSlug('1-installing-python-abc123def4')` → `{ n: 1, slugPart: 'installing-python', id: 'abc123def4' }`.
- `parseChapterSlug('foo-bar')` → `null` (no trailing nanoid).
- `parseChapterSlug('0-installing-python-abc123def4')` → `null` (n must be ≥ 1).
- `parseChapterSlug('1-installing-pythonabc123def4')` → `null` (missing separator before id).
- Accented French title round-trip (`'Démarrage rapide'` → `'demarrage-rapide'`) with a real-looking nanoid suffix.

### 3. `app/[locale]/journeys/[journeySlug]/page.tsx` — convert to redirect

Replace the current render path with:

1. Parse + auth + `getJourney` exactly as today.
2. If journey slug is stale, `permanentRedirect({ href: journeyPath(journey.id, journey.title) /* + any chapter target */, locale })` — but since we're redirecting anyway, fold both into one: compute the chapter target first, then redirect (308 if also stale, 307 otherwise).
3. Pick target chapter: `journey.chapters.find(c => c.status === 'active')` → else `[...done].at(-1)` → else `journey.chapters[0]`.
4. `redirect({ href: chapterPath(journey, target), locale })` (or `permanentRedirect` if the journey slug was stale — use `permanentRedirect` to keep the 308 contract on stale paths and `redirect` otherwise).
5. No JSX returned; no `JourneyHome` import.

### 4. Delete `app/[locale]/journeys/[journeySlug]/_components/journey-home.tsx`

Unused after the redirect change. Also delete its test/snapshot files if any (none exist today).

`style-picker-persist.tsx` and `set-journey-style.ts` **stay** — they move with the StylePicker to the chapter page.

### 5. `app/[locale]/journeys/[journeySlug]/[chapterSlug]/page.tsx` — new

Server component:

1. Await `params: Promise<{ journeySlug; chapterSlug; locale }>`.
2. `parseJourneySlug(journeySlug)` → `notFound()` on null.
3. `parseChapterSlug(chapterSlug)` → `notFound()` on null. The parsed `n` is informational (used for human-friendly URLs) but **not** the lookup key.
4. `auth()` + `ensureUser(userId!)`.
5. `getJourney({ userId: userId!, id: parsed.id })` → `notFound()` on null.
6. `const chapter = journey.chapters.find((c) => c.id === parsedChapter.id)` → `notFound()` if missing. Lookup by `id`, not by `idx`, so renames and reorderings (Story 4) leave old URLs resolvable.
7. `notFound()` if `chapter.status === 'locked'`.
8. `const canonical = chapterPath(journey, chapter)`; if `\`/journeys/${journeySlug}/${chapterSlug}\` !== canonical`, `permanentRedirect({ href: canonical, locale })`. This single comparison covers all three staleness cases — wrong journey title, wrong chapter title, wrong `n` prefix (chapter has been reordered since the link was generated).
9. `const presets = listPresets()`.
10. Render `<ChapterPage journey={journey} chapter={chapter} presets={presets} />`.

### 6. `components/chat-page-shell.tsx` — new shared layout

The outer two-column app shell used by both the welcome page and the chapter
page. No business logic. The shell caps the chat column to a legible width on
wide screens and lets the sidebar widen, but it does not own sidebar
scrolling — each sidebar child (e.g. `SyllabusPanel`) handles its own scroll
so the controls below stay pinned.

```tsx
type Props = {
  /** Right-column content: panels, controls, optional fixed CTA. */
  sidebar: React.ReactNode;
  /** Left-column content: chat region. */
  children: React.ReactNode;
};

export function ChatPageShell({ sidebar, children }: Props) {
  return (
    <div className="flex flex-1 gap-6 overflow-hidden p-6">
      <section className="flex flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-hidden">
          {children}
        </div>
      </section>
      <aside className="2xl:w-md flex w-80 flex-col gap-4 overflow-hidden xl:w-96">
        {sidebar}
      </aside>
    </div>
  );
}
```

Lifted directly from the welcome-chat changes in
`.claude/plans/layout-scrollability-dazzling-karp.md` — keep these classnames
in sync if either side drifts.

### 7. `components/syllabus-panel.tsx` — new unified syllabus panel

Replaces `app/[locale]/_components/syllabus-draft-panel.tsx` (already
rebuilt as an accordion-based, internally-scrolling card by
`.claude/plans/layout-scrollability-dazzling-karp.md`). Two modes; same outer
card with header + scrollable body so neither mode pushes the sidebar
controls out of view.

```tsx
type DraftProps = {
  mode: 'draft';
  draft: Syllabus | null;
};

type NavigateProps = {
  mode: 'navigate';
  journey: Journey;
  currentIdx: number;
};

type Props = DraftProps | NavigateProps;

export function SyllabusPanel(props: Props) {
  const t = useTranslations(props.mode === 'draft' ? 'Welcome' : 'Chapter');
  // outer card identical in both modes — keep in sync with the existing
  // SyllabusDraftPanel implementation:
  //   <section className="flex min-h-0 flex-1 flex-col rounded-lg border">
  //     <h2 className="border-b p-4 font-semibold">{header}</h2>
  //     <div className="min-h-0 flex-1 overflow-y-auto p-4">{body}</div>
  //   </section>
}
```

Body content differs by mode:

- **Draft mode** — a single-open shadcn `Accordion` (Base UI primitive) of
  chapters. Trigger row shows `{idx + 1}. {title}` plus chapter summary;
  content reveals the section list. This is the implementation already
  shipped in `syllabus-draft-panel.tsx`; lift it as-is when extracting.
  Never a link, never highlighted.
- **Navigate mode** — a flat `<ol>` of `ChapterRow`s. No accordion: chapter
  rows are navigation targets, not disclosures.
  - `c.idx === currentIdx` → bold + `bg-muted` block, no link.
  - `c.status === 'done'` or `'active'` (and not current) →
    `<Link href={chapterPath(journey, c)}>` with normal weight; `done` gets
    a small Phosphor `Check` prefix.
  - `c.status === 'locked'` → `text-muted-foreground`, plain `<span>`, no
    link.

Both modes display `{idx + 1}. {title}`. Header is `t('draftHeader')` in
draft mode, `t('syllabusHeader')` in navigate mode.

`SyllabusDraftPanel` is deleted; `welcome-chat.tsx` now imports
`SyllabusPanel` and renders `<SyllabusPanel mode="draft" draft={draft} />`.
The new `emptyChapterSections` translation key (added alongside the
accordion) moves with the draft-mode body.

### 8. `app/[locale]/_components/welcome-chat.tsx` — retrofit to shared shell

Replace the bespoke outer `<div className="flex flex-1 gap-6 overflow-hidden p-6">…</div>` with `<ChatPageShell sidebar={…}>{chatRegion}</ChatPageShell>`. The chat region content (Conversation + PromptInput stack) and the sidebar content (SyllabusPanel + StylePicker + Start-journey button) are unchanged otherwise. `SyllabusDraftPanel` import → `SyllabusPanel`.

This is a pure refactor — no behavior change visible to the user — and locks both pages into the same shell from this story forward.

### 9. `app/[locale]/journeys/[journeySlug]/[chapterSlug]/_components/chapter-page.tsx` — new

Server component using the shared shell:

```tsx
<ChatPageShell
  sidebar={
    <>
      <SyllabusPanel
        mode="navigate"
        journey={journey}
        currentIdx={chapter.idx}
      />
      <StylePickerPersist
        initialStyleId={journey.styleId}
        journeyId={journey.id}
        presets={presets}
      />
    </>
  }
>
  <div className="flex flex-col gap-1">
    <p className="text-sm text-muted-foreground">
      {t('Chapter.position', { n: chapter.idx + 1, total: journey.chapters.length })}
    </p>
    <h1 className="text-3xl font-bold">{chapter.title}</h1>
  </div>
  <p className="text-muted-foreground">{t('Chapter.chatComingSoon')}</p>
  {/* Story 2 replaces the placeholder with <ChapterChat …/>. */}
</ChatPageShell>
```

Sidebar order matches welcome (syllabus panel first, style picker below) for muscle-memory consistency. The chapter page has no fixed bottom CTA — Story 3's "Go to next chapter" surfaces inline within the chat.

### 8. Move `style-picker-persist.tsx` and `set-journey-style.ts`

Relocate from
`app/[locale]/journeys/[journeySlug]/_components/`
to
`app/[locale]/journeys/[journeySlug]/[chapterSlug]/_components/`.

Update the import inside `style-picker-persist.tsx` for `setJourneyStyleAction`
(same-directory relative path, so it just moves alongside).

(Optional cleaner alternative: lift both into a shared `app/[locale]/journeys/[journeySlug]/_shared/` folder if Story 2+ also needs them. For Story 1 the chapter-scoped location is fine; we can lift later if reuse appears.)

### 9. `messages/en.json` + `messages/fr.json`

Add a `Chapter` namespace (parity enforced by existing `messages/parity.test.ts`):

```json
"Chapter": {
  "position": "Chapter {n} of {total}",
  "syllabusHeader": "Syllabus",
  "chatComingSoon": "The chapter chat will appear here."
}
```

French: `"Chapitre {n} sur {total}"`, `"Programme"`, `"Le chat du chapitre apparaîtra ici."`

Remove the now-obsolete `Journey.syllabusHeader`, `Journey.beginChapter`, `Journey.resumeChapter` entries — they were only consumed by the deleted `JourneyHome`. (Drop the whole `Journey` namespace if it becomes empty; keep parity.)

---

## Critical files reference

- Pattern to mirror: `app/[locale]/journeys/[journeySlug]/page.tsx` (slug parse → auth → fetch → canonical redirect). The chapter page repeats this and adds the chapter-level lookup; the journey page itself becomes a redirect-only handler that reuses the same lookup.
- Reuse: `getJourney` from `lib/server/journeys/get.ts` — returns `chapters[]` ordered by `idx`, with `status` + `summary`. No new entity-layer code required.
- Reuse: `redirect`, `permanentRedirect`, `Link` from `i18n/navigation.ts`.
- Reuse: `slugify` (after exporting), `journeyPath`, `parseJourneySlug` from `lib/url.ts`.
- Reuse + extract: layout pattern in `app/[locale]/_components/welcome-chat.tsx:139-181` becomes `components/chat-page-shell.tsx`; chapter-row visuals in `syllabus-draft-panel.tsx` become the `ChapterRow` primitive inside the new unified `components/syllabus-panel.tsx`.
- Reuse intact: `StylePickerPersist`, `setJourneyStyleAction`, `listPresets()` — files move but logic is untouched.
- DB schema reference: `lib/server/db/schema.ts:41-66` — `chapters.status` enum `'locked' | 'active' | 'done'`, 0-based `idx`, unique on `(journeyId, idx)`.

---

## Verification

Manual walkthrough (`pnpm dev`):

1. **Happy path (en).** Build a syllabus, click "Start journey". The post-bootstrap `router.push(journeyPath(...))` now resolves to a 307 → `/en/journeys/<slug>-<id>/1-<ch1-slug>`. Chapter title, "Chapter 1 of N" subtitle, sidebar with StylePicker + syllabus panel all render. Chapter 1 is highlighted; chapters 2..N appear dimmed without links.
2. **Direct journey URL redirect.** Hit `/en/journeys/<slug>-<id>` directly — 307 redirect to the active chapter page.
3. **Locked chapter → 404.** Visit `/en/journeys/<slug>-<id>/2-<ch2-slug>` while ch2 is locked — Next.js not-found.
4. **Done chapter navigation.** After Story 3 lands you'll have done chapters; for now, manually mark chapter 1 as `done` and chapter 2 as `active` via `drizzle-kit studio` to verify: panel shows ✓ on chapter 1 (clickable link back to it), bold on chapter 2 (current). Visiting `/.../1-<ch1-slug>` renders the done chapter page (no 404).
5. **Stale slug → 308.** Visit `/en/journeys/<slug>-<id>/1-wrong-title-<chapter-id>` — 308 to canonical `1-<correct-slug>-<chapter-id>` and renders the page. Same for stale journey slug, and same for a stale `n` prefix (e.g. `/.../99-<correct-slug>-<chapter-id>` redirects to the chapter's current `<actual-n>-<correct-slug>-<chapter-id>`). All three staleness cases collapse to a single canonical-path comparison.
6. **Style persistence.** Change the style from the chapter sidebar; reload — the picker still shows the chosen style.
7. **Welcome page unchanged externally.** Visit `/en/` after the refactor. Two-column layout looks identical to before (same paddings, same gaps, same chat region, same sidebar order: syllabus → style picker → Start-journey button). Build a syllabus end-to-end, confirm the chapter outline shows in the new `<SyllabusPanel mode="draft">`. No visual regression vs. pre-refactor screenshots.
8. **Locale.** Repeat steps 1 + 2 on `/fr`. Strings in `Chapter` namespace render in French; URLs stay under `/fr/...`.

Automated:

- `pnpm test` — new `lib/url.test.ts` passes; existing `messages/parity.test.ts` still passes.
- `pnpm lint` — Prettier + ESLint clean.
- `pnpm build` — Next.js build succeeds with the new dynamic `[chapterSlug]` segment.
