'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/cn';
import type { Style } from '@/lib/server/styles/get';

type Props = {
  presets: Style[];
  value: string;
  onChange: (id: string) => void;
};

export function StylePicker({ presets, value, onChange }: Props) {
  const t = useTranslations('StylePicker');

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-muted-foreground">
        {t('label')}
      </span>
      <div className="flex gap-2">
        {presets.map((preset) => (
          <button
            key={preset.id}
            className={cn(
              'rounded border px-3 py-1.5 text-sm transition-colors',
              value === preset.id
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-background text-foreground hover:bg-muted',
            )}
            type="button"
            onClick={() => onChange(preset.id)}
          >
            {t(preset.id)}
          </button>
        ))}
      </div>
    </div>
  );
}
