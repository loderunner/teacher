import * as nextIntl from 'next-intl';

import { routing } from './routing';

export type Locale = (typeof routing.locales)[number];

/**
 * Returns whether `value` is one of the locales configured in {@link routing}.
 *
 * @example
 * if (isLocale(segment)) {
 *   setLocale(segment);
 * }
 */
export function hasLocale(value: string): value is Locale {
  return nextIntl.hasLocale(routing.locales, value);
}

/**
 * Narrows a string to {@link Locale}, or throws if it is not configured.
 * Use at boundaries where next-intl APIs return `string` but the app only
 * supports {@link routing.locales}.
 *
 * @param value - Typically from `getLocale()` or `useLocale()`.
 * @returns The same string narrowed to `Locale`.
 * @throws Error when `value` is not a configured locale.
 */
export function parseLocale(value: string): Locale {
  if (!hasLocale(value)) {
    throw new Error(`Invalid locale: ${JSON.stringify(value)}`);
  }
  return value;
}
