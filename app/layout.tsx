import type React from 'react'
import type { Metadata } from 'next'
import localFont from 'next/font/local'
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
import { PdfDockProvider } from '@/contexts/pdf-dock-context'
import PdfDock from '@/components/pdf-dock'
import SpotifyBubble from '@/components/spotify-bubble'
import { PerformanceMonitor } from '@/components/performance-monitor'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GlobalBroadcastDialog } from '@/components/global-broadcast-dialog'
import { PWAInstallDialog } from '@/components/pwa-install-dialog'
import { SidebarWrapper } from '@/components/sidebar-wrapper'
import { BotIdClient } from 'botid/client'
import type { LatestBroadcastResponse } from '@/types/api/broadcast'

const googleSansFlex = localFont({
  src: '../public/GoogleSansFlex.ttf',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
})

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
    process.env.NEXT_PUBLIC_BASE_URL || 'https://everything-assistant.com'
  ),
  title: {
    default: 'the everything assistant',
    template: '%s | the everything assistant',
  },
  description:
    'Your personal AI assistant for VIT Vellore. Access VTOP, download past papers, check mess menu, timetables, attendance, grades, and more. The ultimate student companion for Vellore Institute of Technology.',
  manifest: '/manifest.json',
  keywords: [
    'VIT Vellore',
    'VIT Vellore assistant',
    'VIT Chennai',
    'VIT AP',
    'VIT Bhopal',
    'Vellore Institute of Technology',
    'VIT student assistant',
    'VIT Tamil Nadu',
    'VIT university',
    'VIT college',

    // VTOP Keywords
    'VTOP',
    'VTOP login',
    'VTOP helper',
    'VTOP assistant',
    'VTOP automation',
    'VTOP portal',
    'VIT student portal',
    'VTOP marks',
    'VTOP attendance',
    'VTOP timetable',
    'VTOP grades',

    // Past Papers Keywords
    'VIT past papers',
    'VIT FAT papers',
    'VIT CAT papers',
    'VIT CAT 1 papers',
    'VIT CAT 2 papers',
    'VIT quiz papers',
    'VIT exam papers',
    'VIT previous year papers',
    'VIT question papers',
    'VIT model papers',
    'VIT sample papers',
    'VIT paper vault',
    'examcooker VIT',
    'VIT study materials',
    'VIT notes download',
    'VIT syllabus',

    // Academic Keywords
    'VIT attendance tracker',
    'VIT attendance calculator',
    'VIT CGPA calculator',
    'VIT GPA calculator',
    'VIT marks checker',
    'VIT grade predictor',
    'VIT course registration',
    'FFCS VIT',
    'VIT timetable generator',
    'VIT academic calendar',
    'VIT exam schedule',
    'VIT results',

    // Campus Life Keywords
    'VIT mess menu',
    'VIT hostel mess',
    'VIT food menu',
    'VIT dining hall',
    'VIT campus life',
    'VIT facilities',
    'VIT hostel',
    'mess it VIT',
    'VIT canteen',

    // Placements Keywords
    'VIT placements',
    'VIT placement statistics',
    'VIT placement 2024',
    'VIT placement 2025',
    'VIT companies',
    'VIT internships',
    'VIT career',
    'VIT jobs',

    // AI Assistant Keywords
    'AI assistant for students',
    'AI study helper',
    'academic AI assistant',
    'student chatbot',
    'VIT chatbot',
    'college AI assistant',
    'university AI helper',
    'personal AI assistant',
    'agentic AI',

    // General Education Keywords
    'student portal',
    'academic tracker',
    'study planner',
    'exam preparation',
    'student productivity',
    'college assistant',
    'university helper',
    'academic management',
    'student tools',
    'online study assistant',
  ],
  authors: [{ name: 'The Everything Assistant Team', url: 'https://everything-assistant.com' }],
  creator: 'The Everything Assistant',
  publisher: 'The Everything Assistant',
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
    title: 'The Everything Assistant - AI Assistant for VIT Vellore Students',
    description:
      'Your personal AI assistant for VIT Vellore. Access VTOP, download past papers, check mess menu, timetables, attendance, grades, and more. The ultimate student companion.',
    url: 'https://everything-assistant.com',
    siteName: 'The Everything Assistant',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'the everything assistant',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'the everything assistant',
    description:
      'Your personal AI assistant for VIT Vellore. Access VTOP, past papers, mess menu, timetables, attendance, grades and more.',
    images: ['/og-image.png'],
    creator: '@everythingasst',
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
  alternates: {
    canonical: 'https://everything-assistant.com',
  },
  other: {
    'google-site-verification': process.env.GOOGLE_SITE_VERIFICATION || '',
  },
}

export const viewport = {
  themeColor: '#000000',
}

