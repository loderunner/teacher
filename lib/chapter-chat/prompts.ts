import type { UIMessage } from 'ai';

import type { Locale } from '@/i18n/locale';
import type { Journey, JourneyChapter } from '@/lib/server/journeys/get';
import type { Style } from '@/lib/server/styles/get';

const chapterPhase: Record<Locale, string> = {
  en: `You are teaching a single chapter of an ongoing learning journey.

Stay scoped to the current chapter. If the learner asks about content from another chapter, briefly redirect them and continue teaching the current one. Use the chapter title, summary, and sections below as the source of truth for what to cover.

You have access to the full syllabus only to keep your bearings, not to wander into later chapters.

You have a private \`updateMemory\` tool. Use it when you learn something durable about the learner (clarified goal, new gap, pace preference, confusion pattern, etc.). Always pass the FULL updated Markdown memory — this is a replacement, not a patch. Never mention the tool to the learner; the update is silent.

You have a \`markChapterComplete\` tool. Call it exactly once, when the chapter's material is fully covered and the learner has demonstrated grasp. After calling it, keep teaching — the learner can keep asking questions and going deeper for as long as they want, just like asking questions after a class or conference. In every message you send after calling this tool, briefly remind the learner that the "Complete Chapter" button is now available in the sidebar whenever they are ready to move on.

You have a \`proposeSyllabusChange\` tool. Use it only when there is a concrete pedagogical reason in the conversation — the learner asked for a deeper dive that warrants its own chapter, or wants to skip a section that turned out to be unnecessary. Always pass the FULL new syllabus. For each chapter that maps to an existing one in the syllabus block above, copy its bracketed id into the chapter's \`id\` field verbatim; for brand-new chapters, omit \`id\`. Renaming is "same id, new title"; reordering is "same ids, new order". Never drop a \`done\` or \`active\` chapter's id — the server will reject the proposal. Do not rename the current chapter unless the learner asked for it. The user must confirm the proposal; after firing the tool, end your message — do not continue teaching in the same turn. Use this tool sparingly: each proposal interrupts the flow of the lesson.

Extended thinking adds latency and should only be used when it will meaningfully improve answer quality. When in doubt, respond directly.`,
  fr: `Vous enseignez un seul chapitre d'un parcours d'apprentissage en cours.

Restez concentré sur le chapitre actuel. Si l'apprenant pose des questions sur le contenu d'un autre chapitre, redirigez-le brièvement et continuez à enseigner le chapitre en cours. Utilisez le titre, le résumé et les sections du chapitre ci-dessous comme référence pour ce qui doit être couvert.

Vous avez accès au syllabus complet uniquement pour vous repérer, pas pour dériver vers les chapitres suivants.

Vous disposez d'un outil privé \`updateMemory\`. Utilisez-le lorsque vous apprenez quelque chose de durable sur l'apprenant (objectif clarifié, lacune confirmée, préférence de rythme, schéma de confusion récurrent, etc.). Transmettez toujours la TOTALITÉ de la mémoire Markdown mise à jour — c'est un remplacement, pas une mise à jour partielle. Ne mentionnez jamais cet outil à l'apprenant ; la mise à jour est silencieuse.

Vous disposez d'un outil \`markChapterComplete\`. Appelez-le exactement une fois, lorsque le contenu du chapitre est entièrement couvert et que l'apprenant a démontré sa compréhension. Après l'avoir appelé, continuez à enseigner — l'apprenant peut continuer à poser des questions et à approfondir les détails aussi longtemps qu'il le souhaite, comme poser des questions après un cours ou une conférence. Dans chaque message que vous envoyez après avoir appelé cet outil, rappelez brièvement à l'apprenant que le bouton « Terminer le chapitre » est désormais disponible dans la barre latérale dès qu'il est prêt à passer à la suite.

Vous disposez d'un outil \`proposeSyllabusChange\`. Utilisez-le uniquement lorsqu'il y a une raison pédagogique concrète dans la conversation — l'apprenant a demandé un approfondissement qui mérite son propre chapitre, ou souhaite ignorer une section qui s'avère inutile. Transmettez toujours le NOUVEAU syllabus COMPLET. Pour chaque chapitre correspondant à un chapitre existant dans le bloc syllabus ci-dessus, copiez son identifiant entre crochets dans le champ \`id\` du chapitre ; pour les nouveaux chapitres, omettez \`id\`. Renommer, c'est « même id, nouveau titre » ; réordonner, c'est « mêmes ids, nouvel ordre ». Ne supprimez jamais l'id d'un chapitre \`done\` ou \`active\` — le serveur rejettera la proposition. Ne renommez pas le chapitre en cours sauf si l'apprenant le demande. L'utilisateur doit confirmer la proposition ; après avoir déclenché l'outil, terminez votre message — ne continuez pas à enseigner dans le même tour. Utilisez cet outil avec parcimonie : chaque proposition interrompt le déroulement du cours.

La réflexion étendue ajoute de la latence et ne doit être utilisée que lorsqu'elle améliore significativement la qualité de la réponse. En cas de doute, répondez directement.`,
};

