# Story 3 — Chapter Completion (D3.3) ✅ COMPLETE

## Context

Stories 1 and 2 of D3 (see `.claude/plans/03-chapter-page.md` and `.claude/plans/03-02-chapter-chat.md`) put a working chapter page in place: the journey URL redirects to the active chapter, the chapter page renders a two-column shell with `StylePickerPersist` and `ChapterSyllabusPanel` in the sidebar, and the main column is a streaming `ChapterChat` client island that posts to `POST /api/journeys/[id]/chapters/[n]/chat`. The chapter chat already wires one tool — `updateMemory` — which silently mutates `journeys.memory` in the background.

Story 3 of D3 adds the **second** chapter-chat tool, the **chapter-completion server action**, and the **next-chapter UI**:

- The model can decide a chapter is finished and fire `markChapterComplete`. The tool's `execute` is a no-op — it exists to put a recognisable part in the message stream.
- The client sees `tool-markChapterComplete` parts and renders a "Go to next chapter" button in the chat. Clicking it calls `completeChapterAction`, which:
  1. Generates a chapter summary (Markdown paragraph) via `generateText` + `Output.object` over the chat messages.
  2. Persists the summary on `chapters.summary`.
  3. Sets the current chapter's `status` to `'done'`.
  4. Unlocks the next chapter (`status` → `'active'`) if any.
  5. Bumps `journeys.currentChapterIndex`.
  6. Returns the canonical path of the next chapter (or `null` if this was the last chapter).
- The client then `router.push`es to the next chapter (or `router.refresh()`es to re-render the same chapter as `done` when there is no next).

What stays deferred:

- `proposeSyllabusChange` tool + confirm dialog + `applySyllabusChangeAction` — **Story 4**.
- Persisting chat history to a `messages` table — **Story 5**. Story 3 still needs the messages to generate a summary; the client passes them in the action body. Story 5 will replace the client-supplied messages with a DB read, transparently to the rest of the flow.
- A dedicated "Journey complete" view — out of scope. When the last chapter is completed, the syllabus panel already reflects the `done` state and the page simply renders as a done chapter.

---

## Decisions

