import type React from 'react'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '@/styles/globals.css'
import '@/styles/sidebar-styles.css'
import '@/styles/hamburger-styles.css'
import '@/styles/sidebar-loading.css'
import '@/styles/mobile-fixes.css'
import '@/styles/reddit-mobile.css'
import { ThemeProvider } from '@/providers/theme-provider'
import { SessionProvider } from '@/providers/session-provider'
import { MemoryProvider } from '@/providers/memory-provider'
import { SidebarProvider } from '@/contexts/sidebar-context'
import QueryProvider from '@/providers/query-provider'
import { MFAGate } from '@/components/mfa-gate'
import { Toaster } from 'sonner'
import MobileViewportFix from '@/components/mobile-viewport-fix'
import ScrollToTop from '@/components/scroll-to-top'
import CustomBackground from '@/components/backgrounds/custom-background'
import { PerformanceMonitor } from '@/components/performance-monitor'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GlobalBroadcastDialog } from '@/components/global-broadcast-dialog'
import { PWAInstallDialog } from '@/components/pwa-install-dialog'
import { SidebarWrapper } from '@/components/sidebar-wrapper'
import { BotIdClient } from 'botid/client'

const inter = Inter({ subsets: ['latin'] })

const protectedRoutes = [
  {
    path: '/api/auth/signin/google',
    method: 'POST',
  },
  {
    path: '/api/auth/callback/google',
    method: 'POST',
  },
  {
    path: '/api/auth/session',
    method: 'POST',
  },
  {
    path: '/api/auth/mfa-verify',
    method: 'POST',
  },
  {
    path: '/login',
    method: 'GET',
  },
]

export const metadata: Metadata = {
  title: 'the everything assistant',
  description: 'your personal agentic AI assistant',
  manifest: '/manifest.json',
  icons: {
    icon: '/assets/tea-icon.png',
    apple: '/assets/tea-icon.png',
  },
  openGraph: {
    title: 'the everything assistant',
    description: 'your personal agentic AI assistant',
    url: 'https://the-everything-assistant.vercel.app',
    siteName: 'the everything assistant',
    images: [
      {
        url: '/onboarding-artwork/artwork.png',
        width: 1200,
        height: 630,
        alt: 'the everything assistant - your personal agentic AI assistant',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'the everything assistant',
    description: 'your personal agentic AI assistant',
    images: ['/onboarding-artwork/artwork.png'],
  },
}

export const viewport = {
  themeColor: '#000000',
}

async function getLatestBroadcast() {
  try {
    const res = await fetch(
      process.env.NEXT_PUBLIC_BASE_URL
        ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/broadcast/latest`
        : 'http://localhost:3000/api/broadcast/latest',
      { cache: 'no-store' }
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getServerSession(authOptions)
  const latestBroadcast = session?.user ? await getLatestBroadcast() : null

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <BotIdClient protect={protectedRoutes} />
        <link rel="icon" href="/assets/tea-icon.png" type="image/png" />
        <link rel="shortcut icon" href="/assets/tea-icon.png" type="image/png" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, height=device-height"
        />
        <style>{`
          :root {
            --vh: 1vh;
          }
          #__next {
            height: 100vh;
            height: calc(var(--vh, 1vh) * 100);
            overflow: auto;
            -webkit-overflow-scrolling: touch;
          }
        `}</style>
      </head>
      <body className={`${inter.className}`}>
        <SessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <div className="fixed inset-0 w-full h-full z-[-10]">
              <CustomBackground />
            </div>
            <MobileViewportFix />
            <ScrollToTop />
            {process.env.NODE_ENV === 'development' && <PerformanceMonitor />}
            <QueryProvider>
              <MemoryProvider>
                <SidebarProvider>
                  <SidebarWrapper />
                  <MFAGate>{children}</MFAGate>
                </SidebarProvider>
              </MemoryProvider>
            </QueryProvider>
            <Toaster
              position="top-right"
              closeButton
              richColors
              theme="dark"
              toastOptions={{
                style: {
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  color: 'hsl(var(--card-foreground))',
                  borderRadius: '0.75rem',
                  padding: '12px 16px',
                  fontSize: '14px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  backdropFilter: 'blur(8px)',
                  maxWidth: '400px',
                },
                className: 'sonner-toast',
              }}
            />
            {session?.user && latestBroadcast && (
              <GlobalBroadcastDialog latestBroadcast={latestBroadcast} />
            )}
            <PWAInstallDialog />
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
