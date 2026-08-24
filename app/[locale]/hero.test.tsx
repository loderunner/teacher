// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('client-only', () => ({}));
vi.mock('./create-draft-journey');
vi.mock('@/lib/i18n/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
}));

import { createDraftJourneyAction } from './create-draft-journey';
import { Hero } from './hero';

import { useRouter } from '@/lib/i18n/navigation';
import type { Style } from '@/lib/styles/get';

const mockCreateDraftJourneyAction = vi.mocked(createDraftJourneyAction);
const mockUseRouter = vi.mocked(useRouter);

const messages = {
  Welcome: {
    title: 'Start a Journey',
    tagline: 'What do you want to learn?',
    promptPlaceholder: 'Describe what you want to learn…',
    createJourneyError: "Couldn't start this journey.",
  },
  StylePicker: { label: 'Style', teacher: 'Teacher' },
  Error: { detailsLabel: 'Show error details' },
};

const presets: Style[] = [
  {
    id: 'teacher',
    systemPromptFragments: { en: 'teach', fr: 'enseigne' },
  },
];

const mockPush = vi.fn();

const renderHero = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Hero presets={presets} />
    </NextIntlClientProvider>,
  );

const getTextarea = (): HTMLTextAreaElement => {
  const el = screen.getByPlaceholderText(messages.Welcome.promptPlaceholder);
  if (!(el instanceof HTMLTextAreaElement)) {
    throw new TypeError('prompt input is not a textarea');
  }
  return el;
};

const submitPrompt = async (text: string) => {
  const user = userEvent.setup();
  const textarea = getTextarea();
  await user.type(textarea, text);
  await user.click(screen.getByRole('button', { name: 'Submit' }));
  return textarea;
};

describe('Hero', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error -- partial router stub; only push is exercised here.
    mockUseRouter.mockReturnValue({ push: mockPush });
  });

  afterEach(() => {
    cleanup();
  });

  it('navigates to the new journey when creation succeeds', async () => {
    mockCreateDraftJourneyAction.mockResolvedValueOnce({
      id: 'j1',
      path: '/journeys/learn-rust-abc1234567',
    });

    renderHero();
    const textarea = await submitPrompt('Teach me Rust');

    expect(mockCreateDraftJourneyAction).toHaveBeenCalledExactlyOnceWith({
      text: 'Teach me Rust',
      styleId: 'teacher',
    });
    expect(mockPush).toHaveBeenCalledExactlyOnceWith(
      '/journeys/learn-rust-abc1234567',
    );
    expect(textarea.value).toBe('');
  });

  it('keeps the prompt text and stays put when creation fails', async () => {
    mockCreateDraftJourneyAction.mockRejectedValueOnce(
      new Error('Unauthorized'),
    );

    renderHero();
    const textarea = await submitPrompt('Teach me Rust');

    expect(mockPush).not.toHaveBeenCalled();
    expect(textarea.value).toBe('Teach me Rust');
    expect(
      screen.queryByText(messages.Welcome.createJourneyError),
    ).not.toBeNull();
  });

  it('allows re-submitting the same text after a failure', async () => {
    mockCreateDraftJourneyAction
      .mockRejectedValueOnce(new Error('Unauthorized'))
      .mockResolvedValueOnce({
        id: 'j1',
        path: '/journeys/learn-rust-abc1234567',
      });

    renderHero();
    await submitPrompt('Teach me Rust');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(mockCreateDraftJourneyAction).toHaveBeenCalledTimes(2);
    expect(mockCreateDraftJourneyAction).toHaveBeenLastCalledWith({
      text: 'Teach me Rust',
      styleId: 'teacher',
    });
    expect(mockPush).toHaveBeenCalledExactlyOnceWith(
      '/journeys/learn-rust-abc1234567',
    );
  });
});
