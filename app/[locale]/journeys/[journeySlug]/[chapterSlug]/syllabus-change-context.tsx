'use client';

import { createContext, useContext } from 'react';

import type { Journey } from '@/lib/journeys/get';

/** State provided to {@link SyllabusChangeCard} from the chapter page. */
type SyllabusChangeContextValue = {
  /** Journey being edited. */
  journey: Journey;
  /** Current URL pathname for post-apply navigation. */
  currentPath: string;
  /** Tool call IDs of already-applied proposals. */
  appliedToolCallIds: Set<string>;
  /** Called when a proposal is successfully applied. */
  onApplied: (toolCallId: string) => void;
};

export const SyllabusChangeContext =
  createContext<SyllabusChangeContextValue | null>(null);

function assertSyllabusChangeContext(
  value: SyllabusChangeContextValue | null,
): asserts value is SyllabusChangeContextValue {
  if (value === null) {
    throw new Error(
      'useSyllabusChangeContext must be used inside SyllabusChangeContext.Provider',
    );
  }
}

/** Reads the chapter-level syllabus-change state. */
export function useSyllabusChangeContext(): SyllabusChangeContextValue {
  const value = useContext(SyllabusChangeContext);
  assertSyllabusChangeContext(value);
  return value;
}
