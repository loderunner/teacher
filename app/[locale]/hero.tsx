'use client';

import { CompassIcon } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  PromptInput,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/lib/components/ai-elements/prompt-input';
import { ErrorDetailPopover } from '@/lib/components/error-detail-popover';
import { StylePicker } from '@/lib/components/journey';
import { useRouter } from '@/lib/i18n/navigation';
import type { Style } from '@/lib/styles/get';

import { createDraftJourneyAction } from './create-draft-journey';

/** Props for {@link Hero}. */
type Props = {
  /** Available teaching style presets for the style picker. */
  presets: Style[];
};

/**
 * Landing hero: title, tagline, compass, style picker, and prompt input.
 * Submitting creates a draft journey server-side and navigates to its page,
 * where the syllabus chat resumes from the database.
 */
export function Hero({ presets }: Props) {
  const t = useTranslations('Welcome');
  const router = useRouter();

  const defaultStyleId = presets.length > 0 ? presets[0].id : 'teacher';
  const [styleId, setStyleId] = useState(defaultStyleId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleSubmit = async ({ text }: PromptInputMessage): Promise<void> => {
    if (text.trim() === '') {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createDraftJourneyAction({ text, styleId });
      router.push(result.path);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setSubmitting(false);
      // PromptInput clears its text when onSubmit resolves, so rethrowing
      // keeps the prompt available for a retry.
      throw err;
    }
  };

  return (
    <div className="flex w-full flex-1 flex-col px-4 pt-[6vh] sm:pt-[12vh]">
      <div className="mb-8 flex flex-col items-center gap-4 text-center sm:mb-10">
        <CompassIcon className="size-14 sm:size-16" weight="bold" />
        <h1 className="font-heading text-5xl font-black tracking-tight sm:text-7xl">
          {t('title')}
        </h1>
        <p className="text-muted-foreground text-lg sm:text-xl">
          {t('tagline')}
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col">
        <PromptInputProvider>
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputTextarea
              disabled={submitting}
              placeholder={t('promptPlaceholder')}
            />
            <PromptInputFooter>
              <div />
              <PromptInputSubmit status={submitting ? 'submitted' : 'ready'} />
            </PromptInputFooter>
          </PromptInput>
        </PromptInputProvider>

        {error !== null && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <p className="text-destructive">{t('createJourneyError')}</p>
            <ErrorDetailPopover detail={error.message} />
          </div>
        )}

        <div className="mt-3">
          <StylePicker
            presets={presets}
            value={styleId}
            onChange={setStyleId}
          />
        </div>
      </div>
    </div>
  );
}