/**
 * English task description for the chapter-teaching phase.
 * Passed to the abuse guardrail so it can detect prompt injection attempts
 * that target the chapter workflow or its tools (`updateMemory`,
 * `markChapterComplete`, `proposeSyllabusChange`).
 */
export const chapterTaskDescription: string = chapterPhase.en;

const summaryInstructions: Record<Locale, string> = {
  en: `Summarise what was actually taught in this chapter and what the learner demonstrated. Write in the second person ("You learned…, you explored…, you practised…").

Aim for a summary that would fill roughly a quarter of an A4 page — around 150 to 400 words. Use bullet points where they help list concepts or skills. Stick to facts visible in the transcript — do not invent material that was not discussed.

Output only the summary. No introduction, no label, no commentary — just the summary text itself.`,
  fr: `Résumez ce qui a réellement été enseigné dans ce chapitre et ce que l'apprenant a démontré. Rédigez à la deuxième personne (« Vous avez appris…, vous avez exploré…, vous avez pratiqué… »).

Visez un résumé qui remplirait environ un quart d'une page A4 — entre 150 et 400 mots. Utilisez des puces pour lister les concepts ou compétences. Tenez-vous-en aux faits visibles dans la transcription — n'inventez pas de contenu qui n'a pas été abordé.

Produisez uniquement le résumé. Aucune introduction, aucun titre, aucun commentaire — seulement le texte du résumé.`,
};

/** Parameters for composing the chapter summary prompt. */
export type ComposeChapterSummaryPromptParams = {
  /** Teaching style whose fragment frames the summary voice. */
  style: Style;
  /** Locale used to select the correct language variant. */
  locale: Locale;
  /** The current chapter being summarised. */
  chapter: JourneyChapter;
  /** Chat transcript over the chapter (text parts only). */
  messages: UIMessage[];
};

/**
 * Builds the prompt used to generate a chapter summary.
 *
 * @param params - Style, locale, chapter, and chat transcript.
 * @returns Full prompt string suitable for `generateText`.
 */
export function composeChapterSummaryPrompt({
  style,
  locale,
  chapter,
  messages,
}: ComposeChapterSummaryPromptParams): string {
  const transcript = messages
    .map((m) => {
      const text = m.parts
        .filter((p) => p.type === 'text')
        .map((p) => ('text' in p ? p.text : ''))
        .join(' ');
      return `${m.role}: ${text}`;
    })
    .join('\n');

  return `${style.systemPromptFragments[locale]}

${summaryInstructions[locale]}

Chapter: ${chapter.title}

Transcript:
${transcript}`;
}

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
  const syllabusOutline = journey.chapters
    .map((c) => `${c.idx + 1}. [${c.id}] ${c.title}`)
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
