'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

/** Wraps the app with next-themes so `useTheme` is available client-side. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
