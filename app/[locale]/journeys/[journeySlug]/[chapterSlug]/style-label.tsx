import { useTranslations } from 'next-intl';

import { getStyle } from '@/lib/server/styles/get';

/** Props for {@link StyleLabel}. */
type Props = {
  /** ID of the teaching style preset to display. */
  styleId: string;
};

/** Read-only display of the journey's teaching style. */
export function StyleLabel({ styleId }: Props) {
  const t = useTranslations('StylePicker');
  const style = getStyle(styleId);
  if (style === null) {return null;}

  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-sm font-medium">
        {t('label')}
      </span>
      <span className="text-sm">{t(style.id)}</span>
    </div>
  );
}
