import { ClerkProvider } from '@clerk/nextjs';
import { Inconsolata, Inter, Poppins } from 'next/font/google';
import { getLocale } from 'next-intl/server';

import { ThemeProvider } from '@/components/theme/provider';

import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const inconsolata = Inconsolata({
  variable: '--font-inconsolata',
  subsets: ['latin'],
});

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <html
      className={`${inter.variable} ${poppins.variable} ${inconsolata.variable} h-full antialiased`}
      lang={locale}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ClerkProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
