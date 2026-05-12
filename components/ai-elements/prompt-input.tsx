'use client';

import {
  ArrowBendDownLeftIcon,
  DesktopIcon,
  ImageIcon,
  PlusIcon,
  SquareIcon,
  XIcon,
} from '@phosphor-icons/react';
import type { ChatStatus, FileUIPart, SourceDocumentUIPart } from 'ai';
import { nanoid } from 'nanoid';
import {
  type ChangeEvent,
  type ChangeEventHandler,
  Children,
  type ClipboardEventHandler,
  type ComponentProps,
  type HTMLAttributes,
  type KeyboardEventHandler,
  type PropsWithChildren,
  type ReactNode,
  type RefObject,
  type SubmitEvent,
  type SubmitEventHandler,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

// ============================================================================
// Helpers
// ============================================================================

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

const convertBlobURLToDataURL = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    // FileReader uses callback-based API, wrapping in Promise is necessary
    // oxlint-disable-next-line eslint-plugin-promise(avoid-new)
    return new Promise((resolve) => {
      const reader = new FileReader();
      // oxlint-disable-next-line eslint-plugin-unicorn(prefer-add-event-listener)
      reader.onloadend = () =>
        resolve(isString(reader.result) ? reader.result : null);
      // oxlint-disable-next-line eslint-plugin-unicorn(prefer-add-event-listener)
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const captureScreenshot = async (): Promise<File | null> => {
  if (typeof navigator === 'undefined') {
    return null;
  }

  let stream: MediaStream | null = null;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;

  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      audio: false,
      video: true,
    });

    video.srcObject = stream;

    // Video element uses callback-based API, wrapping in Promise is necessary
    // oxlint-disable-next-line eslint-plugin-promise(avoid-new)
    await new Promise<void>((resolve, reject) => {
      // oxlint-disable-next-line eslint-plugin-unicorn(prefer-add-event-listener)
      video.onloadedmetadata = () => resolve();
      // oxlint-disable-next-line eslint-plugin-unicorn(prefer-add-event-listener)
      video.onerror = () => reject(new Error('Failed to load screen stream'));
    });

    await video.play();

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width === 0 || height === 0) {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context === null) {
      return null;
    }

    context.drawImage(video, 0, 0, width, height);
    // canvas.toBlob uses callback-based API, wrapping in Promise is necessary
    // oxlint-disable-next-line eslint-plugin-promise(avoid-new)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    if (blob === null) {
      return null;
    }

    const timestamp = new Date()
      .toISOString()
      .replaceAll(/[:.]/g, '-')
      .replace('T', '_')
      .replace('Z', '');

    return new File([blob], `screenshot-${timestamp}.png`, {
      lastModified: Date.now(),
      type: 'image/png',
    });
  } finally {
    if (stream !== null) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    video.pause();
    video.srcObject = null;
  }
};

// ============================================================================
// Provider Context & Types
// ============================================================================

/** State and actions for managing file attachments within a prompt input. */
export interface AttachmentsContext {
  /** Currently attached files with stable IDs for keying. */
  files: (FileUIPart & { id: string })[];
  /** Adds one or more files to the attachment list. */
  add: (files: File[] | FileList) => void;
  /** Removes the attachment with the given ID and revokes its blob URL. */
  remove: (id: string) => void;
  /** Clears all attachments and revokes their blob URLs. */
  clear: () => void;
  /** Programmatically opens the file picker dialog. */
  openFileDialog: () => void;
  /** Ref to the hidden `<input type="file">` element. */
  fileInputRef: RefObject<HTMLInputElement | null>;
}

/** State and actions for the text input within a prompt input. */
export interface TextInputContext {
  /** Current text value. */
  value: string;
  /** Updates the text value. */
  setInput: (v: string) => void;
  /** Clears the text value. */
  clear: () => void;
}

/** The controller object exposed by {@link usePromptInputController}. */
export interface PromptInputControllerProps {
  /** Text input state and actions. */
  textInput: TextInputContext;
  /** Attachment state and actions. */
  attachments: AttachmentsContext;
  /** INTERNAL: Allows PromptInput to register its file textInput + "open" callback */
  __registerFileInput: (
    ref: RefObject<HTMLInputElement | null>,
    open: () => void,
  ) => void;
}

const PromptInputController = createContext<PromptInputControllerProps | null>(
  null,
);
const ProviderAttachmentsContext = createContext<AttachmentsContext | null>(
  null,
);

/**
 * Returns the {@link PromptInputControllerProps} from the nearest {@link PromptInputProvider}.
 * Throws if called outside a provider.
 */
export const usePromptInputController = () => {
  const ctx = useContext(PromptInputController);
  if (ctx === null) {
    throw new Error(
      'Wrap your component inside <PromptInputProvider> to use usePromptInputController().',
    );
  }
  return ctx;
};

// Optional variants (do NOT throw). Useful for dual-mode components.
const useOptionalPromptInputController = () =>
  useContext(PromptInputController);

/**
 * Returns the {@link AttachmentsContext} from the nearest {@link PromptInputProvider}.
 * Throws if called outside a provider.
 */
