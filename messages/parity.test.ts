import { describe, expect, it } from 'vitest';

import en from './en.json';
import fr from './fr.json';

function collectKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) {
    return [prefix];
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    collectKeys(v, prefix !== '' ? `${prefix}.${k}` : k),
  );
}

describe('translation parity', () => {
  it('en.json and fr.json have the same keys', () => {
    const enKeys = collectKeys(en).sort();
    const frKeys = collectKeys(fr).sort();
    expect(frKeys).toEqual(enKeys);
  });
});
