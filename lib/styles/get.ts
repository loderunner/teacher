import { PRESETS } from './presets';

import type { Locale } from '@/i18n/locale';

/** A teaching style preset with per-locale system prompt fragments. */
export type Style = {
  /** Unique style identifier, e.g. `"teacher"` or `"tutorial"`. */
  id: string;
  /** Per-locale fragments injected into the AI system prompt. */
  systemPromptFragments: Record<Locale, string>;
};

const PRESET_MAP = new Map(PRESETS.map((p) => [p.id, p]));

/**
 * Returns the style preset with the given ID, or `null` if it does not exist.
 *
 * @param id - Style preset ID.
 */
export function getStyle(id: string): Style | null {
  return PRESET_MAP.get(id) ?? null;
}

/**
 * Returns all available style presets.
 *
 * @returns An array of all built-in style presets.
 */
export function listPresets(): Style[] {
  return PRESETS;
}
