'use client';

import { useTranslations } from 'next-intl';

import type { Style } from '@/lib/server/styles/get';
import { cn } from '@/lib/tailwind';

/** Props for {@link StylePicker}. */
type Props = {
  /** Available style presets to display as options. */
  presets: Style[];
  /** ID of the currently selected preset. */
  value: string;
  /** Called with the new preset ID when the user selects a different style. */
  onChange: (id: string) => void;
};

/**
 * Compact row for selecting a teaching style preset — a muted label above a
 * group of toggle buttons. Used on the welcome page and in the journey sidebar.
 *
 * @param presets - Available style presets to display as options.
 * @param value - ID of the currently selected preset.
 * @param onChange - Called with the new preset ID when the user selects a different style.
 */
export function StylePicker({ presets, value, onChange }: Props) {
  const t = useTranslations('StylePicker');

  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-sm font-medium">
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
