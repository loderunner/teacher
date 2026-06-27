import 'client-only';

import { BrainIcon, CaretDownIcon } from '@phosphor-icons/react';
import { useControllableState } from '@radix-ui/react-use-controllable-state';
import {
  type ComponentProps,
  type ReactNode,
  createContext,
  memo,
  useContext,
  useEffect,
  useRef,
} from 'react';
import { Streamdown } from 'streamdown';

import { Shimmer } from './shimmer';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/lib/components/ui/collapsible';
import { streamdownPlugins } from '@/lib/streamdown';
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

const MS_IN_S = 1000;

/**
 * Collapsible wrapper for model reasoning content. Open state is fully
 * controlled by the user; use `defaultOpen` to set the initial state.
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

    const [isOpen, setIsOpen] = useControllableState<boolean>({
      defaultProp: resolvedDefaultOpen,
      onChange: onOpenChange,
      prop: open,
    });
    const [duration, setDuration] = useControllableState<number | undefined>({
      defaultProp: undefined,
      prop: durationProp,
    });

    const startTimeRef = useRef<number | null>(null);

    useEffect(() => {
      if (isStreaming) {
        startTimeRef.current ??= Date.now();
      } else if (startTimeRef.current !== null) {
        setDuration(Math.ceil((Date.now() - startTimeRef.current) / MS_IN_S));
        startTimeRef.current = null;
      }
    }, [isStreaming, setDuration]);

    return (
      <ReasoningContext.Provider
        value={{ duration, isOpen, isStreaming, setIsOpen }}
      >
        <Collapsible
          className={cn('not-prose mb-2', className)}
          open={isOpen}
          onOpenChange={setIsOpen}
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
          'text-muted-foreground hover:text-foreground flex w-full items-center gap-2 text-xs transition-colors',
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            <BrainIcon size={12} />
            {getThinkingMessage(isStreaming, duration)}
            <CaretDownIcon
              className={cn(
                'transition-transform',
                isOpen ? 'rotate-180' : 'rotate-0',
              )}
              size={12}
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

/** Scrollable panel that renders the model's reasoning text as markdown. */
const ReasoningContentInner = ({
  className,
  children,
  ...props
}: ReasoningContentProps) => {
  const { isStreaming } = useReasoning();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isStreaming && scrollRef.current !== null) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [children, isStreaming]);

  return (
    <CollapsibleContent
      className={cn(
        'data-open:animate-collapsible-down data-closed:animate-collapsible-up overflow-hidden',
        className,
      )}
      {...props}
    >
      <div className="h-(--collapsible-panel-height) data-ending-style:h-0 data-starting-style:h-0">
        <div
          ref={scrollRef}
          className="text-muted-foreground mt-2 max-h-48 overflow-y-auto text-xs"
          style={{
            maskImage:
              'linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)',
          }}
        >
          <div className="py-4">
            <Streamdown plugins={streamdownPlugins}>{children}</Streamdown>
          </div>
        </div>
      </div>
    </CollapsibleContent>
  );
};

export const ReasoningContent = memo(ReasoningContentInner);

Reasoning.displayName = 'Reasoning';
ReasoningTrigger.displayName = 'ReasoningTrigger';
ReasoningContent.displayName = 'ReasoningContent';
