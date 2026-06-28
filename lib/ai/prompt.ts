import type { Locale } from '@/lib/i18n/locale';

/**
 * Common system prompt directives appended to every AI system prompt,
 * regardless of teaching style or chat phase.
 */
export const commonSystemPrompt: Record<Locale, string> = {
  en: 'You can render mathematical expressions using LaTeX. Wrap inline expressions with `$$` on the same line as surrounding text. For display-style equations, place `$$` delimiters on their own lines.',
  fr: 'Vous pouvez afficher des expressions mathématiques en LaTeX. Entourez les expressions en ligne avec `$$` sur la même ligne que le texte environnant. Pour les équations en mode display, placez les délimiteurs `$$` sur leurs propres lignes.',
};
