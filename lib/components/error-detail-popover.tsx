import 'client-only';

import { InfoIcon } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/lib/components/ui/popover';

/** Props for {@link ErrorDetailPopover}. */
type Props = {
  /**
   * Underlying error detail to reveal (e.g. `error.message`, an HTTP status).
   * Renders nothing when omitted or empty.
   */
  detail?: string;
};

/**
 * Info-icon affordance that reveals underlying error detail in a popover,
 * next to a contextual inline error message. Opens on hover for mouse users
 * and via focus or tap for keyboard and touch users.
 *
 * @example
 * <ErrorDetailPopover detail={error.message} />
 */
export function ErrorDetailPopover({ detail }: Props) {
  const t = useTranslations('Error');

  if (detail === undefined || detail === '') {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger
        aria-label={t('detailsLabel')}
        className="text-muted-foreground hover:text-foreground inline-flex size-4 shrink-0 items-center justify-center"
        openOnHover
      >
        <InfoIcon size={14} />
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-xs text-xs">
        {detail}
      </PopoverContent>
    </Popover>
  );
}
