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
  return (
    <div className="flex flex-1 gap-6 overflow-hidden p-6">{children}</div>
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

/** Right sidebar column — fixed width, no internal scroll. */
function Sidebar({ children }: SidebarProps) {
  return (
    <aside className="flex w-80 flex-col gap-4 overflow-hidden xl:w-96 2xl:w-md">
      {children}
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
 * @example
 * <ChatPageShell>
 *   <ChatPageShell.Content>…</ChatPageShell.Content>
 *   <ChatPageShell.Sidebar>…</ChatPageShell.Sidebar>
 * </ChatPageShell>
 */
export const ChatPageShell = Object.assign(Root, { Content, Sidebar });
