import { SpinnerGapIcon } from '@phosphor-icons/react';

import { cn } from '@/lib/cn';

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <SpinnerGapIcon
      aria-label="Loading"
      className={cn('size-4 animate-spin', className)}
      role="status"
      {...props}
    />
  );
}

export { Spinner };
