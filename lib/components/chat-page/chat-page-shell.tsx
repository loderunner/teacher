'use client';

import { NotebookIcon, XIcon } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

import { cn } from '@/lib/tailwind';

type SidebarContextValue = {
  open: boolean;
  toggle: () => void;
  close: () => void;
  hasSidebar: boolean;
  setHasSidebar: (value: boolean) => void;
};

const SidebarContext = createContext<SidebarContextValue>({
  open: false,
  toggle: () => {},
  close: () => {},
  hasSidebar: false,
  setHasSidebar: () => {},
});

type RootProps = {
  /** Left chat column and right sidebar as children. */
  children: ReactNode;
};

type ContentProps = {
  /** Chat region content. */
  children: ReactNode;
};

type HeaderProps = {
  /** Page title area — typically an eyebrow label and a {@link Title}. */
  children: ReactNode;
};

type FooterProps = {
  /** CTA area below the chat — typically a {@link Button}. */
  children: ReactNode;
};

type SidebarProps = {
  /** Sidebar controls: panels, pickers, CTAs. */
  children: ReactNode;
};

/**
 * Outer two-column shell. Compose with {@link Content} and {@link Sidebar}
 * as direct children.
 *
 * @example
 * import { ChatPageShell } from '@/lib/components/chat-page';
 *
 * <ChatPageShell.Root>
 *   <ChatPageShell.Content>
 *     <ChatPageShell.Header>…</ChatPageShell.Header>
 *     <JourneyChatView … />
 *     <ChatPageShell.Footer>…</ChatPageShell.Footer>
 *   </ChatPageShell.Content>
 *   <ChatPageShell.Sidebar>…</ChatPageShell.Sidebar>
 * </ChatPageShell.Root>
 */
export function Root({ children }: RootProps) {
  const [open, setOpen] = useState(false);
  const [hasSidebar, setHasSidebar] = useState(false);
  const t = useTranslations('Chapter');

  const toggle = () => setOpen((o) => !o);
  const close = () => setOpen(false);

  return (
    <SidebarContext.Provider
      value={{ open, toggle, close, hasSidebar, setHasSidebar }}
    >
      <div className="relative flex flex-1 overflow-hidden p-4 md:gap-6 md:p-6">
        {children}
        {hasSidebar && (
          <button
            aria-label={t('syllabusHeader')}
            className={cn(
              'border-foreground bg-background fixed top-18 right-4 z-30 rounded-full border p-2.5 shadow-md transition-opacity md:hidden',
              open && 'pointer-events-none opacity-0',
            )}
            type="button"
            onClick={toggle}
          >
            <NotebookIcon size={18} weight="bold" />
          </button>
        )}
        {open && (
          <div
            aria-hidden
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={close}
          />
        )}
      </div>
    </SidebarContext.Provider>
  );
}

/** Left chat column. Handles overflow so the conversation scrolls independently of the sidebar. */
export function Content({ children }: ContentProps) {
  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      {children}
    </section>
  );
}

/** Page header rendered above the chat — position label, title, etc. */
export function Header({ children }: HeaderProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-1 pb-4">
      {children}
    </div>
  );
}

/** Page footer rendered below the chat — primary CTA button. */
export function Footer({ children }: FooterProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl justify-end px-1 pb-1">
      {children}
    </div>
  );
}

/** Right sidebar column — fixed width on desktop, slide-in drawer on mobile. */
export function Sidebar({ children }: SidebarProps) {
  const { open, close, setHasSidebar } = useContext(SidebarContext);
  const t = useTranslations('Chapter');

  useEffect(() => {
    setHasSidebar(true);
    return () => setHasSidebar(false);
  }, [setHasSidebar]);

  return (
    <aside
      className={cn(
        // Mobile: fixed overlay that slides in from the right
        'bg-background fixed top-14 right-0 bottom-0 z-50 flex w-80 flex-col gap-4 overflow-hidden rounded-l-xl shadow-2xl transition-transform duration-200',
        // Desktop: normal in-flow sidebar
        'md:relative md:top-auto md:right-auto md:bottom-auto md:z-auto md:w-80 md:rounded-none md:bg-transparent md:shadow-none xl:w-96 2xl:w-md',
        // Translate off-screen when closed on mobile; always visible on desktop
        open ? 'translate-x-0' : 'translate-x-full md:translate-x-0',
      )}
    >
      {/* Mobile close button row */}
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 md:hidden">
        <span className="font-heading font-semibold">
          {t('syllabusHeader')}
        </span>
        <button
          aria-label="Close sidebar"
          className="text-muted-foreground hover:text-foreground"
          type="button"
          onClick={close}
        >
          <XIcon size={20} />
        </button>
      </div>
      {/* Sidebar content — scrollable on mobile, overflow-hidden on desktop */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:overflow-hidden md:p-0">
        {children}
      </div>
    </aside>
  );
}
