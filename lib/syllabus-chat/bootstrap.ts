import { Output, type UIMessage, generateText } from 'ai';
import { z } from 'zod';

import type { Locale } from '@/i18n/locale';
import type { Syllabus } from '@/lib/server/syllabus/schema';

const bootstrapInstructions: Record<Locale, string> = {
  en: `You are generating metadata to initialise a new learning journey.

Given the chat transcript and syllabus draft below, output:
- title: A short, specific title for the journey (3–10 words). Reflect the actual topic and scope agreed upon — do not invent content that was not discussed.
- memory: A Markdown string summarising what you know about the learner from the conversation. Include: their stated goals, prior knowledge, gaps, pace preferences, and any other relevant context. Write in the second person ("You want to…", "You already know…"). Omit fields where nothing meaningful was said.`,
  fr: `Vous générez les métadonnées pour initialiser un nouveau parcours d'apprentissage.

À partir de la transcription du dialogue et du brouillon du syllabus ci-dessous, produisez :
- title : Un titre court et précis pour le parcours (3 à 10 mots). Reflétez le sujet et la portée réellement convenus — n'inventez pas de contenu qui n'a pas été discuté.
- memory : Une chaîne Markdown résumant ce que vous savez de l'apprenant à partir de la conversation. Incluez : ses objectifs déclarés, ses connaissances préalables, ses lacunes, ses préférences de rythme et tout autre contexte pertinent. Écrivez à la deuxième personne (« Vous souhaitez… », « Vous savez déjà… »). Omettez les informations dont il n'a pas été question.`,
};

const bootstrapSchema = z.object({
  title: z.string().min(3).max(80),
  memory: z.string(),
});

export type BootstrapJourneyInput = {
  draft: Syllabus;
  messages: UIMessage[];
  locale: Locale;
};

export type BootstrapResult = {
  title: string;
  memory: string;
};

export async function bootstrapJourney(
  input: BootstrapJourneyInput,
): Promise<BootstrapResult> {
  const { draft, messages, locale } = input;

  const transcript = messages
    .map((m) => {
      const text = m.parts
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join(' ');
      return `${m.role}: ${text}`;
    })
    .join('\n');

  const { output } = await generateText({
    model: 'anthropic/claude-sonnet-4-6',
    prompt: `${bootstrapInstructions[locale]}\n\nChat transcript:\n${transcript}\n\nSyllabus draft:\n${JSON.stringify(draft, null, 2)}`,
    output: Output.object({ schema: bootstrapSchema }),
  });

  return output;
}
