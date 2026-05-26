import { type ReactNode } from 'react';

/** Props for {@link Root}. */
type RootProps = {
  /** Section content — typically a {@link Header} followed by a {@link Body}. */
  children: ReactNode;
};

/** Props for {@link Header}. */
type HeaderProps = {
  /** Header content — typically a short section label. */
  children: ReactNode;
};

/** Props for {@link Body}. */
type BodyProps = {
  /** Body content. */
  children: ReactNode;
};

/**
 * Bordered card shared by sidebar widgets. Compose with {@link Header} and
 * {@link Body}.
 *
 * @example
 * import { SidebarSection } from '@/components/journey';
 *
 * <SidebarSection.Root>
 *   <SidebarSection.Header>Syllabus</SidebarSection.Header>
 *   <SidebarSection.Body>…</SidebarSection.Body>
 * </SidebarSection.Root>
 */
export function Root({ children }: RootProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border">
      {children}
    </section>
  );
}

/** Section heading bar. */
export function Header({ children }: HeaderProps) {
  return (
    <h2 className="font-heading border-b p-4 font-semibold">{children}</h2>
  );
}

/** Section body — scrolls independently. */
export function Body({ children }: BodyProps) {
  return <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>;
}