export const useProviderAttachments = () => {
  const ctx = useContext(ProviderAttachmentsContext);
  if (ctx === null) {
    throw new Error(
      'Wrap your component inside <PromptInputProvider> to use useProviderAttachments().',
    );
  }
  return ctx;
};

const useOptionalProviderAttachments = () =>
  useContext(ProviderAttachmentsContext);

/** Props for the {@link PromptInputProvider}. */
export type PromptInputProviderProps = PropsWithChildren<{
  /** Initial value for the text input. Defaults to `""`. */
  initialInput?: string;
}>;

/**
 * Optional global provider that lifts PromptInput state outside of PromptInput.
 * If you don't use it, PromptInput stays fully self-managed.
 */
export const PromptInputProvider = ({
  initialInput: initialTextInput = '',
  children,
}: PromptInputProviderProps) => {
  // ----- textInput state
  const [textInput, setTextInput] = useState(initialTextInput);
  const clearInput = () => setTextInput('');

  // ----- attachments state (global when wrapped)
  const [attachmentFiles, setAttachmentFiles] = useState<
    (FileUIPart & { id: string })[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // oxlint-disable-next-line eslint(no-empty-function)
  const openRef = useRef<() => void>(() => {});

  const add = (files: File[] | FileList) => {
    const incoming = [...files];
    if (incoming.length === 0) {
      return;
    }

    setAttachmentFiles((prev) => [
      ...prev,
      ...incoming.map((file) => ({
        filename: file.name,
        id: nanoid(),
        mediaType: file.type,
        type: 'file' as const,
        url: URL.createObjectURL(file),
      })),
    ]);
  };

  const remove = (id: string) => {
    setAttachmentFiles((prev) => {
      const found = prev.find((f) => f.id === id);
      if (found !== undefined) {
        URL.revokeObjectURL(found.url);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const clear = () => {
    setAttachmentFiles((prev) => {
      for (const f of prev) {
        URL.revokeObjectURL(f.url);
      }
      return [];
    });
  };

  // Keep a ref to attachments for cleanup on unmount (avoids stale closure)
  const attachmentsRef = useRef(attachmentFiles);

  useEffect(() => {
    attachmentsRef.current = attachmentFiles;
  }, [attachmentFiles]);

  // Cleanup blob URLs on unmount to prevent memory leaks
  useEffect(
    () => () => {
      for (const f of attachmentsRef.current) {
        URL.revokeObjectURL(f.url);
      }
    },
    [],
  );

  const openFileDialog = () => {
    openRef.current();
  };

  const attachments: AttachmentsContext = {
    add,
    clear,
    fileInputRef,
    files: attachmentFiles,
    openFileDialog,
    remove,
  };

  const __registerFileInput = (
    ref: RefObject<HTMLInputElement | null>,
    open: () => void,
  ) => {
    fileInputRef.current = ref.current;
    openRef.current = open;
  };

  const controller: PromptInputControllerProps = {
    __registerFileInput,
    attachments,
    textInput: {
      clear: clearInput,
      setInput: setTextInput,
      value: textInput,
    },
  };

  return (
    <PromptInputController.Provider value={controller}>
      <ProviderAttachmentsContext.Provider value={attachments}>
        {children}
      </ProviderAttachmentsContext.Provider>
    </PromptInputController.Provider>
  );
};

// ============================================================================
// Component Context & Hooks
// ============================================================================

const LocalAttachmentsContext = createContext<AttachmentsContext | null>(null);

/**
 * Returns the {@link AttachmentsContext} for the current prompt input.
 * Prefers the local context (inside `PromptInput`) which enforces validation,
 * then falls back to the provider context. Throws if neither is available.
 */
export const usePromptInputAttachments = () => {
  // Prefer local context (inside PromptInput) as it has validation, fall back to provider
  const provider = useOptionalProviderAttachments();
  const local = useContext(LocalAttachmentsContext);
  const context = local ?? provider;
  if (context === null) {
    throw new Error(
      'usePromptInputAttachments must be used within a PromptInput or PromptInputProvider',
    );
  }
  return context;
};

// ============================================================================
// Referenced Sources (Local to PromptInput)
// ============================================================================

/** State and actions for source documents referenced in the current message. */
export interface ReferencedSourcesContext {
  /** Currently referenced source documents with stable IDs. */
  sources: (SourceDocumentUIPart & { id: string })[];
  /** Adds one or more source documents to the reference list. */
  add: (sources: SourceDocumentUIPart[] | SourceDocumentUIPart) => void;
  /** Removes the source with the given ID. */
  remove: (id: string) => void;
  /** Clears all referenced sources. */
  clear: () => void;
}

/** React context that carries referenced source state local to a `PromptInput`. */
export const LocalReferencedSourcesContext =
  createContext<ReferencedSourcesContext | null>(null);

/**
 * Returns the {@link ReferencedSourcesContext} from the nearest
 * `LocalReferencedSourcesContext.Provider`. Throws if called outside one.
 */
export const usePromptInputReferencedSources = () => {
  const ctx = useContext(LocalReferencedSourcesContext);
  if (ctx === null) {
    throw new Error(
      'usePromptInputReferencedSources must be used within a LocalReferencedSourcesContext.Provider',
    );
  }
  return ctx;
};

/** Props for the {@link PromptInputActionAddAttachments} menu item. */
export type PromptInputActionAddAttachmentsProps = ComponentProps<
  typeof DropdownMenuItem
> & {
  /** Menu item label. Defaults to `"Add photos or files"`. */
  label?: string;
};

/** Dropdown menu item that opens the file picker when clicked. */
export const PromptInputActionAddAttachments = ({
  label = 'Add photos or files',
  ...props
}: PromptInputActionAddAttachmentsProps) => {
  const attachments = usePromptInputAttachments();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    attachments.openFileDialog();
  };

  return (
    <DropdownMenuItem {...props} onClick={handleClick}>
      <ImageIcon className="mr-2 size-4" /> {label}
    </DropdownMenuItem>
  );
};

/** Props for the {@link PromptInputActionAddScreenshot} menu item. */
export type PromptInputActionAddScreenshotProps = ComponentProps<
  typeof DropdownMenuItem
> & {
  /** Menu item label. Defaults to `"Take screenshot"`. */
  label?: string;
  /** Called when the item is selected before the screenshot flow begins. */
  onSelect?: (e: React.MouseEvent) => void;
};

/** Dropdown menu item that captures a screen share screenshot and attaches it. */
export const PromptInputActionAddScreenshot = ({
  label = 'Take screenshot',
  onSelect,
  ...props
}: PromptInputActionAddScreenshotProps) => {
  const attachments = usePromptInputAttachments();

  const handleClick = async (event: React.MouseEvent) => {
    onSelect?.(event);
    if (event.defaultPrevented) {
      return;
    }

    try {
      const screenshot = await captureScreenshot();
      if (screenshot !== null) {
        attachments.add([screenshot]);
      }
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === 'NotAllowedError' || error.name === 'AbortError')
      ) {
        return;
      }
      throw error;
    }
  };

  return (
    <DropdownMenuItem {...props} onClick={handleClick}>
      <DesktopIcon className="mr-2 size-4" />
      {label}
    </DropdownMenuItem>
  );
};

/** The message payload delivered to `onSubmit` when the user sends a message. */
export interface PromptInputMessage {
  /** The text content of the message. */
  text: string;
  /** File attachments converted to data URLs. */
  files: FileUIPart[];
}

/** An error reported to `onError` when a constraint is violated. */
export type PromptInputError = {
  /** Identifies which constraint was violated. */
  code: 'max_files' | 'max_file_size' | 'accept';
  /** Human-readable description of the error. */
  message: string;
};

/** Props for the {@link PromptInput} form component. */
export type PromptInputProps = Omit<
  HTMLAttributes<HTMLFormElement>,
  'onSubmit' | 'onError'
> & {
  /** MIME type filter passed to the hidden file input, e.g. `"image/*"`. */
  accept?: string;
  /** Whether multiple files can be attached at once. */
  multiple?: boolean;
  /** When `true`, the entire document accepts file drops instead of just the form. */
  globalDrop?: boolean;
  /** When `true`, keeps a hidden input in sync for native form posts. */
  syncHiddenInput?: boolean;
  /** Maximum number of files that may be attached. */
  maxFiles?: number;
  /** Maximum file size in bytes. */
  maxFileSize?: number;
  /** Called when a file constraint is violated. */
  onError?: (err: PromptInputError) => void;
  /** Called with the composed message when the form is submitted. */
  onSubmit: (
    message: PromptInputMessage,
    event: SubmitEvent<HTMLFormElement>,
  ) => void | Promise<void>;
};

/**
 * Compound form component for composing AI chat messages.
 * Handles file attachments, drag-and-drop, paste, and submit with keyboard shortcuts.
 * Works standalone or controlled via {@link PromptInputProvider}.
 */
export const PromptInput = ({
  className,
  accept,
  multiple,
  globalDrop,
  syncHiddenInput,
  maxFiles,
  maxFileSize,
  onError,
  onSubmit,
  children,
  ...props
}: PromptInputProps) => {
  // Try to use a provider controller if present
  const controller = useOptionalPromptInputController();
  const usingProvider = controller !== null;

  // Refs
  const inputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  // ----- Local attachments (only used when no provider)
  const [items, setItems] = useState<(FileUIPart & { id: string })[]>([]);
  const files = usingProvider ? controller.attachments.files : items;

  // ----- Local referenced sources (always local to PromptInput)
  const [referencedSources, setReferencedSources] = useState<
    (SourceDocumentUIPart & { id: string })[]
  >([]);

  // Keep a ref to files for cleanup on unmount (avoids stale closure)
  const filesRef = useRef(files);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const openFileDialogLocal = () => {
    inputRef.current?.click();
  };

  const matchesAccept = (f: File) => {
    if (accept === undefined || accept.trim() === '') {
      return true;
    }

    const patterns = accept
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    return patterns.some((pattern) => {
      if (pattern.endsWith('/*')) {
        // e.g: image/* -> image/
        const prefix = pattern.slice(0, -1);
        return f.type.startsWith(prefix);
      }
      return f.type === pattern;
    });
  };

  const addLocal = (fileList: File[] | FileList) => {
    const incoming = [...fileList];
    const accepted = incoming.filter((f) => matchesAccept(f));
    if (incoming.length > 0 && accepted.length === 0) {
      onError?.({
        code: 'accept',
        message: 'No files match the accepted types.',
      });
      return;
    }
    const withinSize = (f: File) =>
      maxFileSize !== undefined ? f.size <= maxFileSize : true;
    const sized = accepted.filter(withinSize);
    if (accepted.length > 0 && sized.length === 0) {
      onError?.({
        code: 'max_file_size',
        message: 'All files exceed the maximum size.',
      });
      return;
    }

    setItems((prev) => {
      const capacity =
        typeof maxFiles === 'number'
          ? Math.max(0, maxFiles - prev.length)
          : undefined;
      const capped =
        typeof capacity === 'number' ? sized.slice(0, capacity) : sized;
      if (typeof capacity === 'number' && sized.length > capacity) {
        onError?.({
          code: 'max_files',
          message: 'Too many files. Some were not added.',
        });
      }
      const next: (FileUIPart & { id: string })[] = [];
      for (const file of capped) {
        next.push({
          filename: file.name,
          id: nanoid(),
          mediaType: file.type,
          type: 'file',
          url: URL.createObjectURL(file),
        });
      }
      return [...prev, ...next];
    });
  };

  const removeLocal = (id: string) =>
    setItems((prev) => {
      const found = prev.find((file) => file.id === id);
      if (found !== undefined) {
        URL.revokeObjectURL(found.url);
      }
      return prev.filter((file) => file.id !== id);
    });

  // Wrapper that validates files before calling provider's add
  const addWithProviderValidation = (fileList: File[] | FileList) => {
    const incoming = [...fileList];
    const accepted = incoming.filter((f) => matchesAccept(f));
    if (incoming.length > 0 && accepted.length === 0) {
      onError?.({
        code: 'accept',
        message: 'No files match the accepted types.',
      });
      return;
    }
    const withinSize = (f: File) =>
      maxFileSize !== undefined ? f.size <= maxFileSize : true;
    const sized = accepted.filter(withinSize);
    if (accepted.length > 0 && sized.length === 0) {
      onError?.({
        code: 'max_file_size',
        message: 'All files exceed the maximum size.',
      });
      return;
    }

    const currentCount = files.length;
    const capacity =
      typeof maxFiles === 'number'
        ? Math.max(0, maxFiles - currentCount)
        : undefined;
    const capped =
      typeof capacity === 'number' ? sized.slice(0, capacity) : sized;
    if (typeof capacity === 'number' && sized.length > capacity) {
      onError?.({
        code: 'max_files',
        message: 'Too many files. Some were not added.',
      });
    }

    if (capped.length > 0) {
      controller!.attachments.add(capped);
    }
  };

  const clearAttachments = () =>
    usingProvider
      ? controller.attachments.clear()
      : setItems((prev) => {
          for (const file of prev) {
            URL.revokeObjectURL(file.url);
          }
          return [];
        });

  const clearReferencedSources = () => setReferencedSources([]);

  const add = usingProvider ? addWithProviderValidation : addLocal;
  const remove = usingProvider ? controller.attachments.remove : removeLocal;
  const openFileDialog = usingProvider
    ? controller.attachments.openFileDialog
    : openFileDialogLocal;

  const clear = () => {
    clearAttachments();
    clearReferencedSources();
  };

  // Let provider know about our hidden file input so external menus can call openFileDialog()
  useEffect(() => {
    if (!usingProvider) {
      return;
    }
    controller.__registerFileInput(inputRef, () => inputRef.current?.click());
  }, [usingProvider, controller]);

  // Note: File input cannot be programmatically set for security reasons
  // The syncHiddenInput prop is no longer functional
  useEffect(() => {
    if (
      syncHiddenInput === true &&
      inputRef.current !== null &&
      files.length === 0
    ) {
      inputRef.current.value = '';
    }
  }, [files, syncHiddenInput]);

  // Attach drop handlers on nearest form and document (opt-in)
  useEffect(() => {
    const form = formRef.current;
    if (form === null) {
      return;
    }
    if (globalDrop === true) {
      // when global drop is on, let the document-level handler own drops
      return;
    }

    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files') === true) {
        e.preventDefault();
      }
    };
    const onDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files') === true) {
        e.preventDefault();
      }
      if (e.dataTransfer !== null && e.dataTransfer.files.length > 0) {
        add(e.dataTransfer.files);
      }
    };
    form.addEventListener('dragover', onDragOver);
    form.addEventListener('drop', onDrop);
    return () => {
      form.removeEventListener('dragover', onDragOver);
      form.removeEventListener('drop', onDrop);
    };
  }, [add, globalDrop]);

  useEffect(() => {
    if (globalDrop !== true) {
      return;
    }

    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files') === true) {
        e.preventDefault();
      }
    };
    const onDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files') === true) {
        e.preventDefault();
      }
      if (e.dataTransfer !== null && e.dataTransfer.files.length > 0) {
        add(e.dataTransfer.files);
      }
    };
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('drop', onDrop);
    };
  }, [add, globalDrop]);

  useEffect(
    () => () => {
      if (!usingProvider) {
        for (const f of filesRef.current) {
          URL.revokeObjectURL(f.url);
        }
      }
    },
    [usingProvider],
  );

  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (event.currentTarget.files !== null) {
      add(event.currentTarget.files);
    }
    // Reset input value to allow selecting files that were previously removed
    event.currentTarget.value = '';
  };

  const attachmentsCtx: AttachmentsContext = {
    add,
    clear: clearAttachments,
    fileInputRef: inputRef,
    files: files.map((item) => ({ ...item, id: item.id })),
    openFileDialog,
    remove,
  };

  const refsCtx: ReferencedSourcesContext = {
    add: (incoming: SourceDocumentUIPart[] | SourceDocumentUIPart) => {
      const array = Array.isArray(incoming) ? incoming : [incoming];
      setReferencedSources((prev) => [
        ...prev,
        ...array.map((s) => ({ ...s, id: nanoid() })),
      ]);
    },
    clear: clearReferencedSources,
    remove: (id: string) => {
      setReferencedSources((prev) => prev.filter((s) => s.id !== id));
    },
    sources: referencedSources,
  };

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const text = usingProvider
      ? controller.textInput.value
      : (() => {
          const formData = new FormData(form);
          const raw = formData.get('message');
          return typeof raw === 'string' ? raw : '';
        })();

    // Reset form immediately after capturing text to avoid race condition
    // where user input during async blob conversion would be lost
    if (!usingProvider) {
      form.reset();
    }

    try {
      // Convert blob URLs to data URLs asynchronously
      const convertedFiles: FileUIPart[] = await Promise.all(
        files.map(async ({ id: _id, ...item }) => {
          if (item.url.startsWith('blob:')) {
            const dataURL = await convertBlobURLToDataURL(item.url);
            // If conversion failed, keep the original blob URL
            return {
              ...item,
              url: dataURL ?? item.url,
            };
          }
          return item;
        }),
      );

      const result = onSubmit({ files: convertedFiles, text }, event);

      // Handle both sync and async onSubmit
      if (result instanceof Promise) {
        try {
          await result;
          clear();
          if (usingProvider) {
            controller.textInput.clear();
          }
        } catch {
          // Don't clear on error - user may want to retry
        }
      } else {
        // Sync function completed without throwing, clear inputs
        clear();
        if (usingProvider) {
          controller.textInput.clear();
        }
      }
    } catch {
      // Don't clear on error - user may want to retry
    }
  };

  // Render with or without local provider
  const inner = (
    <>
      <input
        ref={inputRef}
        accept={accept}
        aria-label="Upload files"
        className="hidden"
        multiple={multiple}
        title="Upload files"
        type="file"
        onChange={handleChange}
      />
      <form
        ref={formRef}
        className={cn('w-full', className)}
        onSubmit={handleSubmit}
        {...props}
      >
        <InputGroup className="overflow-hidden">{children}</InputGroup>
      </form>
    </>
  );

  const withReferencedSources = (
    <LocalReferencedSourcesContext.Provider value={refsCtx}>
      {inner}
    </LocalReferencedSourcesContext.Provider>
  );

  // Always provide LocalAttachmentsContext so children get validated add function
  return (
    <LocalAttachmentsContext.Provider value={attachmentsCtx}>
      {withReferencedSources}
    </LocalAttachmentsContext.Provider>
  );
};

