import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind CSS class names, resolving conflicts with `tailwind-merge`.
 *
 * @param inputs - Any combination of class values accepted by `clsx`.
 * @returns A single deduplicated, conflict-free class string.
 *
 * @example
 * cn('px-2 py-1', condition && 'bg-blue-500', 'px-4') // 'py-1 bg-blue-500 px-4'
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
