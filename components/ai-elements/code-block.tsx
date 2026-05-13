'use client';

import { CheckIcon, CopyIcon } from '@phosphor-icons/react';
import {
  type ComponentProps,
  type HTMLAttributes,
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type BundledLanguage,
  type BundledTheme,
  type HighlighterGeneric,
  type ThemedToken,
  createHighlighter,
} from 'shiki';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/tailwind';

// Shiki uses bitflags for font styles: 1=italic, 2=bold, 4=underline
const isItalic = (fontStyle: number | undefined): boolean =>
  fontStyle !== undefined && (fontStyle & 1) !== 0;
const isBold = (fontStyle: number | undefined): boolean =>
  fontStyle !== undefined && (fontStyle & 2) !== 0;
const isUnderline = (fontStyle: number | undefined): boolean =>
  fontStyle !== undefined && (fontStyle & 4) !== 0;

interface KeyedToken {
  token: ThemedToken;
  key: string;
}

interface KeyedLine {
  tokens: KeyedToken[];
  key: string;
}

const addKeysToTokens = (lines: ThemedToken[][]): KeyedLine[] =>
  lines.map((line, lineIdx) => ({
    key: `line-${lineIdx}`,
    tokens: line.map((token, tokenIdx) => ({
      key: `line-${lineIdx}-${tokenIdx}`,
      token,
    })),
  }));

const TokenSpan = ({ token }: { token: ThemedToken }) => (
  <span
    className="dark:!bg-[var(--shiki-dark-bg)] dark:!text-[var(--shiki-dark)]"
    style={{
      backgroundColor: token.bgColor,
      color: token.color,
      fontStyle: isItalic(token.fontStyle) ? 'italic' : undefined,
      fontWeight: isBold(token.fontStyle) ? 'bold' : undefined,
      textDecoration: isUnderline(token.fontStyle) ? 'underline' : undefined,
      ...token.htmlStyle,
    }}
  >
    {token.content}
  </span>
);

const LINE_NUMBER_CLASSES = cn(
  'block',
  'before:content-[counter(line)]',
  'before:inline-block',
  'before:[counter-increment:line]',
  'before:w-8',
  'before:mr-4',
  'before:text-right',
  'before:text-muted-foreground/50',
  'before:font-mono',
  'before:select-none',
);

const LineSpan = ({
  keyedLine,
  showLineNumbers,
}: {
  keyedLine: KeyedLine;
  showLineNumbers: boolean;
}) => (
  <span className={showLineNumbers ? LINE_NUMBER_CLASSES : 'block'}>
    {keyedLine.tokens.length === 0
      ? '\n'
      : keyedLine.tokens.map(({ token, key }) => (
          <TokenSpan key={key} token={token} />
        ))}
  </span>
);

/** Props for the {@link CodeBlock} component. */
export type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  /** Source code to display. */
  code: string;
  /** Language for syntax highlighting. */
  language: BundledLanguage;
  /** Whether to show line numbers. */
  showLineNumbers?: boolean;
};

interface TokenizedCode {
  tokens: ThemedToken[][];
  fg: string;
  bg: string;
}

interface CodeBlockContextType {
  code: string;
}

const CodeBlockContext = createContext<CodeBlockContextType>({
  code: '',
});

const highlighterCache = new Map<
  string,
  Promise<HighlighterGeneric<BundledLanguage, BundledTheme>>
>();

const tokensCache = new Map<string, TokenizedCode>();

const subscribers = new Map<string, Set<(result: TokenizedCode) => void>>();

const getTokensCacheKey = (code: string, language: BundledLanguage) => {
  const start = code.slice(0, 100);
  const end = code.length > 100 ? code.slice(-100) : '';
  return `${language}:${code.length}:${start}:${end}`;
};

const getHighlighter = (
  language: BundledLanguage,
): Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> => {
  const cached = highlighterCache.get(language);
  if (cached !== undefined) {
    return cached;
  }

  const highlighterPromise = createHighlighter({
    langs: [language],
    themes: ['github-light', 'github-dark'],
  });

  highlighterCache.set(language, highlighterPromise);
  return highlighterPromise;
};

const createRawTokens = (code: string): TokenizedCode => ({
  bg: 'transparent',
  fg: 'inherit',
  tokens: code.split('\n').map((line) =>
    line === ''
      ? []
      : [
          {
            color: 'inherit',
            content: line,
          } as ThemedToken,
        ],
  ),
});

/**
 * Synchronously returns cached syntax-highlighted tokens for `code`, or starts
 * async highlighting and calls `callback` when done.
 *
 * @param code Source code to highlight.
 * @param language Shiki-supported language identifier.
 * @param callback Called with the final tokens once highlighting completes.
 */
