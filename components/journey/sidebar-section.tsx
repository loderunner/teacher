import { type ReactNode } from 'react';

import { cn } from '@/lib/tailwind';

/** Props for {@link Root}. */
type RootProps = {
  /** Section content — typically a {@link Header} followed by a {@link Body}. */
  children: ReactNode;
  /** When true, the section grows to fill available vertical space in its flex column and its body scrolls. */
  expanding?: boolean;
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
 * <SidebarSection.Root expanding>
 *   <SidebarSection.Header>Syllabus</SidebarSection.Header>
 *   <SidebarSection.Body>…</SidebarSection.Body>
 * </SidebarSection.Root>
 */
export function Root({ children, expanding }: RootProps) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-lg border',
        expanding === true && 'min-h-0 flex-1',
      )}
    >
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

/** Section body — scrolls independently when the section is expanding. */
export function Body({ children }: BodyProps) {
  return <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>;
}
