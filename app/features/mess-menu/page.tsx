import type { Metadata } from 'next'
import { FeaturePageTemplate } from '@/components/feature-page-template'

export const metadata: Metadata = {
  title: 'VIT Mess Menu - Today\'s Food Menu | The Everything Assistant',
  description:
    'Check today\'s mess menu at VIT Vellore. View breakfast, lunch, dinner menus across all hostels. Never wonder what\'s for food again.',
  keywords: [
    'VIT mess menu',
    'VIT food menu',
    'VIT hostel mess',
    'VIT today menu',
    'VIT breakfast menu',
    'VIT lunch menu',
    'VIT dinner menu',
    'VIT Vellore mess',
  ],
  openGraph: {
    title: 'VIT Mess Menu | The Everything Assistant',
    description: 'Check today\'s mess menu at VIT Vellore - breakfast, lunch, dinner across hostels.',
    url: 'https://everything-assistant.com/features/mess-menu',
  },
  alternates: {
    canonical: 'https://everything-assistant.com/features/mess-menu',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'VIT Mess Menu',
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'Web',
  description: 'Check VIT mess menu for all hostels',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
}

export default function MessMenuPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FeaturePageTemplate
        iconName="UtensilsCrossed"
        title="mess menu"
        subtitle="never wonder again"
        description="check what's for breakfast, lunch, and dinner across all vit hostels"
        iconColor="text-orange-400"
        gradient="from-orange-500/20 to-amber-500/20"
        queries={[
          "what's for lunch today",
          "what's the dinner menu",
          'mess menu for tomorrow',
          'breakfast options',
          "what's for snacks",
          'weekly mess schedule',
        ]}
        features={[
          { title: 'all meals', description: 'breakfast, lunch, snacks, and dinner menus' },
          { title: 'all hostels', description: 'menu varies by hostel - get the right one' },
          { title: 'daily updates', description: 'fresh menu data every day' },
          { title: 'special items', description: 'know when special items are served' },
        ]}
        tips={[
          'ask about specific meals or get the full day menu',
          'menu is updated daily from official sources',
          'specify your hostel for accurate menu',
        ]}
        breadcrumb={[{ label: 'features', href: '/features' }]}
      />
    </>
  )
}
