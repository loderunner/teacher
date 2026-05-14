import { z } from 'zod';

const STORAGE_KEY = 'journey-chat:initial-draft';

const initialDraftPayloadSchema = z.object({
  /** The user's first message text. */
  text: z.string().min(1),
  /** Teaching style preset ID selected in the hero. */
  styleId: z.string().min(1),
});

/** Payload written by the hero and consumed by the syllabus chat on mount. */
export type InitialDraftPayload = z.infer<typeof initialDraftPayloadSchema>;

/**
 * Persists the initial draft payload to `sessionStorage` so the syllabus
 * chat page can pick it up after navigation.
 *
 * @param payload - The user's first message and chosen style ID.
 *
 * @example
 * storeInitialDraft({ text: 'Teach me Rust', styleId: 'teacher' });
 * router.push('/journeys/new');
 */
export function storeInitialDraft(payload: InitialDraftPayload): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/**
 * Reads and validates the initial draft payload from `sessionStorage`.
 * Returns `null` when running server-side, when no entry exists, or when
 * the stored value fails validation.
 *
 * **Does not remove the entry** — safe to call from a `useState` lazy
 * initializer (which React StrictMode invokes twice).
 * Call {@link clearInitialDraft} from a `useEffect` after consuming the value.
 *
 * @returns The validated payload or `null`.
 *
 * @example
 * const draft = retrieveInitialDraft();
 * const [styleId] = useState(draft?.styleId ?? 'teacher');
 */
export function retrieveInitialDraft(): InitialDraftPayload | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return null;
  }

  const result = initialDraftPayloadSchema.safeParse(JSON.parse(raw));
  return result.success ? result.data : null;
}

/**
 * Removes the initial draft entry from `sessionStorage`.
 * Call this from a `useEffect` after the payload has been consumed, so
 * a page refresh does not re-submit the first message.
 *
 * @example
 * useEffect(() => {
 *   clearInitialDraft();
 * }, []);
 */
export function clearInitialDraft(): void {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.removeItem(STORAGE_KEY);
}
