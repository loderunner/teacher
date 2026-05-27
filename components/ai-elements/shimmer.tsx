import 'client-only';

import { type MotionProps, motion } from 'motion/react';
import { type CSSProperties, memo } from 'react';

import { cn } from '@/lib/tailwind';

const motionElements = {
  a: motion.a,
  b: motion.b,
  div: motion.div,
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
  h4: motion.h4,
  li: motion.li,
  p: motion.p,
  span: motion.span,
  strong: motion.strong,
} as const;

/** HTML element tags supported by the {@link Shimmer} `as` prop. */
export type ShimmerElement = keyof typeof motionElements;

/** Props for the {@link Shimmer} animated text component. */
export type ShimmerProps = MotionProps & {
  /** Text content to animate. */
  children: string;
  /** HTML element to render. Defaults to `span`. */
  as?: ShimmerElement;
  className?: string;
  /** Animation duration in seconds. Defaults to 2. */
  duration?: number;
  /** Shimmer spread multiplier relative to text length. Defaults to 2. */
  spread?: number;
};

/**
 * Inline span that renders a left-to-right shimmer animation over text.
 * Intended for in-progress status labels.
 */
export const Shimmer = memo(
  ({
    children,
    as: tag = 'span',
    className,
    duration = 2,
    spread = 2,
    ...props
  }: ShimmerProps) => {
    const MotionComponent = motionElements[tag];
    const dynamicSpread = children.length * spread;

    return (
      <MotionComponent
        animate={{ backgroundPosition: '0% center' }}
        className={cn(
          'relative inline-block bg-size-[250%_100%,auto] bg-clip-text text-transparent',
          '[background-repeat:no-repeat,padding-box] [--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))]',
          className,
        )}
        initial={{ backgroundPosition: '100% center' }}
        style={
          {
            '--spread': `${dynamicSpread}px`,
            backgroundImage:
              'var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))',
          } as CSSProperties
        }
        transition={{
          duration,
          ease: 'linear',
          repeat: Number.POSITIVE_INFINITY,
        }}
        {...props}
      >
        {children}
      </MotionComponent>
    );
  },
);

Shimmer.displayName = 'Shimmer';