- **`markChapterComplete` is a signal-only tool.** Zod input schema is `z.object({})` (no `reason` field — the model fires the signal, the user confirms by clicking, the server does the work). The `execute` returns `{ ok: true }`. Rationale: keeps user agency — the AI proposes completion, the user confirms. Avoids accidental destructive state changes mid-conversation and matches the pattern from Story 2 (`updateMemory` is silent and runs server-side; `markChapterComplete` is visible and runs only on user confirmation).
- **Tool description is inline English, not localized.** Three rules emphasise: (1) fire **once** when the chapter material is fully covered and the learner has demonstrated grasp; (2) do **not** continue teaching in the same message after firing; (3) never claim completion in prose without also calling the tool — the tool call is the canonical signal the UI listens for.
- **`composeChapterSystemPrompt` gets a new locale-monolingual rules paragraph.** Updates the en/fr `chapterPhase` strings in `lib/chapter-chat/prompts.ts` to describe both tools side by side, with the one-line latency hint already present from Story 2 left intact. No structural change to the composer signature.
- **Summary generation uses `generateText` + `Output.object`**, mirroring `lib/syllabus-chat/bootstrap.ts`. Schema is `z.object({ summary: z.string().min(20).max(500) })`. Model is the plain string `'anthropic/claude-sonnet-4-6'` via AI Gateway. `effort: 'low'` for the call — this is a constrained structured-output task, not a frontier reasoning problem, and Anthropic recommends `low` for non-frontier tasks where latency matters.
- **Summary content shape.** A single short Markdown paragraph in the second person ("You learned …, you practised …"). No bullet lists, no headings — those would crowd the syllabus panel later when summaries are surfaced. The composer wires the transcript like `bootstrap.ts` does (filter `text` parts only, join `role: text` per message). Tool-part transcripts are intentionally dropped — the summary is about *what was taught*, not what the model did internally.
- **Summary uses the request locale via `getLocale()` from `next-intl/server`.** Same pattern as `createJourneyAction` and the existing server actions: the summary text must match the locale the user is currently browsing under so an `/fr/` learner does not get an English recap. Pass `parseLocale(await getLocale())` into `generateChapterSummary`.
- **Client passes messages to the server action.** Story 5 will replace this with a DB read, but Story 3 ships value now. Security caveat documented inline: a hostile client can fabricate messages, so the worst case is a misleading summary. The action still calls `validateUIMessages({ messages })` server-side to defend against malformed payloads, and the summary text is never used in security-sensitive code paths.
- **`completeChapter` entity function lives at `lib/server/chapters/complete.ts`.** This creates the `chapters/` subdirectory for the first time (per the layout in `00-journey-app.md`). It accepts `{ userId, journeyId, idx, summary }`, runs the full state transition in a single `dbTx.transaction`, and returns `{ nextIdx: number | null }`. Every UPDATE statement is scoped by `userId` via a join through `journeys.userId` so a request for a chapter owned by another user is a no-op (no leak, no error) — same shape as `setStyle.ts`, extended to a parent-table check.
- **Transaction is idempotent on already-done chapters.** If the chapter is already `'done'` when the function runs, it does not re-emit a `'done'` write or bump anything; it just computes `nextIdx` from the current chapter set and returns. This matches user expectations when the button is clicked twice (double-click, network retry) and avoids racing summary writes.
- **Navigation uses `useRouter` from `i18n/navigation.ts`.** The action returns `{ nextChapterPath: string | null }`; the client calls `router.push(nextChapterPath)` when non-null and `router.refresh()` otherwise (re-renders the now-done current chapter so the syllabus panel updates).
- **The "Next chapter" button renders inside the AI message bubble**, alongside the assistant's final text in the same message — that's where `tool-markChapterComplete` parts naturally appear. The shared `ChatScaffold` from Story 2 already accepts a per-page `renderPart` callback; Story 3 just extends the chapter chat's callback with a `tool-markChapterComplete` branch alongside the existing `text` branch. No scaffold change, no new sub-component.
- **Button is `useTransition`-pending.** While the action is in flight the button is disabled and shows a loading spinner. On error, surface a toast or inline message — keep it simple; the button can re-enable so the user can retry.
- **No new tests** beyond keeping `messages/parity.test.ts` green after the i18n additions. Verification is manual end-to-end.
- **No first-turn effort boost on the summary call.** This isn't a chat turn at all (it's a single `generateText` server-side call), so the syllabus-route's "first user message → `effort: 'max'`" pattern doesn't apply. The summary call uses `effort: 'low'` flat.

---

## Files to modify

### 1. `lib/chapter-chat/tools.ts` — add `createMarkChapterCompleteTool`

Add a second tool factory alongside `createUpdateMemoryTool`. Like its sibling, this one is a factory in case Story 4+ wants to close over `journeyId`/`chapterIdx` for richer telemetry, but for now the tool takes no constructor params and no input — both are kept as `z.object({})` to leave room for evolution without a schema break on the client.

```ts
import { tool } from 'ai';
import { z } from 'zod';

/**
 * Builds an AI SDK tool that signals chapter completion. The model emits this
 * once, and the UI surfaces a "Go to next chapter" button. The actual state
 * transition happens in `completeChapterAction` when the user clicks.
 *
 * @returns A signal-only `markChapterComplete` tool.
 */
export function createMarkChapterCompleteTool() {
  return tool({
    description: `Signal that the current chapter is complete and the learner is ready to move on.

Rules:
- Fire this tool exactly once, when the chapter's material is fully covered AND the learner has demonstrated grasp of the key ideas. Do not fire it speculatively.
- After firing this tool, end your message. Do not continue teaching in the same turn.
- Never claim the chapter is complete in prose without also calling this tool — the tool call is the canonical signal the UI listens for to show the "Go to next chapter" button.
- This tool does not move the learner forward by itself. The user clicks a button to confirm.`,
    inputSchema: z.object({}),
    execute: async () => ({ ok: true }),
  });
}
```

### 2. `lib/chapter-chat/prompts.ts` — extend the rules block

Update both `chapterPhase.en` and `chapterPhase.fr` to mention `markChapterComplete` alongside `updateMemory`. Keep the existing latency hint line ("Extended thinking adds latency…") in place. Sketch (English; mirror French phrasing in the same structure, second person, no English-language tokens):

