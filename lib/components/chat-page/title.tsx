import { type ReactNode } from 'react';

/** Props for {@link Title}. */
type Props = {
  /** Heading text — typically a chapter or page title. */
  children: ReactNode;
};

/**
 * Top-level page heading shared by chat pages. Provides consistent
 * typography for chapter titles and section names.
 */
export function Title({ children }: Props) {
  return <h1 className="text-3xl font-bold">{children}</h1>;
}
