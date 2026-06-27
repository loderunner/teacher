import { type ReactNode } from 'react';

/** Props for {@link Button}. */
type Props = {
  /** Button content — typically an icon and label, or just a label. */
  children: ReactNode;
  /** Click handler. */
  onClick: () => void;
  /** When true, the button is non-interactive and visually de-emphasized. */
  disabled?: boolean;
};

/**
 * Brutalist black-bar action button used as the primary CTA on chat pages
 * (e.g. "Start journey", "Complete chapter"). Full width on mobile,
 * auto width on desktop.
 */
export function Button({ children, onClick, disabled }: Props) {
  return (
    <button
      className="border-foreground bg-foreground text-background flex w-full items-center justify-center gap-2 rounded border px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-40 md:w-auto"
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
