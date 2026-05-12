'use client';

import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import type { UIMessage } from 'ai';
import {
  type ComponentProps,
  type Dispatch,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SetStateAction,
  createContext,
  isValidElement,
  memo,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Streamdown } from 'streamdown';

import { cn } from '@/lib/tailwind';

/** Props for the {@link Message} wrapper. */
export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  /** The role of the message author; controls alignment and styling. */
  from: UIMessage['role'];
};

/** Outer wrapper for a single chat message, aligned by role. */
export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      'group flex w-full max-w-[95%] flex-col gap-2',
      from === 'user' ? 'is-user ml-auto justify-end' : 'is-assistant',
      className,
    )}
    {...props}
  />
);

/** Props for the {@link MessageContent} bubble. */
export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

/** Styled bubble that wraps a message's renderable content. */
export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      'is-user:dark flex w-fit max-w-full min-w-0 flex-col gap-2 overflow-hidden text-sm',
      'group-[.is-user]:bg-secondary group-[.is-user]:text-foreground group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:px-4 group-[.is-user]:py-3',
      'group-[.is-assistant]:text-foreground',
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

/** Props for the {@link MessageActions} action row. */
export type MessageActionsProps = ComponentProps<'div'>;

/** Row of action buttons displayed below a message. */
export const MessageActions = ({
  className,
  children,
  ...props
}: MessageActionsProps) => (
  <div className={cn('flex items-center gap-1', className)} {...props}>
    {children}
  </div>
);

/** Props for a single {@link MessageAction} icon button. */
export type MessageActionProps = ComponentProps<typeof Button> & {
  /** Tooltip text shown on hover. Also used as the accessible label when `label` is omitted. */
  tooltip?: string;
  /** Screen-reader label; falls back to `tooltip` if not provided. */
  label?: string;
};

/** Icon button used inside {@link MessageActions}, optionally wrapped in a tooltip. */
export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = 'ghost',
  size = 'icon-sm',
  ...props
}: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label ?? tooltip}</span>
    </Button>
  );

  if (tooltip !== undefined) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

interface MessageBranchContextType {
  currentBranch: number;
  totalBranches: number;
  goToPrevious: () => void;
  goToNext: () => void;
  branches: ReactElement[];
  setBranches: Dispatch<SetStateAction<ReactElement[]>>;
}

const MessageBranchContext = createContext<MessageBranchContextType | null>(
  null,
);

const useMessageBranch = () => {
  const context = useContext(MessageBranchContext);

  if (context === null) {
    throw new Error(
      'MessageBranch components must be used within MessageBranch',
    );
  }

  return context;
};

/** Props for the {@link MessageBranch} multi-version container. */
export type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
  /** Zero-based index of the branch to show on first render. Defaults to `0`. */
  defaultBranch?: number;
  /** Called whenever the active branch changes. */
  onBranchChange?: (branchIndex: number) => void;
};

/**
 * Container that tracks multiple alternate message versions and exposes
 * branch navigation via context to its children.
 */
export const MessageBranch = ({
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: MessageBranchProps) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch);
  const [branches, setBranches] = useState<ReactElement[]>([]);

  const handleBranchChange = (newBranch: number) => {
    setCurrentBranch(newBranch);
    onBranchChange?.(newBranch);
  };

  const goToPrevious = () => {
    const newBranch =
      currentBranch > 0 ? currentBranch - 1 : branches.length - 1;
    handleBranchChange(newBranch);
  };

  const goToNext = () => {
    const newBranch =
      currentBranch < branches.length - 1 ? currentBranch + 1 : 0;
    handleBranchChange(newBranch);
  };

  const contextValue: MessageBranchContextType = {
    branches,
    currentBranch,
    goToNext,
    goToPrevious,
    setBranches,
    totalBranches: branches.length,
  };

  return (
    <MessageBranchContext.Provider value={contextValue}>
      <div
        className={cn('grid w-full gap-2 [&>div]:pb-0', className)}
        {...props}
      />
    </MessageBranchContext.Provider>
  );
};

/** Props for the {@link MessageBranchContent} branch renderer. */
export type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>;

function toReactElementArray(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) {
    return node.filter(isValidElement);
  }
  return isValidElement(node) ? [node] : [];
}

/** Renders the currently active branch from an array of child elements. */
export const MessageBranchContent = ({
  children,
  ...props
}: MessageBranchContentProps) => {
  const { currentBranch, setBranches } = useMessageBranch();
  const childrenArray = toReactElementArray(children);

  useEffect(() => {
    setBranches((prev) => {
      const next = toReactElementArray(children);
      return prev.length !== next.length ? next : prev;
    });
  }, [children, setBranches]);

  return childrenArray.map((branch, index) => (
    <div
      key={branch.key}
      className={cn(
        'grid gap-2 overflow-hidden [&>div]:pb-0',
        index === currentBranch ? 'block' : 'hidden',
      )}
      {...props}
    >
      {branch}
    </div>
  ));
};

