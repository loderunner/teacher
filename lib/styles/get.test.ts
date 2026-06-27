import { describe, expect, it, vi } from 'vitest';

import { getStyle, listPresets } from './get';

vi.mock('./presets', () => ({
  PRESETS: [
    {
      id: 'style-a',
      systemPromptFragments: { en: 'Fragment A EN', fr: 'Fragment A FR' },
    },
    {
      id: 'style-b',
      systemPromptFragments: { en: 'Fragment B EN', fr: 'Fragment B FR' },
    },
  ],
}));

describe('getStyle', () => {
  it('returns the matching style when the id exists', () => {
    const result = getStyle('style-a');
    expect(result).toEqual({
      id: 'style-a',
      systemPromptFragments: { en: 'Fragment A EN', fr: 'Fragment A FR' },
    });
  });

  it('returns null when the id does not exist', () => {
    const result = getStyle('nonexistent');
    expect(result).toBeNull();
  });
});

describe('listPresets', () => {
  it('returns the full array of presets', () => {
    const result = listPresets();
    expect(result).toEqual([
      {
        id: 'style-a',
        systemPromptFragments: { en: 'Fragment A EN', fr: 'Fragment A FR' },
      },
      {
        id: 'style-b',
        systemPromptFragments: { en: 'Fragment B EN', fr: 'Fragment B FR' },
      },
    ]);
  });
});
