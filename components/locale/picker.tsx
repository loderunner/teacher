'use client';

import { TranslateIcon } from '@phosphor-icons/react';
import { useLocale } from 'next-intl';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { parseLocale } from '@/i18n/locale';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

const localeLabels: Record<string, string> = {
  en: '🇬🇧 English',
  fr: '🇫🇷 Français',
};

/** Dropdown selector for the app locale. */
export function LocalePicker() {
  const locale = parseLocale(useLocale());
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = (next: string) => {
    const nextLocale = parseLocale(next);
    router.replace(pathname, { locale: nextLocale });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Select language"
        className="hover:bg-accent focus-visible:ring-ring inline-flex size-9 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:ring-1 focus-visible:outline-none"
      >
        <TranslateIcon className="size-4" weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {routing.locales.map((l) => (
          <DropdownMenuItem
            key={l}
            aria-current={l === locale ? 'true' : undefined}
            onClick={() => switchLocale(l)}
          >
            {localeLabels[l] ?? l}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
