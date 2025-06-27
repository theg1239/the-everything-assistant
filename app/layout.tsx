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

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'the everything assistant',
  description: 'your personal agentic AI assistant',
  manifest: '/manifest.json',
  themeColor: '#000000',
  icons: {
    apple: '/assets/tea-icon.png',
  },
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
            <MFAGate>{children}</MFAGate>
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
            {/* Render the global broadcast dialog for authenticated users */}
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
