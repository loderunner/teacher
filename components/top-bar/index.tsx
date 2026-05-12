import { Show, UserButton } from '@clerk/nextjs';

import { HomeButton } from './home-button';

import { LocalePicker } from '@/components/locale/picker';
import { ThemeToggle } from '@/components/theme/toggle';

export default function TopBar() {
  return (
    <header className="border-border flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-3">
        <HomeButton />
        <span className="font-semibold tracking-tight">Journey</span>
      </div>
      <div className="flex items-center gap-2">
        <LocalePicker />
        <ThemeToggle />
        <Show when="signed-in">
          <UserButton />
        </Show>
      </div>
    </header>
  );
}
