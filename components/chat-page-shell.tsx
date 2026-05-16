'use client';

import { ListIcon, XIcon } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import {
  createContext,
  useCallback,
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
  registerSidebar: () => () => void;
};

const SidebarContext = createContext<SidebarContextValue>({
  open: false,
  toggle: () => {},
  close: () => {},
  hasSidebar: false,
  registerSidebar: () => () => {},
});

type RootProps = {
  /** Left chat column and right sidebar as children. */
  children: React.ReactNode;
};

type ContentProps = {
  /** Chat region content. */
  children: React.ReactNode;
};

type SidebarProps = {
  /** Sidebar controls: panels, pickers, CTAs. */
  children: React.ReactNode;
};

function Root({ children }: RootProps) {
  const [open, setOpen] = useState(false);
  const [hasSidebar, setHasSidebar] = useState(false);

  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);
  const registerSidebar = useCallback(() => {
    setHasSidebar(true);
    return () => setHasSidebar(false);
  }, []);

  return (
    <SidebarContext.Provider
      value={{ open, toggle, close, hasSidebar, registerSidebar }}
    >
      <div className="relative flex flex-1 overflow-hidden p-4 md:gap-6 md:p-6">
        {children}
        {hasSidebar && (
          <button
            aria-label="View syllabus"
            className={cn(
              'border-foreground bg-background fixed top-[4.5rem] right-4 z-30 flex items-center justify-center rounded-full border p-2.5 shadow-md transition-opacity md:hidden',
              open && 'pointer-events-none opacity-0',
            )}
            type="button"
            onClick={toggle}
          >
            <ListIcon size={18} weight="bold" />
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
function Content({ children }: ContentProps) {
  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      {children}
    </section>
  );
}

/** Right sidebar column — fixed width on desktop, slide-in drawer on mobile. */
function Sidebar({ children }: SidebarProps) {
  const { open, close, registerSidebar } = useContext(SidebarContext);
  const t = useTranslations('Chapter');

  useEffect(() => {
    return registerSidebar();
  }, [registerSidebar]);

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

/**
 * Two-column shell shared by the welcome page and every chapter page.
 *
 * Compose {@link ChatPageShell.Content} and {@link ChatPageShell.Sidebar}
 * as direct children. Order in JSX determines visual left-to-right order —
 * place `Content` before `Sidebar` for the standard layout.
 *
 * On mobile viewports the sidebar is hidden by default and accessible via a
 * floating toggle button. On `md` and above it renders as a fixed-width column.
 *
 * @example
 * <ChatPageShell>
 *   <ChatPageShell.Content>…</ChatPageShell.Content>
 *   <ChatPageShell.Sidebar>…</ChatPageShell.Sidebar>
 * </ChatPageShell>
 */
export const ChatPageShell = Object.assign(Root, { Content, Sidebar });
