'use client';

import { ArrowLeftIcon } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';

export function HomeButton() {
  const pathname = usePathname();
  const t = useTranslations('TopBar');

  if (!pathname.startsWith('/journeys/')) {
    return null;
  }

  return (
    <Link
      aria-label={t('home')}
      className="flex items-center gap-1 text-sm font-medium"
      href="/"
    >
      <ArrowLeftIcon size={16} />
    </Link>
  );
}
