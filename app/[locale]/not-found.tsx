import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

/** 404 page rendered within the locale layout when notFound() is called. */
export default async function NotFound() {
  const t = await getTranslations('NotFound');

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-6 text-center">
        <p className="text-8xl font-bold">404</p>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Link className={buttonVariants({ variant: 'outline' })} href="/">
          {t('backHome')}
        </Link>
      </div>
    </main>
  );
}