/** Props for the {@link PromptInputBody} content wrapper. */
export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

/** Transparent wrapper for the main content area inside a {@link PromptInput}. */
export const PromptInputBody = ({
  className,
  ...props
}: PromptInputBodyProps) => (
  <div className={cn('contents', className)} {...props} />
);

/** Props for the {@link PromptInputTextarea} text entry. */
export type PromptInputTextareaProps = ComponentProps<
  typeof InputGroupTextarea
>;

/**
 * Auto-growing textarea for composing messages.
 * Submits on Enter (without Shift), pastes files as attachments,
 * and removes the last attachment on Backspace when the field is empty.
 */
export const PromptInputTextarea = ({
  onChange,
  onKeyDown,
  className,
  placeholder = 'What would you like to know?',
  ...props
}: PromptInputTextareaProps) => {
  const controller = useOptionalPromptInputController();
  const attachments = usePromptInputAttachments();
  const [composing, setComposing] = useState(false);

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    // Call the external onKeyDown handler first
    onKeyDown?.(e);

    // If the external handler prevented default, don't run internal logic
    if (e.defaultPrevented) {
      return;
    }

    if (e.key === 'Enter') {
      if (composing || e.nativeEvent.isComposing) {
        return;
      }
      if (e.shiftKey) {
        return;
      }
      e.preventDefault();

      // Check if the submit button is disabled before submitting
      const { form } = e.currentTarget;
      const submitButton = form?.querySelector('button[type="submit"]');
      if (submitButton instanceof HTMLButtonElement && submitButton.disabled) {
        return;
      }

      form?.requestSubmit();
    }

    // Remove last attachment when Backspace is pressed and textarea is empty
    if (
      e.key === 'Backspace' &&
      e.currentTarget.value === '' &&
      attachments.files.length > 0
    ) {
      e.preventDefault();
      const lastAttachment = attachments.files.at(-1);
      if (lastAttachment !== undefined) {
        attachments.remove(lastAttachment.id);
      }
    }
  };

  const handlePaste: ClipboardEventHandler<HTMLTextAreaElement> = (event) => {
    const { items } = event.clipboardData;
    const files: File[] = [];

    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file !== null) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      event.preventDefault();
      attachments.add(files);
    }
  };

  const handleCompositionEnd = () => setComposing(false);
  const handleCompositionStart = () => setComposing(true);

  const controlledProps =
    controller !== null
      ? {
          onChange: (e: ChangeEvent<HTMLTextAreaElement>) => {
            controller.textInput.setInput(e.currentTarget.value);
            onChange?.(e);
          },
          value: controller.textInput.value,
        }
      : {
          onChange,
        };

  return (
    <InputGroupTextarea
      className={cn('field-sizing-content max-h-48 min-h-16', className)}
      name="message"
      placeholder={placeholder}
      onCompositionEnd={handleCompositionEnd}
      onCompositionStart={handleCompositionStart}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      {...props}
      {...controlledProps}
    />
  );
};

