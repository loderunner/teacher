import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ErrorDetailPopover } from './error-detail-popover';

const messages = { Error: { detailsLabel: 'Show error details' } };

const renderPopover = (detail?: string) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ErrorDetailPopover detail={detail} />
    </NextIntlClientProvider>,
  );

describe('ErrorDetailPopover', () => {
  it('renders a trigger button with the localized aria-label when detail is provided', () => {
    const html = renderPopover('500 Internal Server Error');

    expect(html).toContain('<button');
    expect(html).toContain('aria-label="Show error details"');
  });

  it('renders nothing when detail is undefined', () => {
    expect(renderPopover(undefined)).toBe('');
  });

  it('renders nothing when detail is an empty string', () => {
    expect(renderPopover('')).toBe('');
  });
});
