'use client';

import { useTranslations } from 'next-intl';

import { Button, buttonVariants } from '@/lib/components/ui/button';
import { Link } from '@/lib/i18n/navigation';

/** Props for {@link Error}. */
type Props = {
  /** The error that was thrown. */
  error: Error & { digest?: string };
  /** Re-renders the error boundary's children. */
  unstable_retry: () => void;
};

/** Error boundary rendered within the locale layout when a runtime error occurs. */
export default function Error({ unstable_retry }: Props) {
  const t = useTranslations('Error');

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-6 text-center">
        <p className="text-8xl font-bold">500</p>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={unstable_retry}>
            {t('tryAgain')}
          </Button>
          <Link className={buttonVariants()} href="/">
            {t('backHome')}
          </Link>
        </div>
      </div>
    </main>
  );
}
