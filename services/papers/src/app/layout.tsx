import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import '../styles/globals.css'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/components/theme-provider'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Paper Vault | the everything assistant',
  description: 'VIT papers inside the everything assistant — upload, search, and revisit exams with the same look and feel as the main app.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
            {children}
            <Toaster position="top-right" richColors />
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