export const highlightCode = (
  code: string,
  language: BundledLanguage,
  callback?: (result: TokenizedCode) => void,
): TokenizedCode | null => {
  const tokensCacheKey = getTokensCacheKey(code, language);

  const cached = tokensCache.get(tokensCacheKey);
  if (cached !== undefined) {
    return cached;
  }

  if (callback !== undefined) {
    if (!subscribers.has(tokensCacheKey)) {
      subscribers.set(tokensCacheKey, new Set());
    }
    subscribers.get(tokensCacheKey)?.add(callback);
  }

  getHighlighter(language)
    .then((highlighter) => {
      const availableLangs = highlighter.getLoadedLanguages();
      const langToUse = availableLangs.includes(language) ? language : 'text';

      const result = highlighter.codeToTokens(code, {
        lang: langToUse,
        themes: {
          dark: 'github-dark',
          light: 'github-light',
        },
      });

      const tokenized: TokenizedCode = {
        bg: result.bg ?? 'transparent',
        fg: result.fg ?? 'inherit',
        tokens: result.tokens,
      };

      tokensCache.set(tokensCacheKey, tokenized);

      const subs = subscribers.get(tokensCacheKey);
      if (subs !== undefined) {
        for (const sub of subs) {
          sub(tokenized);
        }
        subscribers.delete(tokensCacheKey);
      }
    })
    .catch((error: unknown) => {
      console.error('Failed to highlight code:', error);
      subscribers.delete(tokensCacheKey);
    });

  return null;
};

const CodeBlockBody = memo(
  ({
    tokenized,
    showLineNumbers,
    className,
  }: {
    tokenized: TokenizedCode;
    showLineNumbers: boolean;
    className?: string;
  }) => {
    const preStyle = useMemo(
      () => ({
        backgroundColor: tokenized.bg,
        color: tokenized.fg,
      }),
      [tokenized.bg, tokenized.fg],
    );

    const keyedLines = useMemo(
      () => addKeysToTokens(tokenized.tokens),
      [tokenized.tokens],
    );

    return (
      <pre
        className={cn(
          'm-0 p-4 text-sm dark:!bg-[var(--shiki-dark-bg)] dark:!text-[var(--shiki-dark)]',
          className,
        )}
        style={preStyle}
      >
        <code
          className={cn(
            'font-mono text-sm',
            showLineNumbers &&
              '[counter-increment:line_0] [counter-reset:line]',
          )}
        >
          {keyedLines.map((keyedLine) => (
            <LineSpan
              key={keyedLine.key}
              keyedLine={keyedLine}
              showLineNumbers={showLineNumbers}
            />
          ))}
        </code>
      </pre>
    );
  },
  (prevProps, nextProps) =>
    prevProps.tokenized === nextProps.tokenized &&
    prevProps.showLineNumbers === nextProps.showLineNumbers &&
    prevProps.className === nextProps.className,
);

CodeBlockBody.displayName = 'CodeBlockBody';

/** Props for the {@link CodeBlockContainer} wrapper. */
export type CodeBlockContainerProps = HTMLAttributes<HTMLDivElement> & {
  /** Language identifier for the `data-language` attribute. */
  language: string;
};

/** Outer container with border, rounded corners, and content-visibility optimization. */
export const CodeBlockContainer = ({
  className,
  language,
  style,
  ...props
}: CodeBlockContainerProps) => (
  <div
    className={cn(
      'group bg-background text-foreground relative w-full overflow-hidden rounded-md border',
      className,
    )}
    data-language={language}
    style={{
      containIntrinsicSize: 'auto 200px',
      contentVisibility: 'auto',
      ...style,
    }}
    {...props}
  />
);

/** Header bar shown above the code content. */
export const CodeBlockHeader = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'bg-muted/80 text-muted-foreground flex items-center justify-between border-b px-3 py-2 text-xs',
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

/** Title section within a {@link CodeBlockHeader}. */
export const CodeBlockTitle = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center gap-2', className)} {...props}>
    {children}
  </div>
);

/** Filename label inside a {@link CodeBlockTitle}. */
export const CodeBlockFilename = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('font-mono', className)} {...props}>
    {children}
  </span>
);

/** Right-aligned action buttons inside a {@link CodeBlockHeader}. */
export const CodeBlockActions = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('-my-1 -mr-1 flex items-center gap-2', className)}
    {...props}
  >
    {children}
  </div>
);

/** Props for the {@link CodeBlockContent} syntax renderer. */
export type CodeBlockContentProps = {
  /** Source code to highlight. */
  code: string;
  /** Shiki-supported language identifier. */
  language: BundledLanguage;
  /** Whether to show line numbers. */
  showLineNumbers?: boolean;
};

