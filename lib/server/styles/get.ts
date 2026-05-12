import { PRESETS } from './presets';

import type { Locale } from '@/i18n/locale';

export type Style = {
  id: string;
  systemPromptFragments: Record<Locale, string>;
};

const PRESET_MAP = new Map(PRESETS.map((p) => [p.id, p]));

export function getStyle(id: string): Style | null {
  return PRESET_MAP.get(id) ?? null;
}

export function listPresets(): Style[] {
  return PRESETS;
}
