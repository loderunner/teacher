'use client';

import Link from 'next/link';

import './globals.css';

/** Props for {@link GlobalError}. */
type Props = {
  /** The error that was thrown in the root layout. */
  error: Error & { digest?: string };
  /** Re-renders the error boundary's children. */
  unstable_retry: () => void;
};

/**
 * Global error boundary — catches errors in the root layout.
 * Must render its own HTML document since it replaces the root layout.
 */
export default function GlobalError({ unstable_retry }: Props) {
  return (
    <html lang="en">
      <body className="flex h-full flex-col items-center justify-center gap-6 p-6 text-center">
        <p className="text-8xl font-bold">500</p>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-muted-foreground">
            An unexpected error occurred. Please try again.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="border-border bg-background hover:bg-muted inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-sm font-medium transition-colors"
            type="button"
            onClick={unstable_retry}
          >
            Try again
          </button>
          <Link
            className="bg-primary text-primary-foreground hover:bg-primary/80 inline-flex h-8 items-center justify-center rounded-lg px-2.5 text-sm font-medium transition-colors"
            href="/"
          >
            Back to home
          </Link>
        </div>
      </body>
    </html>
  );
}
