import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";

import { routing } from "@/i18n/routing";
import TopBar from "@/components/top-bar";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Journey",
  description: "Teach yourself anything with AI",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const messages = await getMessages();

  return (
    <html
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      lang={locale}
    >
      <body className="flex min-h-full flex-col">
        <ClerkProvider>
          <NextIntlClientProvider messages={messages}>
            <TopBar />
            {children}
          </NextIntlClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
