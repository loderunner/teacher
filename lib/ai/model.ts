import { createAnthropic } from '@ai-sdk/anthropic';

/** Gateway model used when `AI_MODEL` is not set. */
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6';

/**
 * Returns the configured AI model.
 *
 * Defaults to the Vercel AI gateway (`anthropic/claude-sonnet-4-6`).
 * Set `AI_MODEL` in the environment to override:
 * - `omlx/<model>` — routes to the local oMLX server (`OMLX_BASE_URL`)
 * - Any other value — passed through to the Vercel AI gateway
 *
 * @example
 * streamText({ model: getModel(), ... })
 */
export function getModel() {
  const modelString = process.env.AI_MODEL ?? DEFAULT_MODEL;
  if (modelString.startsWith('omlx/')) {
    const anthropic = createAnthropic({
      baseURL: process.env.OMLX_BASE_URL ?? 'http://localhost:11434/v1',
      apiKey: 'omlx',
    });
    return anthropic(modelString.slice('omlx/'.length));
  }
  return modelString;
}
