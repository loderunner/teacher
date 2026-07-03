// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SyllabusView } from './syllabus-view';

import type { Journey } from '@/lib/journeys/get';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => {
    const messages: Record<string, string> = {
      header: 'Syllabus chat',
      resultingHeader: 'Resulting syllabus',
    };
    return (key: string) => messages[key] ?? key;
  }),
}));

vi.mock('./journey-chat-view-island', () => ({
  JourneyChatViewIsland: () => <div data-testid="chat-view-island" />,
}));

vi.mock('@/lib/components/chat-page', () => ({
  ChatPageShell: {
    Root: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    Content: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    Header: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    Sidebar: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  },
  Title: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock('@/lib/components/journey', () => ({
  SyllabusPanel: (props: { mode: string }) => (
    <div data-testid={`syllabus-panel-${props.mode}`}>
      {JSON.stringify(props)}
    </div>
  ),
  StyleLabel: () => <div data-testid="style-label" />,
}));

const baseJourney: Journey = {
  id: 'journey-1',
  title: 'My journey',
  styleId: 'style-1',
  memory: [],
  status: 'active',
  syllabus: {
    chapters: [
      {
        id: 'chapter-1',
        title: 'Chapter 1',
        summary: 'Summary',
        sections: ['Section 1'],
      },
    ],
  },
  chapters: [],
};

describe('SyllabusView', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders both the activated sidebar panel and the draft content panel', async () => {
    const element = await SyllabusView({
      journey: baseJourney,
      messages: [],
      locale: 'en',
    });
    render(element);

    const activatedPanel = screen.getByTestId('syllabus-panel-activated');
    expect(activatedPanel).toBeInTheDocument();

    const draftPanel = screen.getByTestId('syllabus-panel-draft');
    expect(draftPanel).toBeInTheDocument();
    expect(draftPanel.textContent).toContain(
      JSON.stringify(baseJourney.syllabus),
    );
  });

  it('renders the resulting syllabus header', async () => {
    const element = await SyllabusView({
      journey: baseJourney,
      messages: [],
      locale: 'en',
    });
    render(element);

    expect(screen.getByText('Resulting syllabus')).toBeInTheDocument();
  });

  it('passes a null syllabus through to the draft panel without throwing', async () => {
    const journey: Journey = { ...baseJourney, syllabus: null };

    const element = await SyllabusView({
      journey,
      messages: [],
      locale: 'en',
    });
    render(element);

    const draftPanel = screen.getByTestId('syllabus-panel-draft');
    expect(draftPanel.textContent).toContain('"draft":null');
  });
});