/** Props for the {@link MessageBranchSelector} navigation control group. */
export type MessageBranchSelectorProps = ComponentProps<typeof ButtonGroup>;

/** Button group containing previous/next controls and a page indicator; hidden when only one branch exists. */
export const MessageBranchSelector = ({
  className,
  ...props
}: MessageBranchSelectorProps) => {
  const { totalBranches } = useMessageBranch();

  // Don't render if there's only one branch
  if (totalBranches <= 1) {
    return null;
  }

  return (
    <ButtonGroup
      className={cn(
        '[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md',
        className,
      )}
      orientation="horizontal"
      {...props}
    />
  );
};

/** Props for the {@link MessageBranchPrevious} button. */
export type MessageBranchPreviousProps = ComponentProps<typeof Button>;

/** Button that navigates to the previous branch in a {@link MessageBranch}. */
export const MessageBranchPrevious = ({
  children,
  ...props
}: MessageBranchPreviousProps) => {
  const { goToPrevious, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Previous branch"
      disabled={totalBranches <= 1}
      size="icon-sm"
      type="button"
      variant="ghost"
      onClick={goToPrevious}
      {...props}
    >
      {children ?? <CaretLeftIcon size={14} />}
    </Button>
  );
};

/** Props for the {@link MessageBranchNext} button. */
export type MessageBranchNextProps = ComponentProps<typeof Button>;

/** Button that navigates to the next branch in a {@link MessageBranch}. */
export const MessageBranchNext = ({
  children,
  ...props
}: MessageBranchNextProps) => {
  const { goToNext, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Next branch"
      disabled={totalBranches <= 1}
      size="icon-sm"
      type="button"
      variant="ghost"
      onClick={goToNext}
      {...props}
    >
      {children ?? <CaretRightIcon size={14} />}
    </Button>
  );
};

/** Props for the {@link MessageBranchPage} indicator. */
export type MessageBranchPageProps = HTMLAttributes<HTMLSpanElement>;

/** Displays the current branch index as "N of M" inside a {@link MessageBranchSelector}. */
export const MessageBranchPage = ({
  className,
  ...props
}: MessageBranchPageProps) => {
  const { currentBranch, totalBranches } = useMessageBranch();

  return (
    <ButtonGroupText
      className={cn(
        'text-muted-foreground border-none bg-transparent shadow-none',
        className,
      )}
      {...props}
    >
      {currentBranch + 1} of {totalBranches}
    </ButtonGroupText>
  );
};

/** Props for the {@link MessageResponse} streaming renderer. */
export type MessageResponseProps = ComponentProps<typeof Streamdown>;

const streamdownPlugins = { cjk, code, math, mermaid };

/**
 * Memoized Streamdown renderer for assistant message content.
 * Skips re-renders when neither the text nor the animation state has changed.
 */
export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        'size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        className,
      )}
      plugins={streamdownPlugins}
      {...props}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    nextProps.isAnimating === prevProps.isAnimating,
);

MessageResponse.displayName = 'MessageResponse';

/** The visual state of a processing indicator. */
export type MessageIndicatorType = 'loading' | 'thinking' | 'tool-call';

export type MessageIndicatorProps = {
  /** The visual state to display. */
  type: MessageIndicatorType;
  /** Optional label shown next to the animated dots. */
  label?: string;
};

/**
 * Displays an animated processing indicator as an assistant message.
 * Used to signal loading, model reasoning, or an in-progress tool call.
 *
 * @example
 * <MessageIndicator type="thinking" label="Thinking" />
 */
export const MessageIndicator = ({ label }: MessageIndicatorProps) => (
  <Message aria-label={label} aria-live="polite" from="assistant">
    <MessageContent>
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <span className="flex gap-0.5">
          <span className="animate-pulse">•</span>
          <span className="animate-pulse [animation-delay:200ms]">•</span>
          <span className="animate-pulse [animation-delay:400ms]">•</span>
        </span>
        {label !== undefined && <span>{label}</span>}
      </div>
    </MessageContent>
  </Message>
);

/** Props for the {@link MessageToolbar} row. */
export type MessageToolbarProps = ComponentProps<'div'>;

/** Full-width row for controls displayed below message content (e.g. branch selector + actions). */
export const MessageToolbar = ({
  className,
  children,
  ...props
}: MessageToolbarProps) => (
  <div
    className={cn(
      'mt-4 flex w-full items-center justify-between gap-4',
      className,
    )}
    {...props}
  >
    {children}
  </div>
);
