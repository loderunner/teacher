import { z } from 'zod';

/**
 * Zod schema for UI-level chat message metadata. Ignored by the model
 * (`convertToModelMessages` reads only `role` and `parts`) but persisted so
 * reloaded history renders faithfully.
 */
export const chatMessageMetadataSchema = z.object({
  /**
   * When `true`, the message is persisted and fed to the model for context but
   * is never rendered in the transcript. Used for server-authored cues such as
   * the assistant-first `'Begin.'` opener.
   */
  hidden: z.boolean().optional(),
  /**
   * Marks a message as representing a user action rather than authored prose.
   * Rendered as a `MessageEvent` breadcrumb instead of a chat bubble. The
   * value names the action (e.g. `'syllabusChangeApplied'`) so future
   * rendering, styling, or analytics can branch on it without widening a
   * closed union.
   */
  action: z.string().optional(),
});

/** Parsed UI metadata attached to a chat message. */
export type ChatMessageMetadata = z.infer<typeof chatMessageMetadataSchema>;

/**
 * Returns whether `value` is valid {@link ChatMessageMetadata}.
 *
 * @param value - Raw {@link UIMessage.metadata} value.
 */
export function isChatMessageMetadata(
  value: unknown,
): value is ChatMessageMetadata {
  return chatMessageMetadataSchema.safeParse(value).success;
}
