import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppProvider } from "@/context/AppContext";
import { ToastProvider } from "@/context/ToastContext";
import CommandPalette from "@/components/CommandPalette";
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
      <body className="min-h-full" suppressHydrationWarning>
        {/* Apply saved theme before React hydrates to prevent flash */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('telestar-theme');document.body.setAttribute('data-theme',t||'mixed');}catch(e){}` }}
        />
        <SessionProvider>
          <AppProvider>
            <ThemeProvider>
              <ToastProvider>
                <DashboardShell>
                  {children}
                </DashboardShell>
                <CommandPalette />
              </ToastProvider>
            </ThemeProvider>
          </AppProvider>
        </SessionProvider>
      </body>
    </html>
  );
}

