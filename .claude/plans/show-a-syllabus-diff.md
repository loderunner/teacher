# Context

When the AI updates the syllabus draft (via `updateSyllabusDraft`) or proposes a change
(via `proposeSyllabusChange`), the UI gives no information about *what* changed.

Two things to build:
1. **`updateSyllabusDraft`** (`/journeys/new`): The "Updated syllabus" block becomes a
   Reasoning-style collapsible — same trigger text/icon, caret to expand, diff list inside.
2. **`proposeSyllabusChange`** (chapter chat): Keep the pending card (reason + diff + buttons)
   as-is. Only the **dismissed** and **applied** states change — they become collapsibles
   ("Syllabus change dismissed" / "Syllabus change applied" as trigger, diff inside).

Both are always user-togglable, presentation identical to the Reasoning component.

---

# Files to change

| # | File | Change |
|---|------|--------|
| 1 | `lib/server/syllabus/diff.ts` (new) | Move + generalize `diffSyllabus` here |
| 2 | `lib/server/syllabus/diff.test.ts` (new) | Tests covering both ID-based and title-based paths |
| 3 | `app/[locale]/journeys/[journeySlug]/[chapterSlug]/syllabus-diff.ts` | Delete — replaced by #1 |
| 4 | `components/syllabus-diff-collapsible.tsx` (new) | Shared Reasoning-style collapsible |
| 5 | `messages/en.json` + `messages/fr.json` | Update 2 keys + add 3 new Welcome keys |
| 6 | `app/[locale]/journeys/new/syllabus-part-delegate.tsx` | Make "Updated syllabus" collapsible |
| 7 | `app/[locale]/journeys/new/syllabus-chat.tsx` | Thread previous-draft context |
| 8 | `app/[locale]/journeys/[journeySlug]/[chapterSlug]/syllabus-change-card.tsx` | Dismissed + applied → collapsibles |

---

# Step-by-step plan

## 1. `lib/server/syllabus/diff.ts` (new — replaces route-level `syllabus-diff.ts`)

Generalizes `diffSyllabus` to accept `Syllabus` for both sides (was `Journey` + `Syllabus`).

**Strategy selection:**
- If `before.chapters` all have `id` → **ID-based matching** (existing journey→proposal logic,
  unchanged behavior for the chapter chat)
- Otherwise → **title-based matching** (normalized: trimmed + lowercased) for the draft flow
  where the model does not carry IDs across calls

```typescript
export type SyllabusDiff = {
  added: string[];
  removed: string[];
  renamed: { oldTitle: string; newTitle: string }[];
  reordered: boolean;
};

export function diffSyllabus(before: Syllabus, after: Syllabus): SyllabusDiff
```

**ID-based path** (unchanged logic from the existing function):
- Build `beforeById: Map<id, title>` from `before.chapters`
- Walk `after.chapters`: chapters with a known id are matched; unknown/missing id → added
- Unclaimed before chapters → removed
- Claim order check → reordered

