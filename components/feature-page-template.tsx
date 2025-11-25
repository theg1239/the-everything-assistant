'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  ArrowRight,
  Search,
  GraduationCap,
  FileText,
  Calendar,
  UtensilsCrossed,
  BarChart3,
  Clock,
  BookOpen,
  Award,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const iconMap = {
  GraduationCap,
  FileText,
  Calendar,
  UtensilsCrossed,
  BarChart3,
  Clock,
  BookOpen,
  Award,
} as const

type IconName = keyof typeof iconMap

interface FeaturePageTemplateProps {
  iconName: IconName
  title: string
  subtitle: string
  description: string
  iconColor: string
  gradient: string
  queries: string[]
  features?: { title: string; description: string }[]
  tips?: string[]
  breadcrumb?: { label: string; href: string }[]
}

export function FeaturePageTemplate({
  iconName,
  title,
  subtitle,
  description,
  iconColor,
  gradient,
  queries,
  features,
  tips,
  breadcrumb,
}: FeaturePageTemplateProps) {
  const router = useRouter()
  const Icon = iconMap[iconName]

  const handleQueryClick = (query: string) => {
    sessionStorage.setItem('prefilled-query', query)
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-transparent text-foreground">
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="flex-shrink-0 sticky top-0 z-40 bg-black/20 backdrop-blur-sm border-b border-border/50">
          <div className="flex h-14 items-center px-4 gap-2">
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← back to chat
            </Link>
            {breadcrumb && breadcrumb.length > 0 && (
              <nav className="hidden sm:flex items-center gap-1 ml-4 text-sm text-muted-foreground">
                {breadcrumb.map((item, index) => (
                  <span key={item.href} className="flex items-center gap-1">
                    <span>/</span>
                    <Link href={item.href} className="hover:text-foreground transition-colors">
                      {item.label}
                    </Link>
                  </span>
                ))}
              </nav>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex flex-col items-center px-4 py-12 md:py-16">
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="text-center mb-12 max-w-2xl"
          >
            <div
              className={`inline-flex p-4 rounded-2xl bg-gradient-to-br ${gradient} backdrop-blur-md mb-6`}
            >
              <Icon className={`h-10 w-10 ${iconColor}`} />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-light tracking-tight mb-3">
              {title}
            </h1>
            <p className="text-lg text-muted-foreground mb-2">{subtitle}</p>
            <p className="text-sm text-muted-foreground/70">{description}</p>
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
            className="w-full max-w-2xl mb-12"
          >
            <p className="text-xs text-muted-foreground text-center mb-4">click to try</p>
            <div className="flex flex-wrap justify-center gap-2">
              {queries.map((query, index) => (
                <motion.button
                  key={query}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 * index }}
                  onClick={() => handleQueryClick(query)}
                  className="group flex items-center gap-2 px-4 py-2 rounded-full border border-border/50 bg-background/50 backdrop-blur-sm hover:border-border hover:bg-background/80 transition-all text-sm"
                >
                  <Search className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                    {query}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Features */}
          {features && features.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
              className="w-full max-w-3xl mb-12"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {features.map((feature, index) => (
                  <div
                    key={feature.title}
                    className="p-4 rounded-xl border border-border/50 bg-background/30 backdrop-blur-sm"
                  >
                    <h3 className="font-medium mb-1 text-sm">{feature.title}</h3>
                    <p className="text-xs text-muted-foreground">{feature.description}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Tips */}
          {tips && tips.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4, ease: 'easeOut' }}
              className="w-full max-w-xl mb-12"
            >
              <div className="p-6 rounded-2xl border border-border/50 bg-background/20 backdrop-blur-sm">
                <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider">tips</p>
                <ul className="space-y-2">
                  {tips.map((tip, index) => (
                    <li
                      key={index}
                      className="text-sm text-muted-foreground flex items-start gap-2"
                    >
                      <span className="text-foreground/50">•</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5, ease: 'easeOut' }}
            className="text-center"
          >
            <Link href="/">
              <Button
                variant="outline"
                className="rounded-full px-6 border-border/60 hover:bg-border/10"
              >
                start chatting <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </motion.div>
        </main>

        {/* Footer */}
        <footer className="py-6 px-4 border-t border-border/50 bg-black/10 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-muted-foreground">
            <p>the everything assistant · built for vit students</p>
            <div className="flex gap-4">
              <Link href="/features" className="hover:text-foreground transition-colors">
                all features
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
