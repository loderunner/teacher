import { Show, UserButton } from '@clerk/nextjs';

import { LocalePicker } from '@/components/locale/picker';
import { ThemeToggle } from '@/components/theme/toggle';

export default function TopBar() {
  return (
    <header className="border-border flex h-14 items-center justify-between border-b px-4">
      <span className="font-semibold tracking-tight">Journey</span>
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
