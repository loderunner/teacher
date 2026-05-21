import { createOllama } from 'ollama-ai-provider-v2';

/** Gateway model used when `AI_MODEL` is not set. */
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6';

/**
 * Returns the configured AI model.
 *
 * Defaults to the Vercel AI gateway (`anthropic/claude-sonnet-4-6`).
 * Set `AI_MODEL` in the environment to override:
 * - `ollama/<model>` — routes to the local Ollama server (`OLLAMA_BASE_URL`)
 * - Any other value — passed through to the Vercel AI gateway
 *
 * @example
 * streamText({ model: getModel(), ... })
 */
export function getModel() {
  const modelString = process.env.AI_MODEL ?? DEFAULT_MODEL;
  if (modelString.startsWith('ollama/')) {
    const ollama = createOllama({
      baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api',
    });
    return ollama(modelString.slice('ollama/'.length));
  }
  return modelString;
}
