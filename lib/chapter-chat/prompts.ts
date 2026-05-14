import type { Locale } from '@/i18n/locale';
import type { Journey, JourneyChapter } from '@/lib/server/journeys/get';
import type { Style } from '@/lib/server/styles/get';

const chapterPhase: Record<Locale, string> = {
  en: `You are teaching a single chapter of an ongoing learning journey.

Stay scoped to the current chapter. If the learner asks about content from another chapter, briefly redirect them and continue teaching the current one. Use the chapter title, summary, and sections below as the source of truth for what to cover.

You have access to the full syllabus only to keep your bearings, not to wander into later chapters. Treat the syllabus as immutable — you cannot edit it.

You have a private \`updateMemory\` tool. Use it when you learn something durable about the learner (clarified goal, new gap, pace preference, confusion pattern, etc.). Always pass the FULL updated Markdown memory — this is a replacement, not a patch. Never mention the tool to the learner; the update is silent.

Extended thinking adds latency and should only be used when it will meaningfully improve answer quality. When in doubt, respond directly.`,
  fr: `Vous enseignez un seul chapitre d'un parcours d'apprentissage en cours.

Restez concentré sur le chapitre actuel. Si l'apprenant pose des questions sur le contenu d'un autre chapitre, redirigez-le brièvement et continuez à enseigner le chapitre en cours. Utilisez le titre, le résumé et les sections du chapitre ci-dessous comme référence pour ce qui doit être couvert.

Vous avez accès au syllabus complet uniquement pour vous repérer, pas pour dériver vers les chapitres suivants. Traitez le syllabus comme immuable — vous ne pouvez pas le modifier.

Vous disposez d'un outil privé \`updateMemory\`. Utilisez-le lorsque vous apprenez quelque chose de durable sur l'apprenant (objectif clarifié, lacune confirmée, préférence de rythme, schéma de confusion récurrent, etc.). Transmettez toujours la TOTALITÉ de la mémoire Markdown mise à jour — c'est un remplacement, pas une mise à jour partielle. Ne mentionnez jamais cet outil à l'apprenant ; la mise à jour est silencieuse.

La réflexion étendue ajoute de la latence et ne doit être utilisée que lorsqu'elle améliore significativement la qualité de la réponse. En cas de doute, répondez directement.`,
};

/** Parameters for composing the chapter-phase system prompt. */
export type ComposeChapterSystemPromptParams = {
  /** Teaching style whose fragment is prepended. */
  style: Style;
  /** Locale used to select the correct language variant. */
  locale: Locale;
  /** The hydrated journey (for syllabus + memory context). */
  journey: Journey;
  /** The chapter the learner is currently in. */
  chapter: JourneyChapter;
};

/**
 * Builds the system prompt for the chapter-chat phase.
 *
 * @param params - Style, locale, journey, and chapter.
 * @returns The full system prompt string.
 */
export function composeChapterSystemPrompt({
  style,
  locale,
  journey,
  chapter,
}: ComposeChapterSystemPromptParams): string {
  const styleFragment = style.systemPromptFragments[locale];
  const syllabusOutline = journey.syllabus.chapters
    .map((c, i) => `${i + 1}. ${c.title}`)
    .join('\n');
  const fullChapter = journey.syllabus.chapters[chapter.idx];
  const sections =
    fullChapter.sections !== undefined && fullChapter.sections.length > 0
      ? `\nSections:\n${fullChapter.sections.map((s) => `- ${s}`).join('\n')}`
      : '';
  const summary =
    fullChapter.summary !== undefined ? `\n\n${fullChapter.summary}` : '';

  return `${styleFragment}

${chapterPhase[locale]}

# Journey: ${journey.title}

## Syllabus
${syllabusOutline}

## Current chapter (${chapter.idx + 1} of ${journey.chapters.length})
${chapter.title}${summary}${sections}

## Learner memory
${journey.memory.trim() === '' ? '_(empty)_' : journey.memory}`;
}
