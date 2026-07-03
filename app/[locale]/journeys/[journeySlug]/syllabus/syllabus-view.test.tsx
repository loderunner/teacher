import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

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
  JourneyChatViewIsland: () => null,
}));

vi.mock('@/lib/components/chat-page', () => ({
  ChatPageShell: {
    Root: 'chat-page-root',
    Content: 'chat-page-content',
    Header: 'chat-page-header',
    Sidebar: 'chat-page-sidebar',
  },
  Title: 'title',
}));

vi.mock('@/lib/components/journey', () => ({
  SyllabusPanel: 'syllabus-panel',
  StyleLabel: 'style-label',
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

const asChildren = (element: ReactElement): ReactElement[] => {
  const { children } = element.props as { children: unknown };
  return Array.isArray(children)
    ? (children as ReactElement[])
    : [children as ReactElement];
};

const findByType = (elements: ReactElement[], type: string): ReactElement[] =>
  elements.filter((el) => el.type === type);

describe('SyllabusView', () => {
  it('renders both the activated sidebar panel and the draft content panel', async () => {
    const root = (await SyllabusView({
      journey: baseJourney,
      messages: [],
      locale: 'en',
    })) as ReactElement;

    const [content, sidebar] = asChildren(root);
    const [draftPanel] = findByType(asChildren(content), 'syllabus-panel');
    const [activatedPanel] = findByType(asChildren(sidebar), 'syllabus-panel');

    expect(draftPanel.props).toEqual({
      draft: baseJourney.syllabus,
      mode: 'draft',
    });
    expect(activatedPanel.props).toEqual({
      current: { type: 'syllabus' },
      journey: baseJourney,
      mode: 'activated',
    });
  });

  it('renders the resulting syllabus header', async () => {
    const root = (await SyllabusView({
      journey: baseJourney,
      messages: [],
      locale: 'en',
    })) as ReactElement;

    const [content] = asChildren(root);
    const headers = findByType(asChildren(content), 'chat-page-header');
    const titles = headers.map(
      (header) => asChildren(header)[0].props as { children: string },
    );

    expect(titles.map((title) => title.children)).toEqual([
      'Syllabus chat',
      'Resulting syllabus',
    ]);
  });

  it('passes a null syllabus through to the draft panel without throwing', async () => {
    const journey: Journey = { ...baseJourney, syllabus: null };

    const root = (await SyllabusView({
      journey,
      messages: [],
      locale: 'en',
    })) as ReactElement;

    const [content] = asChildren(root);
    const [draftPanel] = findByType(asChildren(content), 'syllabus-panel');

    expect(draftPanel.props).toEqual({ draft: null, mode: 'draft' });
  });
});
