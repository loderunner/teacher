import { SpinnerGapIcon } from '@phosphor-icons/react';

import { cn } from '@/lib/tailwind';

/** Animated spinning icon used to indicate loading state. */
function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <output aria-label="Loading">
      <SpinnerGapIcon
        aria-hidden="true"
        className={cn('size-4 animate-spin', className)}
        {...props}
      />
    </output>
  );
}

export { Spinner };
