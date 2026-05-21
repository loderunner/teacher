'use client';

import { createMathPlugin } from '@streamdown/math';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Streamdown } from 'streamdown';

import { applySyllabusChangeAction } from './apply-syllabus-change';
import { diffSyllabus } from './syllabus-diff';

import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import type { Journey } from '@/lib/server/journeys/get';
import type { Syllabus } from '@/lib/server/syllabus/schema';

const math = createMathPlugin({ singleDollarTextMath: true });

/** Props for {@link SyllabusChangeCard}. */
export type SyllabusChangeCardProps = {
  /** Stable ID of the tool call that produced this proposal. */
  toolCallId: string;
  /** The current journey, used for diff computation and the apply call. */
  journey: Journey;
  /** Current URL pathname, used to decide push vs. refresh after apply. */
  currentPath: string;
  /** The model's proposal: a reason and the full new syllabus. */
  proposal: { reason: string; newSyllabus: Syllabus };
  /** Whether the proposal has already been applied. */
  applied: boolean;
  /** Called when the apply action succeeds, before router navigation. */
  onApplied: () => void;
};

/**
 * Inline confirmation card for a `proposeSyllabusChange` tool part.
 *
 * Renders the model's reason, a categorical diff, and Apply / Dismiss
 * buttons. Dismissed state is managed locally; it resets when the card
 * unmounts (i.e. on page navigation or refresh), which is acceptable
 * since the chat history is also ephemeral until Story 5.
 *
 * @param props - Journey, current path, and proposal.
 */
export function SyllabusChangeCard({
  journey,
  currentPath,
  proposal,
  applied,
  onApplied,
}: SyllabusChangeCardProps) {
  const t = useTranslations('ChapterChat');
  const router = useRouter();
  const [applying, startApplying] = useTransition();
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (dismissed) {
    return (
      <div className="text-muted-foreground mt-2 text-sm italic">
        {t('proposalDismissed')}
      </div>
    );
  }

  if (applied) {
    return (
      <div className="text-muted-foreground mt-2 text-sm italic">
        {t('proposalApplied')}
      </div>
    );
  }

  const diff = diffSyllabus(journey, proposal.newSyllabus);

  const handleApply = () => {
    setError(null);
    startApplying(async () => {
      try {
        const result = await applySyllabusChangeAction({
          journeyId: journey.id,
          newSyllabus: proposal.newSyllabus,
        });
        onApplied();
        if (result.chapterPath !== currentPath) {
          router.push(result.chapterPath);
        } else {
          router.refresh();
        }
      } catch {
        setError(t('proposalApplyError'));
      }
    });
  };

  return (
    <div className="mt-3 flex flex-col gap-3 rounded border p-3">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {t('proposalReasonHeader')}
      </p>
      <Streamdown plugins={{ math }}>{proposal.reason}</Streamdown>
      <ul className="flex flex-col gap-1 text-sm">
        {diff.added.length > 0 && (
          <li>{t('proposalAdded', { titles: diff.added.join(', ') })}</li>
        )}
        {diff.removed.length > 0 && (
          <li>{t('proposalRemoved', { titles: diff.removed.join(', ') })}</li>
        )}
        {diff.renamed.map((r) => (
          <li key={r.oldTitle}>
            {t('proposalRenamed', {
              oldTitle: r.oldTitle,
              newTitle: r.newTitle,
            })}
          </li>
        ))}
        {diff.reordered && <li>{t('proposalReordered')}</li>}
      </ul>
      <div className="flex gap-2">
        <Button disabled={applying} type="button" onClick={handleApply}>
          {t('proposalApply')}
        </Button>
        <Button
          disabled={applying}
          type="button"
          variant="outline"
          onClick={() => setDismissed(true)}
        >
          {t('proposalDismiss')}
        </Button>
      </div>
      {error !== null && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
