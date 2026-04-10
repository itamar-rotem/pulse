import type { Metadata } from "next";
import { ClerkProvider } from '@clerk/nextjs';
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { TokenProvider } from "@/components/auth/token-provider";

export const metadata: Metadata = {
  title: "Pulse — AI Dev Health Monitor",
  description: "Real-time token consumption monitoring for AI coding tools",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full antialiased">
        <body
          className="min-h-full flex"
          style={{ background: 'var(--bg)', color: 'var(--text-1)' }}
        >
          <TokenProvider>
            <Sidebar />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </TokenProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