```ts
const chapterPhase: Record<Locale, string> = {
  en: `You are teaching a single chapter of an ongoing learning journey.

Stay scoped to the current chapter. If the learner asks about content from another chapter, briefly redirect them and continue teaching the current one. Use the chapter title, summary, and sections below as the source of truth for what to cover.

You have access to the full syllabus only to keep your bearings, not to wander into later chapters. Treat the syllabus as immutable in this story — you cannot edit it.

You have a private \`updateMemory\` tool. Use it when you learn something durable about the learner (clarified goal, new gap, pace preference, confusion pattern, etc.). Always pass the FULL updated Markdown memory — this is a replacement, not a patch. Never mention the tool to the learner; the update is silent.

You have a \`markChapterComplete\` tool. Call it exactly once, when the chapter's material is fully covered and the learner has demonstrated grasp. After calling it, end your message — do not continue teaching in the same turn. The tool surfaces a "Go to next chapter" button; the user, not you, decides when to advance.

Extended thinking adds latency and should only be used when it will meaningfully improve answer quality. When in doubt, respond directly.`,
  fr: `Vous enseignez un seul chapitre … [mirror structure: décrire updateMemory comme outil silencieux à remplacement complet ; décrire markChapterComplete comme un signal unique en fin de chapitre, jamais accompagné de poursuite d'enseignement ; reprendre la phrase sur le temps de réflexion étendu.]`,
};
```

No structural change to `composeChapterSystemPrompt` itself.

### 3. `lib/chapter-chat/prompts.ts` — add `composeChapterSummaryPrompt`

Co-locate the summary-generation prompt composer with the chat prompt composer. It is locale-monolingual and returns the full prompt string consumed by `generateChapterSummary`.

```ts
/** Parameters for composing the chapter-summary generation prompt. */
export type ComposeChapterSummaryPromptParams = {
  /** Teaching style whose fragment frames the summary voice. */
  style: Style;
  /** Locale used to select the correct language variant. */
  locale: Locale;
  /** The current chapter being summarised. */
  chapter: JourneyChapter;
  /** Chat transcript over the chapter (text parts only). */
  messages: UIMessage[];
};

const summaryInstructions: Record<Locale, string> = {
  en: `Summarise what was actually taught in this chapter and what the learner demonstrated.

Output a single Markdown paragraph (no headings, no bullets) in the second person ("You learned…, you practised…"). 20–500 characters. Stick to facts visible in the transcript — do not invent material that was not discussed.`,
  fr: `Résumez ce qui a réellement été enseigné dans ce chapitre et ce que l'apprenant a démontré.

Produisez un seul paragraphe Markdown (sans titres, sans puces) à la deuxième personne (« Vous avez appris…, vous avez pratiqué… »). 20 à 500 caractères. Tenez-vous-en aux faits visibles dans la transcription — n'inventez pas de contenu qui n'a pas été abordé.`,
};

/**
 * Builds the prompt used to generate a chapter summary.
 *
 * @param params - Style, locale, chapter, and chat transcript.
 * @returns Full prompt string suitable for `generateText`.
 */
export function composeChapterSummaryPrompt({
  style,
  locale,
  chapter,
  messages,
}: ComposeChapterSummaryPromptParams): string {
  const transcript = messages
    .map((m) => {
      const text = m.parts
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join(' ');
      return `${m.role}: ${text}`;
    })
    .join('\n');

  return `${style.systemPromptFragments[locale]}

${summaryInstructions[locale]}

Chapter: ${chapter.title}

Transcript:
${transcript}`;
}
```

Filtering to text-only parts mirrors `bootstrap.ts`. Tool calls are excluded by design.

### 4. `lib/chapter-chat/complete.ts` — new

Pure orchestration for the summary generation step.

```ts
import { Output, type UIMessage, generateText } from 'ai';
import { z } from 'zod';

import type { Locale } from '@/i18n/locale';
import { composeChapterSummaryPrompt } from '@/lib/chapter-chat/prompts';
import type { JourneyChapter } from '@/lib/server/journeys/get';
import type { Style } from '@/lib/server/styles/get';

const summarySchema = z.object({
  summary: z.string().min(20).max(500),
});

