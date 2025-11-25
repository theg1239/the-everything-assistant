import type { Metadata } from 'next'
import { PastPapersClient } from './papers-client'

export const metadata: Metadata = {
  title: 'VIT Past Papers - FAT, CAT, Quiz Papers | The Everything Assistant',
  description:
    'Search and download VIT past papers for all subjects. Access FAT, CAT 1, CAT 2, quiz papers from examcooker and paper vault instantly.',
  keywords: [
    'VIT past papers',
    'VIT FAT papers',
    'VIT CAT papers',
    'VIT question papers',
    'VIT previous year papers',
    'examcooker VIT',
    'VIT paper vault',
    'VIT Vellore papers',
  ],
  openGraph: {
    title: 'VIT Past Papers | The Everything Assistant',
    description: 'Search and download VIT past papers - FAT, CAT, quiz papers for all subjects.',
    url: 'https://everything-assistant.com/features/past-papers',
  },
  alternates: {
    canonical: 'https://everything-assistant.com/features/past-papers',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'VIT Past Papers Search',
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  description: 'Search and download VIT past papers for all subjects',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
}

export default function PastPapersPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PastPapersClient />
    </>
  )
}