**Title-based path** (new, for draft→draft):
- Build `beforeByNormTitle: Map<normalizedTitle, originalTitle>`
- Walk `after.chapters`: matching norm title → claimed; no match → added
- Unclaimed before chapters → removed
- Preserve-order check → reordered
- `renamed` is always `[]` (can't distinguish rename from remove+add without IDs)

**Chapter chat adapter** — the caller constructs `before` from `journey.chapters`:
```typescript
// journey.chapters has { id: string; title: string; ... }
// Syllabus.chapters has { id?: string; title: string; ... }
// string satisfies string|undefined — direct structural match
const diff = diffSyllabus({ chapters: journey.chapters }, proposal.newSyllabus);
```

## 2. `lib/server/syllabus/diff.test.ts` (new)

Two `describe` blocks: `'ID-based path'` (all before chapters have ids) and
`'title-based path'` (no before chapters have ids).

Key cases:
- Empty → empty: `{ added:[], removed:[], renamed:[], reordered:false }`
- ID path: add, remove, rename (same id, different title), reorder, mixed
- Title path: add, remove, reorder, title-case normalization, whitespace normalization
- Boundary: before has ids but after does not (all after → added, before → removed)

## 3. `components/syllabus-diff-collapsible.tsx` (new)

```
'use client'
Props: { triggerLabel: string; triggerIcon: ReactNode; defaultOpen?: boolean; children: ReactNode }
```

- `useState(defaultOpen ?? false)` for open/closed
- `Collapsible` wrapper with `className="not-prose"`
- `CollapsibleTrigger` — same classes as `ReasoningTrigger`:
  `"text-muted-foreground hover:text-foreground flex w-full items-center gap-2 text-xs transition-colors"`
  Renders: `{triggerIcon}` · `<span>{triggerLabel}</span>` · `<CaretDownIcon>` rotating on open
- `CollapsibleContent` — same animation classes as `ReasoningContent`:
  `"data-open:animate-collapsible-down data-closed:animate-collapsible-up overflow-hidden"`
  with `h-(--collapsible-panel-height) data-ending-style:h-0 data-starting-style:h-0` inner div
  and `<ul className="text-muted-foreground mt-2 flex flex-col gap-0.5 text-xs">` containing
  `{children}` (caller passes `<li>` elements)

No `useControllableState` needed — simple `useState` is sufficient.

## 4. Translation keys

**Update existing `ChapterChat` keys** (label text change only):
```
proposalApplied:   "Applied"   → "Syllabus change applied"
proposalDismissed: "Dismissed" → "Syllabus change dismissed"
```
```
fr: proposalApplied   → "Modification du programme appliquée"
fr: proposalDismissed → "Modification du programme ignorée"
```

**Add to `Welcome` namespace** (for `updateSyllabusDraft` diff content):
```
syllabusAdded:    "Added: {titles}"
syllabusRemoved:  "Removed: {titles}"
syllabusReordered:"Chapters reordered"
```
```
fr: syllabusAdded    → "Ajouté·s : {titles}"
fr: syllabusRemoved  → "Supprimé·s : {titles}"
fr: syllabusReordered→ "Chapitres réordonnés"
```

## 5. `syllabus-part-delegate.tsx`

Add optional `previousDraft?: Syllabus | null` prop (separate from `MessagePartDelegateProps`
base; the wrapper in `syllabus-chat.tsx` supplies it via closure).

**`state === 'output-available'` rendering:**

```
previousDraft is undefined   → plain CheckIcon + "Updated syllabus" (no collapsible)
previousDraft is null        → plain CheckIcon + "Updated syllabus" (first call, nothing to diff)
previousDraft is Syllabus    → compute diff; if hasChanges: collapsible; else: plain text
```

When showing the collapsible:
```tsx
<SyllabusDiffCollapsible
  triggerIcon={<CheckIcon size={12} />}
  triggerLabel={t('syllabusUpdated')}
>
  {diff.added.length > 0 && <li>{t('syllabusAdded', { titles: diff.added.join(', ') })}</li>}
  {diff.removed.length > 0 && <li>{t('syllabusRemoved', { titles: diff.removed.join(', ') })}</li>}
  {diff.reordered && <li>{t('syllabusReordered')}</li>}
</SyllabusDiffCollapsible>
```

The streaming (non-output-available) branch is unchanged.

## 6. `syllabus-chat.tsx`

Add `useMemo` to React imports.

Build `previousDraftByID: Map<string, Syllabus | null>` walking messages forward,
recording the last completed draft before each tool call ID:

```typescript
const previousDraftByID = useMemo(() => {
  const map = new Map<string, Syllabus | null>();
  let last: Syllabus | null = null;
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue;
    for (const part of msg.parts) {
      if (!isSyllabusDraftToolPart(part)) continue;
      if (part.state === 'output-available' || part.state === 'input-available') {
        map.set(part.toolCallId, last);
        last = part.input.draft;
      }
    }
  }
  return map;
}, [messages]);
```

Memoized delegate wrapper (arrow function in `useMemo`, per coding standards):
```typescript
const SyllabusPartDelegateWithDiff = useMemo(
  () =>
    (props: MessagePartDelegateProps<SyllabusChatUIMessage>) => (
      <SyllabusPartDelegate
        {...props}
        previousDraft={
          props.part.type === 'tool-updateSyllabusDraft'
            ? (previousDraftByID.get(props.part.toolCallId) ?? undefined)
            : undefined
        }
      />
    ),
  [previousDraftByID],
);
```

Note: `?? undefined` converts a Map miss to `undefined` (suppress diff) while preserving
`null` from the map for the first call (also suppresses diff). After type narrowing on
`'tool-updateSyllabusDraft'`, `props.part.toolCallId` is safely accessible.

Pass `SyllabusPartDelegateWithDiff` as `MessagePartDelegate` to `JourneyChatView`.

## 7. `syllabus-change-card.tsx`

Move `diffSyllabus` call (using updated import from `@/lib/server/syllabus/diff`) before
the `dismissed` early return so both dismissed and applied states have access to it:

```typescript
const diff = diffSyllabus({ chapters: journey.chapters }, proposal.newSyllabus);
```

**`dismissed` branch** — replace simple italic text with collapsible:
```tsx
if (dismissed) {
  return (
    <SyllabusDiffCollapsible
      triggerIcon={<XIcon size={12} />}
      triggerLabel={t('proposalDismissed')}   // now "Syllabus change dismissed"
      className="mt-2"
    >
      {/* same <li> items as below */}
    </SyllabusDiffCollapsible>
  );
}
```

**`applied` branch** — replace simple italic text with collapsible:
```tsx
if (applied) {
  return (
    <SyllabusDiffCollapsible
      triggerIcon={<CheckIcon size={12} />}
      triggerLabel={t('proposalApplied')}   // now "Syllabus change applied"
      className="mt-2"
    >
      {/* same <li> items */}
    </SyllabusDiffCollapsible>
  );
}
```

**Active (pending) branch** — keep exactly as-is (reason + diff list + Apply/Dismiss buttons).

Import `XIcon`, `CheckIcon` from `@phosphor-icons/react`; import `SyllabusDiffCollapsible`
from `@/components/syllabus-diff-collapsible`; update `diffSyllabus` import path.

---

# Reviewer reading order

1. `lib/server/syllabus/diff.ts` — core algorithm
2. `lib/server/syllabus/diff.test.ts` — validates both paths
3. `components/syllabus-diff-collapsible.tsx` — UI primitive
4. `messages/en.json` — updated + new keys
5. `app/[locale]/journeys/new/syllabus-part-delegate.tsx` — first use site
6. `app/[locale]/journeys/new/syllabus-chat.tsx` — threading context
7. `app/[locale]/journeys/[journeySlug]/[chapterSlug]/syllabus-change-card.tsx` — second use site

---

# Verification

1. `pnpm vitest run lib/server/syllabus/diff.test.ts` — pure unit tests
2. `pnpm lint` — Prettier + ESLint; check parity test passes (both locales have same keys)
3. `pnpm build` — TypeScript must compile
4. Manual — `/journeys/new`: watch model call `updateSyllabusDraft` twice; second call shows
   collapsed "Updated syllabus" with a caret; expand to see diff items
5. Manual — chapter chat: trigger `proposeSyllabusChange`, dismiss it; confirm it becomes
   a "Syllabus change dismissed" collapsible with the diff inside. Same for Apply.
