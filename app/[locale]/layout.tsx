import { ClerkProvider } from '@clerk/nextjs';
import { frFR } from '@clerk/localizations';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';

import TopBar from '@/components/top-bar';
import { hasLocale } from '@/i18n/locale';
import { routing } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) {
    return {};
  }
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return {
    title: 'Journey',
    description: t('description'),
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) {
    notFound();
  }

  const messages = await getMessages();
  const localization = locale === 'fr' ? frFR : undefined;

  return (
    <ClerkProvider localization={localization}>
      <NextIntlClientProvider messages={messages}>
        <TopBar />
        {children}
      </NextIntlClientProvider>
    </ClerkProvider>
  );
}
