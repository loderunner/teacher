import type { Locale } from '@/i18n/locale';
import type { Style } from '@/lib/server/styles/get';

const syllabusPhase: Record<Locale, string> = {
  en: `You are co-authoring a Syllabus for a Journey with the user.

Use the \`updateSyllabusDraft\` tool every time the draft should change — pass the entire new draft each time. Never describe the draft in prose; always use the tool.

Your most recent \`updateSyllabusDraft\` call holds the current draft. If you have not called the tool yet in this conversation, the draft is empty.

When the draft has at least one chapter and the user signals readiness, suggest they click "Start journey" — do not call any "start" tool yourself.`,
  fr: `Vous co-rédigez un Syllabus pour un Parcours avec l'utilisateur.

Utilisez l'outil \`updateSyllabusDraft\` chaque fois que le brouillon doit changer — transmettez à chaque fois l'intégralité du nouveau brouillon. Ne décrivez jamais le brouillon en prose ; utilisez toujours l'outil.

Votre dernier appel à \`updateSyllabusDraft\` contient le brouillon actuel. Si vous n'avez pas encore appelé l'outil dans cette conversation, le brouillon est vide.

Lorsque le brouillon contient au moins un chapitre et que l'utilisateur signale qu'il est prêt, suggérez-lui de cliquer sur « Commencer le parcours » — n'appelez aucun outil de démarrage vous-même.`,
};

/** Parameters for composing the syllabus-phase system prompt. */
export type ComposeSyllabusSystemPromptParams = {
  /** Teaching style whose fragment is prepended to the prompt. */
  style: Style;
  /** Locale used to select the correct language variant. */
  locale: Locale;
};

/**
 * Combines the style's system prompt fragment with the syllabus-phase instructions.
 *
 * @param params - Style and locale.
 * @returns The full system prompt string for the syllabus chat.
 */
export function composeSyllabusSystemPrompt({
  style,
  locale,
}: ComposeSyllabusSystemPromptParams): string {
  const fragment = style.systemPromptFragments[locale];
  return `${fragment}\n\n${syllabusPhase[locale]}`;
}
