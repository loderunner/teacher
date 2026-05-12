'use client';

import { MonitorIcon, MoonIcon, SunIcon } from '@phosphor-icons/react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// useSyncExternalStore: server snapshot → false, client snapshot → true.
// Gives React a stable hydration boundary without useEffect + setState.
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/** Dropdown selector for light, dark, and system themes. */
export function ThemeToggle() {
  const { setTheme, theme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
  const clientTheme = mounted ? (theme ?? 'system') : 'system';

  const TriggerIcon =
    clientTheme === 'light'
      ? SunIcon
      : clientTheme === 'dark'
        ? MoonIcon
        : MonitorIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Select theme"
        className="hover:bg-accent focus-visible:ring-ring inline-flex size-9 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:ring-1 focus-visible:outline-none"
      >
        <TriggerIcon className="size-4" weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <SunIcon className="mr-2 size-4" weight="bold" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <MoonIcon className="mr-2 size-4" weight="bold" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <MonitorIcon className="mr-2 size-4" weight="bold" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