async function getLatestBroadcast(): Promise<LatestBroadcastResponse | null> {
  try {
    const res = await fetch(
      process.env.NEXT_PUBLIC_BASE_URL
        ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/broadcast/latest`
        : 'http://localhost:3000/api/broadcast/latest',
      { cache: 'no-store' }
    )
    if (!res.ok) return null
    return (await res.json()) as LatestBroadcastResponse | null
  } catch (error) {
    console.error('failed to load latest broadcast', error)
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'WebSite',
                  '@id': 'https://everything-assistant.com/#website',
                  url: 'https://everything-assistant.com',
                  name: 'the everything assistant',
                  description:
                    'AI-powered assistant for VIT Vellore students. Access VTOP, past papers, mess menu, timetables, attendance, and grades.',
                  publisher: {
                    '@id': 'https://everything-assistant.com/#organization',
                  },
                  potentialAction: [
                    {
                      '@type': 'SearchAction',
                      target: {
                        '@type': 'EntryPoint',
                        urlTemplate: 'https://everything-assistant.com/?q={search_term_string}',
                      },
                      'query-input': 'required name=search_term_string',
                    },
                  ],
                  inLanguage: 'en-US',
                },
                {
                  '@type': 'Organization',
                  '@id': 'https://everything-assistant.com/#organization',
                  name: 'The Everything Assistant',
                  url: 'https://everything-assistant.com',
                  logo: {
                    '@type': 'ImageObject',
                    '@id': 'https://everything-assistant.com/#logo',
                    inLanguage: 'en-US',
                    url: 'https://everything-assistant.com/assets/tea-icon.png',
                    contentUrl: 'https://everything-assistant.com/assets/tea-icon.png',
                    width: 512,
                    height: 512,
                    caption: 'The Everything Assistant',
                  },
                  image: {
                    '@id': 'https://everything-assistant.com/#logo',
                  },
                  sameAs: [],
                },
                {
                  '@type': 'WebApplication',
                  '@id': 'https://everything-assistant.com/#webapp',
                  name: 'The Everything Assistant',
                  description:
                    'AI assistant for VIT Vellore students - VTOP helper, past papers, mess menu, timetables, attendance tracker, and more.',
                  url: 'https://everything-assistant.com',
                  applicationCategory: 'EducationalApplication',
                  operatingSystem: 'Any',
                  browserRequirements: 'Requires JavaScript. Requires HTML5.',
                  offers: {
                    '@type': 'Offer',
                    price: '0',
                    priceCurrency: 'USD',
                  },
                  aggregateRating: {
                    '@type': 'AggregateRating',
                    ratingValue: '4.8',
                    ratingCount: '500',
                    bestRating: '5',
                    worstRating: '1',
                  },
                  featureList: [
                    'VTOP Integration',
                    'Past Papers Search',
                    'Mess Menu Checker',
                    'Attendance Tracker',
                    'Timetable Generator',
                    'CGPA Calculator',
                    'AI Study Assistant',
                    'Exam Schedule',
                    'Academic Calendar',
                  ],
                },
                {
                  '@type': 'EducationalOrganization',
                  '@id': 'https://everything-assistant.com/#vit',
                  name: 'Vellore Institute of Technology',
                  alternateName: ['VIT', 'VIT Vellore', 'VIT University'],
                  url: 'https://vit.ac.in',
                  address: {
                    '@type': 'PostalAddress',
                    streetAddress: 'VIT University',
                    addressLocality: 'Vellore',
                    addressRegion: 'Tamil Nadu',
                    postalCode: '632014',
                    addressCountry: 'IN',
                  },
                },
                {
                  '@type': 'FAQPage',
                  '@id': 'https://everything-assistant.com/#faq',
                  mainEntity: [
                    {
                      '@type': 'Question',
                      name: 'What is The Everything Assistant?',
                      acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'The Everything Assistant is an AI-powered tool designed specifically for VIT Vellore students. It helps you access VTOP features, search past papers, check mess menus, track attendance, view timetables, calculate CGPA, and much more through a simple conversational interface.',
                      },
                    },
                    {
                      '@type': 'Question',
                      name: 'How do I access my VTOP data?',
                      acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'Simply ask the assistant about your attendance, marks, timetable, or grades. The assistant securely connects to VTOP to fetch your academic information. Your credentials are encrypted and never stored.',
                      },
                    },
                    {
                      '@type': 'Question',
                      name: 'Can I download VIT past papers?',
                      acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'Yes! You can search and download FAT, CAT, CAT1, CAT2, and quiz papers for any subject. Just ask something like "Find DSA CAT papers" or "Download calculus FAT papers".',
                      },
                    },
                    {
                      '@type': 'Question',
                      name: 'Is this service free?',
                      acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'Yes, The Everything Assistant is completely free for VIT students. We believe in making academic tools accessible to everyone.',
                      },
                    },
                    {
                      '@type': 'Question',
                      name: 'Is my data secure?',
                      acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'Absolutely. We use end-to-end encryption and never store your VTOP credentials. All sessions are temporary and secure, just like logging in yourself.',
                      },
                    },
                  ],
                },
              ],
            }),
          }}
        />
        <link rel="icon" href="/assets/tea-icon.png" type="image/png" />
        <link rel="shortcut icon" href="/assets/tea-icon.png" type="image/png" />
        <meta name="theme-color" content="#000000" />
        <meta name="application-name" content="The Everything Assistant" />
        <meta name="apple-mobile-web-app-title" content="Everything Assistant" />
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
        <link rel="canonical" href="https://everything-assistant.com" />
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
      <body className={googleSansFlex.className}>
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
                    <PdfDockProvider>
                      <SidebarWrapper />
                      {children}
                      <PdfDock />
                      <SpotifyBubble />
                    </PdfDockProvider>
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