/** Async syntax-highlighted code renderer using Shiki. Falls back to plain text while loading. */
export const CodeBlockContent = ({
  code,
  language,
  showLineNumbers = false,
}: CodeBlockContentProps) => {
  const rawTokens = useMemo(() => createRawTokens(code), [code]);

  const syncTokens = useMemo(
    () => highlightCode(code, language) ?? rawTokens,
    [code, language, rawTokens],
  );

  const [asyncTokens, setAsyncTokens] = useState<{
    key: string;
    tokens: TokenizedCode;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const key = getTokensCacheKey(code, language);

    highlightCode(code, language, (result) => {
      if (!cancelled) {
        setAsyncTokens({ key, tokens: result });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  const currentKey = getTokensCacheKey(code, language);
  const tokenized =
    asyncTokens?.key === currentKey ? asyncTokens.tokens : syncTokens;

  return (
    <div className="relative overflow-auto">
      <CodeBlockBody showLineNumbers={showLineNumbers} tokenized={tokenized} />
    </div>
  );
};

/**
 * Syntax-highlighted code block with optional header and copy button.
 *
 * @example
 * <CodeBlock code={`const x = 1;`} language="typescript" />
 */
export const CodeBlock = ({
  code,
  language,
  showLineNumbers = false,
  className,
  children,
  ...props
}: CodeBlockProps) => {
  const contextValue = useMemo(() => ({ code }), [code]);

  return (
    <CodeBlockContext.Provider value={contextValue}>
      <CodeBlockContainer className={className} language={language} {...props}>
        {children}
        <CodeBlockContent
          code={code}
          language={language}
          showLineNumbers={showLineNumbers}
        />
      </CodeBlockContainer>
    </CodeBlockContext.Provider>
  );
};

/** Props for the {@link CodeBlockCopyButton}. */
export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
  /** Called after successful copy. */
  onCopy?: () => void;
  /** Called if the copy fails. */
  onError?: (error: Error) => void;
  /** How long (ms) the check icon stays visible. Defaults to 2000. */
  timeout?: number;
};

/** Button that copies the code block content to the clipboard. */
export const CodeBlockCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: CodeBlockCopyButtonProps) => {
  const [copied, setIsCopied] = useState(false);
  const timeoutRef = useRef<number>(0);
  const { code } = useContext(CodeBlockContext);

  const copyToClipboard = useCallback(async () => {
    try {
      if (!copied) {
        await navigator.clipboard.writeText(code);
        setIsCopied(true);
        onCopy?.();
        timeoutRef.current = window.setTimeout(
          () => setIsCopied(false),
          timeout,
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        onError?.(error);
      }
    }
  }, [code, onCopy, onError, timeout, copied]);

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const Icon = copied ? CheckIcon : CopyIcon;

  return (
    <Button
      className={cn('shrink-0', className)}
      size="icon"
      type="button"
      variant="ghost"
      onClick={copyToClipboard}
      {...props}
    >
      {children ?? <Icon size={14} />}
    </Button>
  );
};

/** Props for the {@link CodeBlockLanguageSelector}. */
export type CodeBlockLanguageSelectorProps = ComponentProps<typeof Select>;

/** Language picker for multi-language code blocks. */
export const CodeBlockLanguageSelector = (
  props: CodeBlockLanguageSelectorProps,
) => <Select {...props} />;

/** Props for the {@link CodeBlockLanguageSelectorTrigger}. */
export type CodeBlockLanguageSelectorTriggerProps = ComponentProps<
  typeof SelectTrigger
>;

/** Compact trigger for the language selector dropdown. */
export const CodeBlockLanguageSelectorTrigger = ({
  className,
  ...props
}: CodeBlockLanguageSelectorTriggerProps) => (
  <SelectTrigger
    className={cn(
      'h-7 border-none bg-transparent px-2 text-xs shadow-none',
      className,
    )}
    size="sm"
    {...props}
  />
);

/** Props for the {@link CodeBlockLanguageSelectorValue}. */
export type CodeBlockLanguageSelectorValueProps = ComponentProps<
  typeof SelectValue
>;

/** Displays the currently selected language. */
export const CodeBlockLanguageSelectorValue = (
  props: CodeBlockLanguageSelectorValueProps,
) => <SelectValue {...props} />;

/** Props for the {@link CodeBlockLanguageSelectorContent}. */
export type CodeBlockLanguageSelectorContentProps = ComponentProps<
  typeof SelectContent
>;

/** Dropdown content for the language selector. */
export const CodeBlockLanguageSelectorContent = ({
  align = 'end',
  ...props
}: CodeBlockLanguageSelectorContentProps) => (
  <SelectContent align={align} {...props} />
);

/** Props for the {@link CodeBlockLanguageSelectorItem}. */
export type CodeBlockLanguageSelectorItemProps = ComponentProps<
  typeof SelectItem
>;

/** A single language option in the selector. */
export const CodeBlockLanguageSelectorItem = (
  props: CodeBlockLanguageSelectorItemProps,
) => <SelectItem {...props} />;