/** Parameters for generating a chapter summary at completion time. */
export type GenerateChapterSummaryParams = {
  /** Teaching style frames the summary voice. */
  style: Style;
  /** Locale of the summary. */
  locale: Locale;
  /** Chapter being summarised. */
  chapter: JourneyChapter;
  /** Chat transcript captured client-side. */
  messages: UIMessage[];
};

/** Result of a successful summary generation. */
export type GenerateChapterSummaryResult = {
  /** Markdown paragraph in the second person. */
  summary: string;
};

/**
 * Generates a Markdown paragraph summarising what was taught in a chapter.
 *
 * @param params - Style, locale, chapter, and transcript.
 * @returns The generated summary.
 */
export async function generateChapterSummary({
  style,
  locale,
  chapter,
  messages,
}: GenerateChapterSummaryParams): Promise<GenerateChapterSummaryResult> {
  const prompt = composeChapterSummaryPrompt({
    style,
    locale,
    chapter,
    messages,
  });

  const { output } = await generateText({
    model: 'anthropic/claude-sonnet-4-6',
    prompt,
    output: Output.object({ schema: summarySchema }),
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive' },
        effort: 'low',
      },
    },
  });

  return output;
}
```

Justification for `effort: 'low'`: this is a constrained structured-output task (single paragraph, fixed schema), explicitly the use case Anthropic flags as not needing extra reasoning budget. Adaptive thinking stays on for any unusual case but defaults stay tight.

### 5. `lib/server/chapters/complete.ts` — new entity function

First module under `lib/server/chapters/`. Mirrors `setStyle.ts` for scoping but uses `dbTx` for the multi-row transaction.

```ts
import { and, eq } from 'drizzle-orm';

import { dbTx } from '@/lib/server/db';
import { chapters, journeys } from '@/lib/server/db/schema';

/** Parameters for completing a chapter. */
export type CompleteChapterInput = {
  /** Clerk user ID — scopes every write to the owner of the journey. */
  userId: string;
  /** Journey the chapter belongs to. */
  journeyId: string;
  /** Zero-based index of the chapter to mark complete. */
  idx: number;
  /** Markdown summary to persist on the chapter row. */
  summary: string;
};

/** Result of a chapter completion. */
export type CompleteChapterResult = {
  /** Index of the next chapter unlocked, or `null` if there is no next chapter. */
  nextIdx: number | null;
};

/**
 * Marks a chapter as `done`, persists its summary, unlocks the next chapter,
 * and bumps `journeys.currentChapterIndex`. All writes happen in a single
 * transaction and are scoped to the journey owner via `journeys.userId`.
 *
 * Idempotent on already-done chapters: returns the current `nextIdx` without
 * re-writing.
 *
 * @param input - Owner, journey, chapter idx, and summary text.
 * @returns The index of the now-active chapter, or `null` if last chapter.
 */
export async function completeChapter({
  userId,
  journeyId,
  idx,
  summary,
}: CompleteChapterInput): Promise<CompleteChapterResult> {
  return dbTx.transaction(async (tx) => {
    const journeyRows = await tx
      .select({ id: journeys.id })
      .from(journeys)
      .where(and(eq(journeys.id, journeyId), eq(journeys.userId, userId)));
    if (journeyRows.length === 0) {
      throw new Error('Journey not found');
    }

    const chapterRows = await tx
      .select({
        id: chapters.id,
        idx: chapters.idx,
        status: chapters.status,
      })
      .from(chapters)
      .where(eq(chapters.journeyId, journeyId))
      .orderBy(chapters.idx);

    const current = chapterRows.find((c) => c.idx === idx) ?? null;
    if (current === null) {
      throw new Error('Chapter not found');
    }

    const lastIdx = chapterRows[chapterRows.length - 1]?.idx ?? idx;
    const nextIdx = idx + 1 <= lastIdx ? idx + 1 : null;

    if (current.status === 'done') {
      return { nextIdx };
    }

    await tx
      .update(chapters)
      .set({ status: 'done', summary })
      .where(and(eq(chapters.id, current.id), eq(chapters.journeyId, journeyId)));

    if (nextIdx !== null) {
      await tx
        .update(chapters)
        .set({ status: 'active' })
        .where(
          and(
            eq(chapters.journeyId, journeyId),
            eq(chapters.idx, nextIdx),
          ),
        );
    }

    const newCurrent = nextIdx ?? lastIdx;
    await tx
      .update(journeys)
      .set({ currentChapterIndex: newCurrent })
      .where(and(eq(journeys.id, journeyId), eq(journeys.userId, userId)));

    return { nextIdx };
  });
}
```

Notes:
- Every UPDATE on `chapters` is bounded by `journeyId` (already verified to belong to `userId`). The first `select` is the ownership gate; subsequent writes can rely on the gate because they're inside the same transaction.
- `currentChapterIndex` is clamped to the last chapter's idx when this was the last chapter — keeps the field meaningful for the "where am I" UI.
- Drizzle manages `journeys.updatedAt` via the `$onUpdateFn` in the schema.

### 6. `app/[locale]/journeys/[journeySlug]/[chapterSlug]/_components/complete-chapter.ts` — new server action

Co-located with the chapter page (same convention as Story 1's `set-journey-style.ts`).

```ts
'use server';

