import type React from 'react'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '@/styles/globals.css'
import '@/styles/sidebar-styles.css'
import '@/styles/hamburger-styles.css'
import '@/styles/sidebar-loading.css'
import '@/styles/mobile-fixes.css'
import { ThemeProvider } from '@/components/theme-provider'
import { SessionProvider } from '@/components/session-provider'
import { Toaster } from 'sonner'
import MobileViewportFix from '@/components/mobile-viewport-fix'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'vit vellore ai assistant',
  description: 'comprehensive ai assistant for vit vellore with extensive knowledge base',
  generator: 'v0.dev',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
      </head>
      <body className={inter.className}>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Initial setup for mobile viewport issues
                function setAppHeight() {
                  document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
                }
                // Set on page load
                setAppHeight();
                // Reset scroll position
                window.scrollTo(0, 0);
                // Listen for resize
                window.addEventListener('resize', setAppHeight);
              })();
            `,
          }}
        />
        <SessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <MobileViewportFix />
            {children}
            <Toaster position="top-right" />
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
