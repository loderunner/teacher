'use client';

import type { DynamicToolUIPart } from 'ai';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Streamdown } from 'streamdown';
import { z } from 'zod';

import { applySyllabusChangeAction } from './apply-syllabus-change';
import { useSyllabusChangeContext } from './syllabus-change-context';
import { diffSyllabus } from './syllabus-diff';

import { Button } from '@/lib/components/ui/button';
import { useRouter } from '@/lib/i18n/navigation';
import { useToolPartContext } from '@/lib/chat';
import { streamdownPlugins } from '@/lib/streamdown';
import { syllabusSchema } from '@/lib/syllabus/schema';

const proposalInputSchema = z.object({
  reason: z.string(),
  newSyllabus: syllabusSchema,
});

/**
 * Inline confirmation card for a `proposeSyllabusChange` tool part.
 *
 * Reads part data from {@link useToolPartContext} and page state from
 * {@link useSyllabusChangeContext}. Renders the model's reason, a categorical
 * diff, and Apply / Dismiss buttons.
 */
export function SyllabusChangeCard() {
  const t = useTranslations('ChapterChat');
  const router = useRouter();
  const [applying, startApplying] = useTransition();
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const part = useToolPartContext<DynamicToolUIPart>();
  const { journey, currentPath, appliedToolCallIds, onApplied } =
    useSyllabusChangeContext();

  const toolCallId = part.toolCallId;
  const parsed = proposalInputSchema.safeParse(part.input);

  if (!parsed.success) {
    return null;
  }

  const proposal = parsed.data;
  const applied = appliedToolCallIds.has(toolCallId);

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
        onApplied(toolCallId);
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
      <Streamdown plugins={streamdownPlugins}>{proposal.reason}</Streamdown>
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
