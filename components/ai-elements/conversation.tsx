'use client';

import { ArrowDownIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import type { UIMessage } from 'ai';
import { type ComponentProps, type ReactNode } from 'react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/** Props for the {@link Conversation} scroll container. */
export type ConversationProps = ComponentProps<typeof StickToBottom>;

/**
 * Scrollable container that sticks to the bottom as new messages arrive.
 * Wraps `StickToBottom` with sensible defaults for chat UIs.
 */
export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn('relative flex-1 overflow-y-hidden', className)}
    initial="smooth"
    resize="smooth"
    role="log"
    {...props}
  />
);

/** Props for the {@link ConversationContent} message list wrapper. */
export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

/** Inner content area of a {@link Conversation} that holds the message list. */
export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn('flex flex-col gap-8 p-4', className)}
    {...props}
  />
);

/** Props for the {@link ConversationEmptyState} placeholder. */
export type ConversationEmptyStateProps = ComponentProps<'div'> & {
  /** Heading shown when no messages exist. */
  title?: string;
  /** Supporting text below the heading. */
  description?: string;
  /** Optional icon displayed above the heading. */
  icon?: ReactNode;
};

/** Centered placeholder displayed inside a {@link Conversation} with no messages. */
export const ConversationEmptyState = ({
  className,
  title = 'No messages yet',
  description = 'Start a conversation to see messages here',
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => {
  const defaultContent = (
    <>
      {icon !== undefined && icon !== null && icon !== false && (
        <div className="text-muted-foreground">{icon}</div>
      )}
      <div className="space-y-1">
        <h3 className="font-medium text-sm">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </>
  );

  return (
    <div
      className={cn(
        'flex size-full flex-col items-center justify-center gap-3 p-8 text-center',
        className,
      )}
      {...props}
    >
      {children ?? defaultContent}
    </div>
  );
};

/** Props for the {@link ConversationScrollButton} jump-to-bottom control. */
export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

/**
 * Floating button that appears when the conversation is scrolled away from
 * the bottom and returns the user to the latest message on click.
 */
export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom: atBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = () => {
    void scrollToBottom();
  };

  return (
    !atBottom && (
      <Button
        className={cn(
          'absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full dark:bg-background dark:hover:bg-muted',
          className,
        )}
        size="icon"
        type="button"
        variant="outline"
        onClick={handleScrollToBottom}
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  );
};

const getMessageText = (message: UIMessage): string =>
  message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');

/** Props for the {@link ConversationDownload} export button. */
export type ConversationDownloadProps = Omit<
  ComponentProps<typeof Button>,
  'onClick'
> & {
  /** Messages to include in the downloaded file. */
  messages: UIMessage[];
  /** File name for the downloaded Markdown file. Defaults to `"conversation.md"`. */
  filename?: string;
  /** Custom message formatter; receives each message and its index. */
  formatMessage?: (message: UIMessage, index: number) => string;
};

const defaultFormatMessage = (message: UIMessage): string => {
  const roleLabel =
    message.role.charAt(0).toUpperCase() + message.role.slice(1);
  return `**${roleLabel}:** ${getMessageText(message)}`;
};

/**
 * Converts an array of UI messages to a Markdown string.
 *
 * @param messages - Messages to convert.
 * @param formatMessage - Optional formatter; defaults to bold role label + text.
 * @returns A Markdown document with each message separated by a blank line.
 */
export const messagesToMarkdown = (
  messages: UIMessage[],
  formatMessage: (
    message: UIMessage,
    index: number,
  ) => string = defaultFormatMessage,
): string => messages.map((msg, i) => formatMessage(msg, i)).join('\n\n');

/** Floating button that downloads the current conversation as a Markdown file. */
export const ConversationDownload = ({
  messages,
  filename = 'conversation.md',
  formatMessage = defaultFormatMessage,
  className,
  children,
  ...props
}: ConversationDownloadProps) => {
  const handleDownload = () => {
    const markdown = messagesToMarkdown(messages, formatMessage);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      className={cn(
        'absolute top-4 right-4 rounded-full dark:bg-background dark:hover:bg-muted',
        className,
      )}
      size="icon"
      type="button"
      variant="outline"
      onClick={handleDownload}
      {...props}
    >
      {children ?? <DownloadSimpleIcon className="size-4" />}
    </Button>
  );
};
