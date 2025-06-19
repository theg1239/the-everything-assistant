import type React from 'react'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '@/styles/globals.css'
import '@/styles/sidebar-styles.css'
import '@/styles/hamburger-styles.css'
import '@/styles/sidebar-loading.css'
import '@/styles/mobile-fixes.css'
import '@/styles/reddit-mobile.css'
import { ThemeProvider } from '@/components/theme-provider'
import { SessionProvider } from '@/components/session-provider'
import { Toaster } from 'sonner'
import MobileViewportFix from '@/components/mobile-viewport-fix'
import ScrollToTop from '@/components/scroll-to-top'
import dynamic from 'next/dynamic'

const Aurora = dynamic(() => import('@/components/aurora'), { 
  loading: () => <div className="fixed inset-0 w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
})

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'the everything assistant',
  description: 'comprehensive ai assistant',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
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
      <body className={`${inter.className} h-full overflow-hidden`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function setAppHeight() {
                  document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
                }
                setAppHeight();
                window.scrollTo(0, 0);
                setTimeout(function() {
                  window.scrollTo(0, 0);
                }, 100);
                
                document.addEventListener('focusin', function(e) {
                  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                    setTimeout(function() {
                      var rect = e.target.getBoundingClientRect();
                      if (rect.top < 100) {
                        window.scrollBy(0, rect.top - 120);
                      }
                    }, 300);
                  }
                });
                
                document.addEventListener('click', function(e) {
                  if (e.target && e.target.tagName === 'A') {
                    window.scrollTo(0, 0);
                  }
                });
                
                window.addEventListener('resize', setAppHeight);
              })();
            `,
          }}
        />        <SessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          > 
            <div className="fixed inset-0 w-full h-full z-[-10]">
              <Aurora 
                colorStops={["#5227FF", "#7cff67", "#5227FF"]}
                amplitude={1.2}
                blend={0.6}
                speed={0.8}
              />
            </div>
            <MobileViewportFix />
            <ScrollToTop />
            {children}
            <Toaster position="top-right" />
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
