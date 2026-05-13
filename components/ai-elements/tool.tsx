'use client';

import {
  CaretDownIcon,
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import type { DynamicToolUIPart, ToolUIPart } from 'ai';
import { type ComponentProps, type ReactNode } from 'react';

import { CodeBlock } from './code-block';

import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/tailwind';

/** Props for the {@link Tool} collapsible container. */
export type ToolProps = ComponentProps<typeof Collapsible>;

/** Collapsible wrapper for a single tool call block. */
export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn('group not-prose mb-2 w-full rounded-md border', className)}
    {...props}
  />
);

/** A static or dynamic tool UI part. */
export type ToolPart = ToolUIPart | DynamicToolUIPart;

/** Props for the {@link ToolHeader} trigger row. */
export type ToolHeaderProps = {
  /** Optional display name override; falls back to the derived tool name. */
  title?: string;
  className?: string;
} & (
  | { type: ToolUIPart['type']; state: ToolUIPart['state']; toolName?: never }
  | {
      type: DynamicToolUIPart['type'];
      state: DynamicToolUIPart['state'];
      toolName: string;
    }
);

const statusLabels: Record<ToolPart['state'], string> = {
  'approval-requested': 'Awaiting Approval',
  'approval-responded': 'Responded',
  'input-available': 'Running',
  'input-streaming': 'Pending',
  'output-available': 'Completed',
  'output-denied': 'Denied',
  'output-error': 'Error',
};

const statusIcons: Record<ToolPart['state'], ReactNode> = {
  'approval-requested': <ClockIcon className="text-yellow-600" size={16} />,
  'approval-responded': <CheckCircleIcon className="text-blue-600" size={16} />,
  'input-available': <ClockIcon className="animate-pulse" size={16} />,
  'input-streaming': <CircleIcon size={16} />,
  'output-available': <CheckCircleIcon className="text-green-600" size={16} />,
  'output-denied': <XCircleIcon className="text-orange-600" size={16} />,
  'output-error': <XCircleIcon className="text-red-600" size={16} />,
};

/** Returns a {@link Badge} displaying the tool call's current state. */
export const getStatusBadge = (status: ToolPart['state']) => (
  <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
    {statusIcons[status]}
    {statusLabels[status]}
  </Badge>
);

/** Clickable header row showing the tool name, status badge, and a caret icon. */
export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const derivedName =
    type === 'dynamic-tool' ? toolName : type.split('-').slice(1).join('-');

  return (
    <CollapsibleTrigger
      className={cn(
        'flex w-full items-center justify-between gap-4 p-3',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        <WrenchIcon className="text-muted-foreground" size={16} />
        <span className="text-sm font-medium">{title ?? derivedName}</span>
        {getStatusBadge(state)}
      </div>
      <CaretDownIcon
        className={cn(
          'text-muted-foreground transition-transform',
          'group-data-open:rotate-180',
        )}
        size={16}
      />
    </CollapsibleTrigger>
  );
};

/** Props for the {@link ToolContent} collapsible panel. */
export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

/** Scrollable panel containing the tool call's input and output. */
export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      'data-open:animate-collapsible-down data-closed:animate-collapsible-up overflow-hidden',
      className,
    )}
    {...props}
  />
);

/** Props for the {@link ToolInput} parameter display. */
export type ToolInputProps = ComponentProps<'div'> & {
  /** The tool's input object to render as formatted JSON. */
  input: ToolPart['input'];
};

/** Renders the tool call's input parameters as syntax-highlighted JSON. */
export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div
    className={cn('max-h-48 space-y-2 overflow-y-auto', className)}
    {...props}
  >
    <h4 className="text-muted-foreground px-4 pt-4 text-xs font-medium tracking-wide uppercase">
      Parameters
    </h4>
    <div className="bg-muted/50 rounded-md">
      <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
    </div>
  </div>
);

/** Props for the {@link ToolOutput} result display. */
export type ToolOutputProps = ComponentProps<'div'> & {
  /** The tool's output to render. The caller is responsible for formatting. */
  output: ReactNode;
  /** Error message if the tool failed. */
  errorText: ToolPart['errorText'];
};

/** Renders the tool call's result or error. */
export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if ((output === null || output === undefined) && errorText === undefined) {
    return null;
  }

  const hasError = errorText !== undefined;

  return (
    <div className={cn('space-y-2 px-4 pb-4', className)} {...props}>
      <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {hasError ? 'Error' : 'Result'}
      </h4>
      <div
        className={cn(
          'overflow-x-auto rounded-md text-xs [&_table]:w-full',
          hasError
            ? 'bg-destructive/10 text-destructive'
            : 'bg-muted/50 text-foreground',
        )}
      >
        {hasError && <div>{errorText}</div>}
        {output}
      </div>
    </div>
  );
};
