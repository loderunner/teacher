import { ClerkLoaded, ClerkLoading, Show, UserButton } from '@clerk/nextjs';

import { LocalePicker } from './locale-picker';
import { ThemeToggle } from './theme-toggle';

import { Link } from '@/i18n/navigation';

export default function TopBar() {
  return (
    <header className="border-border flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-3">
        <Link className="font-heading font-semibold tracking-tight" href="/">
          Journey
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <LocalePicker />
        <ThemeToggle />
        <ClerkLoading>
          <div className="bg-foreground/10 size-8 animate-pulse rounded-full" />
        </ClerkLoading>
        <ClerkLoaded>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </ClerkLoaded>
      </div>
    </header>
  );
}
