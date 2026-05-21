import {
  Atkinson_Hyperlegible_Mono,
  Atkinson_Hyperlegible_Next,
  Poppins,
} from 'next/font/google';
import { getLocale } from 'next-intl/server';

import { ThemeProvider } from '@/components/theme/provider';

import 'katex/dist/katex.min.css';
import './globals.css';

const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const atkinsonNext = Atkinson_Hyperlegible_Next({
  variable: '--font-atkinson-next',
  subsets: ['latin'],
  adjustFontFallback: false,
});

const atkinsonMono = Atkinson_Hyperlegible_Mono({
  variable: '--font-atkinson-mono',
  subsets: ['latin'],
  adjustFontFallback: false,
});

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <html
      className={`${poppins.variable} ${atkinsonNext.variable} ${atkinsonMono.variable} h-full antialiased`}
      lang={locale}
      suppressHydrationWarning
    >
      <body className="flex h-full flex-col overflow-hidden">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