/** Props for the {@link PromptInputHeader} block above the textarea. */
export type PromptInputHeaderProps = Omit<
  ComponentProps<typeof InputGroupAddon>,
  'align'
>;

/** Slot rendered above the textarea, typically used to show attachment thumbnails. */
export const PromptInputHeader = ({
  className,
  ...props
}: PromptInputHeaderProps) => (
  <InputGroupAddon
    align="block-end"
    className={cn('order-first flex-wrap gap-1', className)}
    {...props}
  />
);

/** Props for the {@link PromptInputFooter} toolbar below the textarea. */
export type PromptInputFooterProps = Omit<
  ComponentProps<typeof InputGroupAddon>,
  'align'
>;

/** Slot rendered below the textarea, typically used for action buttons and the submit control. */
export const PromptInputFooter = ({
  className,
  ...props
}: PromptInputFooterProps) => (
  <InputGroupAddon
    align="block-end"
    className={cn('justify-between gap-1', className)}
    {...props}
  />
);

/** Props for the {@link PromptInputTools} button row. */
export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

/** Horizontal row of action buttons inside a {@link PromptInputFooter} or {@link PromptInputHeader}. */
export const PromptInputTools = ({
  className,
  ...props
}: PromptInputToolsProps) => (
  <div
    className={cn('flex min-w-0 items-center gap-1', className)}
    {...props}
  />
);

