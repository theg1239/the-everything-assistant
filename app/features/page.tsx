import type { Metadata } from 'next'
import FeaturesClient from './features-client'

export const metadata: Metadata = {
  title: 'Features - VIT Student Tools | The Everything Assistant',
  description:
    'Explore all features: VTOP integration for attendance & grades, past papers search, mess menu, academic calendar, and AI-powered study help for VIT students.',
  keywords: [
    'VIT tools',
    'VIT features',
    'VIT student app',
    'VIT VTOP',
    'VIT attendance',
    'VIT past papers',
    'VIT mess menu',
    'VIT timetable',
    'VIT grades',
    'VIT Vellore',
    'VIT student portal',
    'VIT academic tools',
  ],
  openGraph: {
    title: 'Features - VIT Student Tools | The Everything Assistant',
    description:
      'All-in-one VIT student companion: VTOP, past papers, mess menu, and AI study help.',
    url: 'https://everything-assistant.com/features',
    images: [
      {
        url: '/og-features.png',
        width: 1200,
        height: 630,
        alt: 'The Everything Assistant Features',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VIT Student Tools | The Everything Assistant',
    description: 'VTOP integration, past papers, mess menu, and AI study help for VIT students.',
  },
  alternates: {
    canonical: 'https://everything-assistant.com/features',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'The Everything Assistant Features',
  description: 'Complete list of features for VIT students',
  url: 'https://everything-assistant.com/features',
  numberOfItems: 7,
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'VTOP Integration',
      description: 'Access attendance, marks, grades, and timetable from VTOP',
      url: 'https://everything-assistant.com/features/vtop',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Past Papers',
      description: 'Search and download FAT, CAT, and quiz papers',
      url: 'https://everything-assistant.com/features/past-papers',
    },
    {
      '@type': 'ListItem',
      position: 3,
      name: 'Mess Menu',
      description: "View today's mess menu across all hostels",
      url: 'https://everything-assistant.com/features/mess-menu',
    },
    {
      '@type': 'ListItem',
      position: 4,
      name: 'Attendance Tracker',
      description: 'Track attendance with 75% guardrails and bunk calculator',
      url: 'https://everything-assistant.com/features/vtop/attendance',
    },
    {
      '@type': 'ListItem',
      position: 5,
      name: 'Grades & CGPA',
      description: 'View semester grades and CGPA history',
      url: 'https://everything-assistant.com/features/vtop/grades',
    },
    {
      '@type': 'ListItem',
      position: 6,
      name: 'Timetable',
      description: "View today's classes and slot timings",
      url: 'https://everything-assistant.com/features/vtop/timetable',
    },
    {
      '@type': 'ListItem',
      position: 7,
      name: 'Academic Calendar',
      description: 'View exam dates, holidays, and academic events',
      url: 'https://everything-assistant.com/features/vtop/calendar',
    },
  ],
}

export default function FeaturesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FeaturesClient />
    </>
  )
}
