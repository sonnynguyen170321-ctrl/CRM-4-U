import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { AppProvider } from "@/context/AppContext";
import { ToastProvider } from "@/context/ToastContext";
import CommandPalette from "@/components/CommandPalette";
import AiAssistant from "@/components/AiAssistant";
import DashboardShell from "@/components/DashboardShell";

export const metadata: Metadata = {
  title: {
    default: 'Telestar SDR CRM',
    template: '%s | Telestar',
  },
  description: 'The operating system for elite B2B SDR teams — leads, sequences, and outreach cadences in one command center.',
  robots: { index: false, follow: false },
  icons: { icon: '/favicon.ico' },
  openGraph: {
    type: 'website',
    title: 'Telestar SDR CRM',
    description: 'Elite SDR outreach command center.',
    siteName: 'Telestar SDR CRM',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full" data-theme="light" suppressHydrationWarning>
        <SessionProvider>
          <AppProvider>
            <ToastProvider>
              <DashboardShell>
                {children}
              </DashboardShell>
              <CommandPalette />
              <AiAssistant />
            </ToastProvider>
          </AppProvider>
        </SessionProvider>
      </body>
    </html>
  );
}

