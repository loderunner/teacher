import { getRequestConfig } from 'next-intl/server';

import { hasLocale } from './locale';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale =
    requested !== undefined && hasLocale(requested)
      ? requested
      : routing.defaultLocale;

  return {
    locale,
    messages: (
      (await import(`../messages/${locale}.json`)) as {
        default: Record<string, unknown>;
      }
    ).default,
  };
});
