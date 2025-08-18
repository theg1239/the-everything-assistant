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
import { MFAGate } from '@/components/auth/mfa-gate'
import { Toaster } from 'sonner'
import MobileViewportFix from '@/components/shared/mobile-viewport-fix'
import ScrollToTop from '@/components/ui/scroll-to-top'
import CustomBackground from '@/components/backgrounds/custom-background'
import { PerformanceMonitor } from '@/components/performance/performance-monitor'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/mfa-otp'
import { GlobalBroadcastDialog } from '@/components/controls/global-broadcast-dialog'
import { PWAInstallDialog } from '@/components/pwa/pwa-install-dialog'
import { SidebarWrapper } from '@/components/navigation/sidebar-wrapper'
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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL || 'https://the-everything-assistant.vercel.app'
  ),
  title: 'the everything assistant',
  description: 'your personal agentic AI assistant',
  manifest: '/manifest.json',
  keywords: [
    'VIT Vellore',
    'VIT Vellore assistant',
    'VTOP helper',
    'VIT student assistant',
    'Vellore Institute of Technology',
    'VIT Tamil Nadu',
    'VIT TN',

    'VIT past papers',
    'VIT FAT past papers',
    'VIT CAT past papers',
    'VIT quiz papers',
    'VIT exam papers',
    'VIT previous year papers',
    'VIT question papers',
    'VIT study materials',
    'VIT notes',
    'VIT syllabus',
    'VIT paper vault',
    'examcooker',
    'codechef papers',
    'VIT coding papers',
    'VIT programming papers',

    'VTOP login',
    'VTOP assistant',
    'VIT timetable',
    'VIT attendance tracker',
    'VIT grades',
    'VIT marks',
    'VIT CGPA calculator',
    'VIT GPA',
    'VTOP automation',
    'VIT course registration',
    'VIT academic calendar',

    'VIT mess menu',
    'VIT hostel mess',
    'VIT food menu',
    'VIT dining',
    'VIT campus assistant',
    'VIT student life',
    'VIT facilities',
    'mess it',

    'VIT placements',
    'VIT placement statistics',
    'VIT career guidance',
    'VIT internships',
    'VIT job opportunities',
    'VIT companies',

    'AI assistant',
    'student AI helper',
    'academic AI assistant',
    'chatbot for students',
    'VIT chatbot',
    'study assistant AI',
    'personal assistant',
    'agentic AI',
    'intelligent assistant',

    'student portal',
    'academic tracker',
    'study planner',
    'exam preparation',
    'student productivity',
    'college assistant',
    'university helper',
    'academic management',
    'student tools',
  ],
  authors: [{ name: 'the everything assistant team' }],
  creator: 'the everything assistant',
  publisher: 'the everything assistant',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  category: 'Education',
  classification: 'Educational Assistant',
  icons: {
    icon: '/assets/tea-icon.png',
    apple: '/assets/tea-icon.png',
  },
  openGraph: {
    title: 'the everything assistant',
    description:
      'your personal AI assistant for vit vellore - access vtop, past papers, mess menu, timetables, attendance, grades, and more',
    url: 'https://the-everything-assistant.vercel.app',
    siteName: 'the everything assistant',
    images: [
      {
        url: '/onboarding-artwork/artwork.png',
        width: 1200,
        height: 630,
        alt: 'the everything assistant - VIT Vellore AI assistant for students',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'the everything assistant',
    description:
      'your personal AI assistant for vit vellore - access vtop, past papers, mess menu, timetables, attendance, grades, and more',
    images: ['/onboarding-artwork/artwork.png'],
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
  alternates: {
    canonical: 'https://the-everything-assistant.vercel.app',
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
        {process.env.DISABLE_BOTID !== 'true' && <BotIdClient protect={protectedRoutes} />}
        <link rel="icon" href="/assets/tea-icon.png" type="image/png" />
        <link rel="shortcut icon" href="/assets/tea-icon.png" type="image/png" />
        <meta name="theme-color" content="#000000" />
        <meta name="application-name" content="the everything assistant" />
        <meta name="apple-mobile-web-app-title" content="the everything assistant" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#000000" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="geo.region" content="IN-TN" />
        <meta name="geo.placename" content="Vellore, Tamil Nadu, India" />
        <meta name="geo.position" content="12.9698;79.1566" />
        <meta name="ICBM" content="12.9698, 79.1566" />
        <link rel="canonical" href="https://the-everything-assistant.vercel.app" />
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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded-md focus:bg-primary focus:text-primary-foreground"
        >
          Skip to main content
        </a>
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
                  <MFAGate>
                    <SidebarWrapper />
                    {children}
                  </MFAGate>
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
