'use client';

import { CompassIcon } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { createDraftJourneyAction } from './create-draft-journey';

import {
  PromptInput,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/lib/components/ai-elements/prompt-input';
import { StylePicker } from '@/lib/components/journey';
import { useRouter } from '@/lib/i18n/navigation';
import type { Style } from '@/lib/styles/get';

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

  const handleSubmit = async ({ text }: PromptInputMessage): Promise<void> => {
    if (text.trim() === '') {
      return;
    }
    setSubmitting(true);
    const result = await createDraftJourneyAction({ text, styleId });
    router.push(result.path);
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