import { auth } from '@clerk/nextjs/server';
import { type UIMessage, validateUIMessages } from 'ai';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';

import { parseLocale } from '@/i18n/locale';
import { completeChapter } from '@/lib/server/chapters/complete';
import { getJourney } from '@/lib/server/journeys/get';
import { getStyle } from '@/lib/server/styles/get';
import { generateChapterSummary } from '@/lib/chapter-chat/complete';
import { chapterPath } from '@/lib/url';

/** Input for the {@link completeChapterAction} server action. */
export type CompleteChapterInput = {
  /** Journey ID owning the chapter. */
  journeyId: string;
  /** Zero-based index of the chapter being completed. */
  chapterIdx: number;
  /** Full chat transcript for this chapter (client-supplied until Story 5). */
  messages: UIMessage[];
};

/** Result returned by {@link completeChapterAction}. */
export type CompleteChapterResult = {
  /** Canonical URL of the next chapter, or `null` when there is no next. */
  nextChapterPath: string | null;
};

const inputSchema = z.object({
  journeyId: z.string().min(1),
  chapterIdx: z.number().int().min(0),
  messages: z.array(z.unknown()),
});

/**
 * Server action that finalises a chapter: generates a summary, persists it,
 * marks the chapter `done`, and unlocks the next chapter.
 *
 * Until Story 5 lands chat-history persistence, the transcript used for the
 * summary is supplied by the client. The summary is non-security-sensitive
 * (educational color text only); a malicious client can at worst produce a
 * misleading recap. The input is still validated for structural safety via
 * `validateUIMessages` before being passed to the LLM.
 *
 * @param input - Journey ID, chapter index, and chat transcript.
 * @returns The canonical path of the next chapter, or `null` if last chapter.
 * @throws Error when the caller is not authenticated or inputs are invalid.
 */
export async function completeChapterAction(
  input: CompleteChapterInput,
): Promise<CompleteChapterResult> {
  const { userId } = await auth();
  if (userId === null) {
    throw new Error('Unauthorized');
  }

  const parsed = inputSchema.parse(input);
  const messages = await validateUIMessages({ messages: parsed.messages });

  const journey = await getJourney({ userId, id: parsed.journeyId });
  if (journey === null) {
    throw new Error('Journey not found');
  }
  const chapter = journey.chapters.find((c) => c.idx === parsed.chapterIdx);
  if (chapter === undefined) {
    throw new Error('Chapter not found');
  }
  if (chapter.status !== 'active') {
    const nextIdx = parsed.chapterIdx + 1;
    const next = journey.chapters.find((c) => c.idx === nextIdx) ?? null;
    return {
      nextChapterPath: next === null ? null : chapterPath(journey, next),
    };
  }

  const style = getStyle(journey.styleId);
  if (style === null) {
    throw new Error('Invalid style');
  }
  const locale = parseLocale(await getLocale());

  const { summary } = await generateChapterSummary({
    style,
    locale,
    chapter,
    messages,
  });

  const { nextIdx } = await completeChapter({
    userId,
    journeyId: journey.id,
    idx: chapter.idx,
    summary,
  });

  if (nextIdx === null) {
    return { nextChapterPath: null };
  }

  const nextChapter = journey.chapters.find((c) => c.idx === nextIdx);
  if (nextChapter === undefined) {
    return { nextChapterPath: null };
  }
  return { nextChapterPath: chapterPath(journey, nextChapter) };
}
```

### 7. `app/api/journeys/[id]/chapters/[n]/chat/route.ts` — wire the new tool

Two narrow edits:

1. Import `createMarkChapterCompleteTool` from `lib/chapter-chat/tools`.
2. Extend the `tools` map built per request:

```ts
const tools = {
  updateMemory: createUpdateMemoryTool({ userId, journeyId: journey.id }),
  markChapterComplete: createMarkChapterCompleteTool(),
};
```

No other route changes. The model now has both tools available.

### 8. `app/[locale]/journeys/[journeySlug]/[chapterSlug]/_components/chapter-chat.tsx` — render the CTA

Three changes on top of Story 2's client island.

(a) Imports:

```tsx
import { useTransition } from 'react';

