'use client';

import { BrainIcon, CaretDownIcon } from '@phosphor-icons/react';
import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import {
  type ComponentProps,
  type ReactNode,
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Streamdown } from 'streamdown';

import { Shimmer } from './shimmer';

const useControllableState = <T,>({
  defaultProp,
  prop,
  onChange,
}: {
  defaultProp: T;
  prop?: T;
  onChange?: (value: T) => void;
}): [T, (value: T) => void] => {
  const [internal, setInternal] = useState<T>(defaultProp);
  const controlled = prop !== undefined;
  const value = controlled ? prop : internal;

  const setValue = useCallback(
    (next: T) => {
      if (!controlled) {
        setInternal(next);
      }
      onChange?.(next);
    },
    [controlled, onChange],
  );

  return [value, setValue];
};

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/tailwind';

interface ReasoningContextValue {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number | undefined;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

/** Returns context for the nearest {@link Reasoning} ancestor. */
export const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (context === null) {
    throw new Error('Reasoning components must be used within Reasoning');
  }
  return context;
};

/** Props for the {@link Reasoning} collapsible container. */
export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  /** Whether the model is currently streaming reasoning. Controls auto-open/close behavior. */
  isStreaming?: boolean;
  /** Controlled open state. */
  open?: boolean;
  /** Initial open state. Defaults to `isStreaming`. */
  defaultOpen?: boolean;
  /** Called when the open state changes. */
  onOpenChange?: (open: boolean) => void;
  /** Elapsed thinking duration in seconds; shown in the trigger label. */
  duration?: number;
};

const AUTO_CLOSE_DELAY = 1000;
const MS_IN_S = 1000;

/**
 * Collapsible wrapper for model reasoning content. Auto-opens while streaming
 * and auto-closes 1 second after streaming ends. User can re-expand at any time.
 */
export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    open,
    defaultOpen,
    onOpenChange,
    duration: durationProp,
    children,
    ...props
  }: ReasoningProps) => {
    const resolvedDefaultOpen = defaultOpen ?? isStreaming;
    const isExplicitlyClosed = defaultOpen === false;

    const [isOpen, setIsOpen] = useControllableState<boolean>({
      defaultProp: resolvedDefaultOpen,
      onChange: onOpenChange,
      prop: open,
    });
    const [duration, setDuration] = useControllableState<number | undefined>({
      defaultProp: undefined,
      prop: durationProp,
    });

    const hasEverStreamedRef = useRef(isStreaming);
    const [hasAutoClosed, setHasAutoClosed] = useState(false);
    const startTimeRef = useRef<number | null>(null);

    useEffect(() => {
      if (isStreaming) {
        hasEverStreamedRef.current = true;
        startTimeRef.current ??= Date.now();
      } else if (startTimeRef.current !== null) {
        setDuration(Math.ceil((Date.now() - startTimeRef.current) / MS_IN_S));
        startTimeRef.current = null;
      }
    }, [isStreaming, setDuration]);

    useEffect(() => {
      if (isStreaming && !isOpen && !isExplicitlyClosed) {
        setIsOpen(true);
      }
    }, [isStreaming, isOpen, setIsOpen, isExplicitlyClosed]);

    useEffect(() => {
      if (
        hasEverStreamedRef.current &&
        !isStreaming &&
        isOpen &&
        !hasAutoClosed
      ) {
        const timer = setTimeout(() => {
          setIsOpen(false);
          setHasAutoClosed(true);
        }, AUTO_CLOSE_DELAY);

        return () => clearTimeout(timer);
      }
    }, [isStreaming, isOpen, setIsOpen, hasAutoClosed]);

    const handleOpenChange = useCallback(
      (newOpen: boolean) => {
        setIsOpen(newOpen);
      },
      [setIsOpen],
    );

    const contextValue = useMemo(
      () => ({ duration, isOpen: isOpen === true, isStreaming, setIsOpen }),
      [duration, isOpen, isStreaming, setIsOpen],
    );

    return (
      <ReasoningContext.Provider value={contextValue}>
        <Collapsible
          className={cn('not-prose mb-2', className)}
          open={isOpen}
          onOpenChange={handleOpenChange}
          {...props}
        >
          {children}
        </Collapsible>
      </ReasoningContext.Provider>
    );
  },
);

/** Props for the {@link ReasoningTrigger} toggle button. */
export type ReasoningTriggerProps = ComponentProps<
  typeof CollapsibleTrigger
> & {
  /**
   * Returns the label shown in the trigger.
   *
   * @param isStreaming Whether reasoning is actively streaming.
   * @param duration Elapsed time in seconds, if known.
   */
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

const defaultGetThinkingMessage = (isStreaming: boolean, duration?: number) => {
  if (isStreaming || duration === 0) {
    return <Shimmer duration={1}>Thinking...</Shimmer>;
  }
  if (duration === undefined) {
    return <p>Thought for a few seconds</p>;
  }
  return <p>Thought for {duration} seconds</p>;
};

/** Toggle button showing the thinking status label and a caret icon. */
export const ReasoningTrigger = memo(
  ({
    className,
    children,
    getThinkingMessage = defaultGetThinkingMessage,
    ...props
  }: ReasoningTriggerProps) => {
    const { isStreaming, isOpen, duration } = useReasoning();

    return (
      <CollapsibleTrigger
        className={cn(
          'text-muted-foreground hover:text-foreground flex w-full items-center gap-2 text-sm transition-colors',
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            <BrainIcon size={16} />
            {getThinkingMessage(isStreaming, duration)}
            <CaretDownIcon
              className={cn(
                'transition-transform',
                isOpen ? 'rotate-180' : 'rotate-0',
              )}
              size={16}
            />
          </>
        )}
      </CollapsibleTrigger>
    );
  },
);

/** Props for the {@link ReasoningContent} panel. */
export type ReasoningContentProps = ComponentProps<
  typeof CollapsibleContent
> & {
  /** The reasoning text to display. */
  children: string;
};

const streamdownPlugins = { cjk, code, math, mermaid };

/** Scrollable panel that renders the model's reasoning text as markdown. */
export const ReasoningContent = memo(
  ({ className, children, ...props }: ReasoningContentProps) => (
    <CollapsibleContent
      className={cn(
        'data-open:animate-collapsible-down data-closed:animate-collapsible-up overflow-hidden',
        className,
      )}
      {...props}
    >
      <div className="h-(--collapsible-panel-height) data-ending-style:h-0 data-starting-style:h-0">
        <div className="text-muted-foreground mt-2 max-h-48 overflow-y-auto text-sm">
          <Streamdown plugins={streamdownPlugins}>{children}</Streamdown>
        </div>
      </div>
    </CollapsibleContent>
  ),
);

Reasoning.displayName = 'Reasoning';
ReasoningTrigger.displayName = 'ReasoningTrigger';
ReasoningContent.displayName = 'ReasoningContent';