/**
 * Tooltip configuration for a {@link PromptInputButton}.
 * Pass a string for simple text, or an object to add a keyboard shortcut hint and positioning.
 */
export type PromptInputButtonTooltip =
  | string
  | {
      /** Tooltip content node. */
      content: ReactNode;
      /** Optional keyboard shortcut label shown next to the content. */
      shortcut?: string;
      /** Tooltip placement relative to the trigger. */
      side?: ComponentProps<typeof TooltipContent>['side'];
    };

/** Props for the {@link PromptInputButton} action button. */
export type PromptInputButtonProps = ComponentProps<typeof InputGroupButton> & {
  /** Optional tooltip shown on hover. */
  tooltip?: PromptInputButtonTooltip;
};

/** Action button inside a prompt input footer, optionally wrapped in a tooltip. */
export const PromptInputButton = ({
  variant = 'ghost',
  className,
  size,
  tooltip,
  ...props
}: PromptInputButtonProps) => {
  const newSize =
    size ?? (Children.count(props.children) > 1 ? 'sm' : 'icon-sm');

  const button = (
    <InputGroupButton
      className={cn(className)}
      size={newSize}
      type="button"
      variant={variant}
      {...props}
    />
  );

  if (tooltip === undefined) {
    return button;
  }

  const tooltipContent =
    typeof tooltip === 'string' ? tooltip : tooltip.content;
  const shortcut = typeof tooltip === 'string' ? undefined : tooltip.shortcut;
  const side = typeof tooltip === 'string' ? 'top' : (tooltip.side ?? 'top');

  return (
    <Tooltip>
      <TooltipTrigger>{button}</TooltipTrigger>
      <TooltipContent side={side}>
        {tooltipContent}
        {shortcut !== undefined && (
          <span className="ml-2 text-muted-foreground">{shortcut}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
};

/** Props for the {@link PromptInputActionMenu} dropdown root. */
export type PromptInputActionMenuProps = ComponentProps<typeof DropdownMenu>;

/** Dropdown menu root for grouping prompt input actions behind a single trigger. */
export const PromptInputActionMenu = (props: PromptInputActionMenuProps) => (
  <DropdownMenu {...props} />
);

/** Props for the {@link PromptInputActionMenuTrigger} button. */
export type PromptInputActionMenuTriggerProps = PromptInputButtonProps;

/** Button that opens the {@link PromptInputActionMenu} dropdown. Defaults to a plus icon. */
export const PromptInputActionMenuTrigger = ({
  className,
  children,
  ...props
}: PromptInputActionMenuTriggerProps) => (
  <DropdownMenuTrigger
    render={<PromptInputButton className={className} {...props} />}
  >
    {children ?? <PlusIcon className="size-4" />}
  </DropdownMenuTrigger>
);

/** Props for the {@link PromptInputActionMenuContent} dropdown panel. */
export type PromptInputActionMenuContentProps = ComponentProps<
  typeof DropdownMenuContent
>;

/** Dropdown panel rendered below the {@link PromptInputActionMenuTrigger}. */
export const PromptInputActionMenuContent = ({
  className,
  ...props
}: PromptInputActionMenuContentProps) => (
  <DropdownMenuContent align="start" className={cn(className)} {...props} />
);

/** Props for the {@link PromptInputActionMenuItem} dropdown item. */
export type PromptInputActionMenuItemProps = ComponentProps<
  typeof DropdownMenuItem
>;

/** A single item inside a {@link PromptInputActionMenuContent}. */
export const PromptInputActionMenuItem = ({
  className,
  ...props
}: PromptInputActionMenuItemProps) => (
  <DropdownMenuItem className={cn(className)} {...props} />
);

// Note: Actions that perform side-effects (like opening a file dialog)
// are provided in opt-in modules (e.g., prompt-input-attachments).

/** Props for the {@link PromptInputSubmit} button. */
export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  /** Current chat status; drives icon and stop behavior. */
  status?: ChatStatus;
  /** Called when the button is clicked while the chat is generating. */
  onStop?: () => void;
};

/**
 * Submit/stop button for a {@link PromptInput}.
 * Shows a spinner while submitted, a stop icon while streaming, and a send arrow otherwise.
 */
export const PromptInputSubmit = ({
  className,
  variant = 'default',
  size = 'icon-sm',
  status,
  onStop,
  onClick,
  children,
  ...props
}: PromptInputSubmitProps) => {
  const generating = status === 'submitted' || status === 'streaming';

  let Icon = <ArrowBendDownLeftIcon className="size-4" />;

  if (status === 'submitted') {
    Icon = <Spinner />;
  } else if (status === 'streaming') {
    Icon = <SquareIcon className="size-4" />;
  } else if (status === 'error') {
    Icon = <XIcon className="size-4" />;
  }

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (generating && onStop !== undefined) {
      e.preventDefault();
      onStop();
      return;
    }
    if (typeof onClick === 'function') {
      onClick(e);
    }
  };

  return (
    <InputGroupButton
      aria-label={generating ? 'Stop' : 'Submit'}
      className={cn(className)}
      size={size}
      type={generating && onStop !== undefined ? 'button' : 'submit'}
      variant={variant}
      onClick={handleClick}
      {...props}
    >
      {children ?? Icon}
    </InputGroupButton>
  );
};

/** Props for the {@link PromptInputSelect} root. */
export type PromptInputSelectProps = ComponentProps<typeof Select>;

/** Select root adapted for use inside a {@link PromptInput}. */
export const PromptInputSelect = (props: PromptInputSelectProps) => (
  <Select {...props} />
);

/** Props for the {@link PromptInputSelectTrigger}. */
export type PromptInputSelectTriggerProps = ComponentProps<
  typeof SelectTrigger
>;

/** Styled select trigger for use inside a {@link PromptInput}. */
export const PromptInputSelectTrigger = ({
  className,
  ...props
}: PromptInputSelectTriggerProps) => (
  <SelectTrigger
    className={cn(
      'border-none bg-transparent font-medium text-muted-foreground shadow-none transition-colors',
      'hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground',
      className,
    )}
    {...props}
  />
);

/** Props for the {@link PromptInputSelectContent} dropdown panel. */
export type PromptInputSelectContentProps = ComponentProps<
  typeof SelectContent
>;

/** Select dropdown panel for use inside a {@link PromptInput}. */
export const PromptInputSelectContent = ({
  className,
  ...props
}: PromptInputSelectContentProps) => (
  <SelectContent className={cn(className)} {...props} />
);

/** Props for the {@link PromptInputSelectItem} option. */
export type PromptInputSelectItemProps = ComponentProps<typeof SelectItem>;

/** A single option inside a {@link PromptInputSelectContent}. */
export const PromptInputSelectItem = ({
  className,
  ...props
}: PromptInputSelectItemProps) => (
  <SelectItem className={cn(className)} {...props} />
);

/** Props for the {@link PromptInputSelectValue} display. */
export type PromptInputSelectValueProps = ComponentProps<typeof SelectValue>;

/** Displays the selected value inside a {@link PromptInputSelectTrigger}. */
export const PromptInputSelectValue = ({
  className,
  ...props
}: PromptInputSelectValueProps) => (
  <SelectValue className={cn(className)} {...props} />
);

/** Props for the {@link PromptInputHoverCard} root. */
export type PromptInputHoverCardProps = ComponentProps<typeof HoverCard>;

/** Hover card root adapted for use inside a {@link PromptInput}. */
export const PromptInputHoverCard = ({
  // openDelay and closeDelay not supported in @base-ui/react PreviewCard

  openDelay: _openDelay = 0,

  closeDelay: _closeDelay = 0,
  ...props
}: PromptInputHoverCardProps & { openDelay?: number; closeDelay?: number }) => (
  <HoverCard {...props} />
);

/** Props for the {@link PromptInputHoverCardTrigger}. */
export type PromptInputHoverCardTriggerProps = ComponentProps<
  typeof HoverCardTrigger
>;

/** Trigger element for a {@link PromptInputHoverCard}. */
export const PromptInputHoverCardTrigger = (
  props: PromptInputHoverCardTriggerProps,
) => <HoverCardTrigger {...props} />;

/** Props for the {@link PromptInputHoverCardContent} popover panel. */
export type PromptInputHoverCardContentProps = ComponentProps<
  typeof HoverCardContent
>;

/** Popover panel shown when hovering a {@link PromptInputHoverCardTrigger}. */
export const PromptInputHoverCardContent = ({
  align = 'start',
  ...props
}: PromptInputHoverCardContentProps) => (
  <HoverCardContent align={align} {...props} />
);

/** Props for the {@link PromptInputTabsList} tab container. */
export type PromptInputTabsListProps = HTMLAttributes<HTMLDivElement>;

/** Container for a list of {@link PromptInputTab} elements inside a prompt input. */
export const PromptInputTabsList = ({
  className,
  ...props
}: PromptInputTabsListProps) => <div className={cn(className)} {...props} />;

/** Props for the {@link PromptInputTab} panel. */
export type PromptInputTabProps = HTMLAttributes<HTMLDivElement>;

/** A single tab panel inside a {@link PromptInputTabsList}. */
export const PromptInputTab = ({
  className,
  ...props
}: PromptInputTabProps) => <div className={cn(className)} {...props} />;

/** Props for the {@link PromptInputTabLabel} heading. */
export type PromptInputTabLabelProps = HTMLAttributes<HTMLHeadingElement>;

/** Section heading inside a {@link PromptInputTab}. */
export const PromptInputTabLabel = ({
  className,
  ...props
}: PromptInputTabLabelProps) => (
  // Content provided via children in props
  // oxlint-disable-next-line eslint-plugin-jsx-a11y(heading-has-content)
  <h3
    className={cn(
      'mb-2 px-3 font-medium text-muted-foreground text-xs',
      className,
    )}
    {...props}
  />
);

/** Props for the {@link PromptInputTabBody} item list. */
export type PromptInputTabBodyProps = HTMLAttributes<HTMLDivElement>;

/** Vertically stacked list of {@link PromptInputTabItem} elements within a tab. */
export const PromptInputTabBody = ({
  className,
  ...props
}: PromptInputTabBodyProps) => (
  <div className={cn('space-y-1', className)} {...props} />
);

/** Props for the {@link PromptInputTabItem} row. */
export type PromptInputTabItemProps = HTMLAttributes<HTMLDivElement>;

/** A single row inside a {@link PromptInputTabBody}. */
export const PromptInputTabItem = ({
  className,
  ...props
}: PromptInputTabItemProps) => (
  <div
    className={cn(
      'flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent',
      className,
    )}
    {...props}
  />
);

/** Props for the {@link PromptInputCommand} root. */
export type PromptInputCommandProps = ComponentProps<typeof Command>;

/** Command palette root for use inside a {@link PromptInput}. */
export const PromptInputCommand = ({
  className,
  ...props
}: PromptInputCommandProps) => <Command className={cn(className)} {...props} />;

/** Props for the {@link PromptInputCommandInput} search field. */
export type PromptInputCommandInputProps = ComponentProps<typeof CommandInput>;

/** Search input for a {@link PromptInputCommand} palette. */
export const PromptInputCommandInput = ({
  className,
  ...props
}: PromptInputCommandInputProps) => (
  <CommandInput className={cn(className)} {...props} />
);

/** Props for the {@link PromptInputCommandList} results container. */
export type PromptInputCommandListProps = ComponentProps<typeof CommandList>;

/** Scrollable results list inside a {@link PromptInputCommand}. */
export const PromptInputCommandList = ({
  className,
  ...props
}: PromptInputCommandListProps) => (
  <CommandList className={cn(className)} {...props} />
);

/** Props for the {@link PromptInputCommandEmpty} empty state. */
export type PromptInputCommandEmptyProps = ComponentProps<typeof CommandEmpty>;

/** Shown inside a {@link PromptInputCommandList} when no results match. */
export const PromptInputCommandEmpty = ({
  className,
  ...props
}: PromptInputCommandEmptyProps) => (
  <CommandEmpty className={cn(className)} {...props} />
);

/** Props for the {@link PromptInputCommandGroup} section. */
export type PromptInputCommandGroupProps = ComponentProps<typeof CommandGroup>;

/** A labeled group of items inside a {@link PromptInputCommandList}. */
export const PromptInputCommandGroup = ({
  className,
  ...props
}: PromptInputCommandGroupProps) => (
  <CommandGroup className={cn(className)} {...props} />
);

/** Props for the {@link PromptInputCommandItem} selectable row. */
export type PromptInputCommandItemProps = ComponentProps<typeof CommandItem>;

/** A selectable row inside a {@link PromptInputCommandGroup}. */
export const PromptInputCommandItem = ({
  className,
  ...props
}: PromptInputCommandItemProps) => (
  <CommandItem className={cn(className)} {...props} />
);

/** Props for the {@link PromptInputCommandSeparator} divider. */
export type PromptInputCommandSeparatorProps = ComponentProps<
  typeof CommandSeparator
>;

/** Visual divider between groups inside a {@link PromptInputCommandList}. */
export const PromptInputCommandSeparator = ({
  className,
  ...props
}: PromptInputCommandSeparatorProps) => (
  <CommandSeparator className={cn(className)} {...props} />
);