import { completeChapterAction } from './complete-chapter';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
```

(b) Inside the component, get a router + transition handle:

```tsx
const router = useRouter();
const [completing, startCompleting] = useTransition();

const handleComplete = () => {
  startCompleting(async () => {
    const result = await completeChapterAction({
      journeyId: journey.id,
      chapterIdx: chapter.idx,
      messages,
    });
    if (result.nextChapterPath !== null) {
      router.push(result.nextChapterPath);
    } else {
      router.refresh();
    }
  });
};
```

(c) Extend the existing `renderPart` callback from Story 2 with a branch for `tool-markChapterComplete`. The callback is the single per-page divergence from the welcome chat; the shared `ChatScaffold` consumes it unchanged.

```tsx
const renderPart = (
  part: UIMessage['parts'][number],
  { streaming, index }: { message: UIMessage; streaming: boolean; index: number },
) => {
  if (part.type === 'text') {
    return (
      <MessageResponse key={index} isAnimating={streaming}>
        {part.text}
      </MessageResponse>
    );
  }
  if (part.type === 'tool-markChapterComplete') {
    const lastChapter = chapter.idx === journey.chapters.length - 1;
    const label = lastChapter ? t('completeJourney') : t('completeChapter');
    return (
      <div key={index} className="mt-2">
        <Button type="button" disabled={completing} onClick={handleComplete}>
          {label}
        </Button>
      </div>
    );
  }
  return null; // tool-updateMemory and any future hidden parts
};
```

The button surfaces inline within the assistant message that fired the tool, which is exactly where the user expects to see it.

(d) Error surface (optional, lightweight). Wrap the `await` in a `try/catch` and store the error in local state to render a small inline note next to the button. A toast system is not yet in the project — for Story 3 a plain `<p className="text-sm text-destructive">` is fine. Surface a generic `t('completeError')` string; no need to disclose internals.

### 9. `messages/en.json` + `messages/fr.json` — extend `ChapterChat`

Add three keys under the existing `ChapterChat` namespace:

```json
"ChapterChat": {
  "promptPlaceholder": "Ask anything about this chapter…",
  "completeChapter": "Go to next chapter",
  "completeJourney": "Mark this chapter complete",
  "completeError": "Could not complete the chapter. Try again."
}
```

French:

```json
"ChapterChat": {
  "promptPlaceholder": "Posez vos questions sur ce chapitre…",
  "completeChapter": "Passer au chapitre suivant",
  "completeJourney": "Marquer ce chapitre comme terminé",
  "completeError": "Impossible de terminer le chapitre. Réessayez."
}
```

`messages/parity.test.ts` enforces structural equality — add to both files in the same commit.

---

## Critical files reference

- **Tool-factory pattern**: `lib/chapter-chat/tools.ts` (Story 2). `markChapterComplete` follows the same exported-factory convention, just without constructor params.
- **Structured-output generation**: `lib/syllabus-chat/bootstrap.ts` — `generateText` + `Output.object` shape, transcript-from-messages helper, locale-keyed instruction map. `generateChapterSummary` mirrors it; the only deltas are the schema (single `summary` field) and the addition of `providerOptions` with `effort: 'low'` + adaptive thinking.
- **Transactional entity write**: `lib/server/journeys/setStyle.ts` for the `(id, userId)` scoping idiom; `lib/server/db/index.ts` for `dbTx`. The new `completeChapter` extends the scoping pattern across two tables by gating reads on the parent `journeys.userId` before issuing child writes inside the same `dbTx.transaction`.
- **Server action pattern**: `app/[locale]/_components/create-journey.ts` — auth, Zod validate, `getLocale`, delegate to feature module + entity, return navigation path. `completeChapterAction` is a near-clone.
- **Client message-part rendering**: `components/chat-scaffold.tsx` (Story 2) exposes a `renderPart` callback per page. Story 3 extends the chapter chat's callback with a `tool-markChapterComplete` branch.
- **Locale-aware navigation**: `i18n/navigation.ts` — `useRouter().push(path)` and `useRouter().refresh()`. Server-side, `chapterPath` from `lib/url.ts` (added in Story 1) returns the locale-relative path; `useRouter` from `i18n/navigation` prepends the locale.
- **Schema reference**: `lib/server/db/schema.ts` — `chapters.summary` is `text('summary')` (nullable today; the UPDATE sets it). `chapters.status` is the `chapter_status` enum. `journeys.currentChapterIndex` defaults to 0 and is a plain integer. The unique index on `(journeyId, idx)` guarantees the `idx + 1` lookup is unambiguous.

---

## Verification

Manual walkthrough in `pnpm dev`, both locales:

1. **Happy path (en, two-chapter journey).** Build a 2-chapter syllabus, start journey, land on `/en/journeys/<slug>-<id>/1-<ch1>`. Chat through chapter 1; once the model has covered the chapter, steer it ("I think I've got this — anything else?"). Observe the model firing `markChapterComplete`. A "Go to next chapter" button renders inline in that assistant message. Click it; the button becomes disabled with a spinner, the action runs, the page navigates to `/en/journeys/<slug>-<id>/2-<ch2>`. Check `drizzle-kit studio`:
   - `chapters` row for ch1: `status = 'done'`, `summary` is a Markdown paragraph mentioning what was taught.
   - `chapters` row for ch2: `status = 'active'`.
   - `journeys.currentChapterIndex = 1`.
2. **Syllabus panel reflects state.** On the chapter-2 page, the syllabus panel shows a ✓ next to chapter 1 (clickable link back), chapter 2 bold/highlighted as current.
3. **Last chapter edge case.** From the chapter-2 page, repeat the flow. The button label is `t('completeJourney')` (en: "Mark this chapter complete"). Click it; `nextChapterPath` is `null`, the client calls `router.refresh()`. The page re-renders for the now-done chapter (no 404 — done chapters are still visitable). `journeys.currentChapterIndex` clamps to `1`. Syllabus panel shows ✓ on both chapters.
4. **Idempotency.** Reload the just-completed chapter page. Try clicking the button again (if a `markChapterComplete` part is still rendered in the chat) — `completeChapterAction` short-circuits to the idempotent branch (`status !== 'active'`), no second summary is generated, the user is redirected to the next-chapter path (or refreshed). Confirm `chapters.summary` was not overwritten.
5. **Auth gate.** Sign out, then call `completeChapterAction` programmatically via the browser devtools (e.g., navigate to a stale tab). Returns an unauthorized error; no DB writes happen.
6. **Cross-user isolation.** As user A, complete a chapter and grab the `journeyId`. Sign in as user B, manually fire `completeChapterAction` against A's `journeyId` from devtools. `getJourney` returns `null`, the action throws "Journey not found", no writes happen.
7. **Locale (fr).** Repeat steps 1–3 on `/fr`. Tool prose stays English (inline tool description), but the model's chat output, the button labels, and the generated chapter summary in `chapters.summary` are all in French — verify the summary text in drizzle-kit studio is in French (the action picks locale up from `getLocale()`, same mechanism as `createJourneyAction`).
8. **Style fragment influences summary voice.** Switch the chapter style to "Tutorial" before completing; the summary tone should differ subtly from the "Teacher" preset for the same conversation.
9. **No double-click hazard.** Click the button repeatedly while the action is pending — the disabled state and `useTransition` flag block additional submissions. Only one summary is generated.

Automated:

- `pnpm lint` — Prettier + ESLint clean.
- `pnpm test` — `messages/parity.test.ts` still passes after the en/fr key additions; Story 1's `lib/url.test.ts` still passes.
- `pnpm build` — Next.js production build succeeds with the new `lib/server/chapters/` directory and the new server action.
