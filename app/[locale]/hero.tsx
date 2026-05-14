'use client';

import { CompassIcon } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  PromptInput,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';
import { StylePicker } from '@/components/style-picker';
import { useRouter } from '@/i18n/navigation';
import { storeInitialDraft } from '@/lib/journey-chat';
import type { Style } from '@/lib/server/styles/get';

/** Props for {@link Hero}. */
type Props = {
  /** Available teaching style presets for the style picker. */
  presets: Style[];
};

/**
 * Landing hero: title, tagline, compass, style picker, and prompt input.
 * On submit, serializes `{ text, styleId }` to sessionStorage and navigates
 * to the syllabus chat page.
 */
export function Hero({ presets }: Props) {
  const t = useTranslations('Welcome');
  const router = useRouter();

  const defaultStyleId = presets.length > 0 ? presets[0].id : 'teacher';
  const [styleId, setStyleId] = useState(defaultStyleId);

  const handleSubmit = ({ text }: PromptInputMessage) => {
    if (text.trim() === '') {
      return;
    }
    storeInitialDraft({ text, styleId });
    router.push('/journeys/new');
  };

  return (
    <div className="flex w-full flex-1 flex-col pt-[12vh]">
      <div className="mb-10 flex flex-col items-center gap-4 text-center">
        <CompassIcon className="size-16" weight="bold" />
        <h1 className="font-heading text-7xl font-black tracking-tight">
          {t('title')}
        </h1>
        <p className="text-muted-foreground text-xl">{t('tagline')}</p>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea placeholder={t('promptPlaceholder')} />
          <PromptInputFooter>
            <div />
            <PromptInputSubmit status="ready" />
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
