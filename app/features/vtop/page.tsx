import type { Metadata } from 'next'
import { FeaturePageTemplate } from '@/components/feature-page-template'

export const metadata: Metadata = {
  title: 'VTOP Integration - Attendance, Marks, Grades | The Everything Assistant',
  description:
    'Access your VIT VTOP data through natural conversation. Check attendance, marks, grades, timetable, and more without navigating complex menus.',
  keywords: [
    'VIT VTOP',
    'VTOP integration',
    'VIT attendance',
    'VIT marks',
    'VIT grades',
    'VIT timetable',
    'VTOP helper',
    'VIT Vellore VTOP',
    'VIT student portal',
  ],
  openGraph: {
    title: 'VTOP Integration | The Everything Assistant',
    description: 'Access VIT VTOP data through natural conversation - attendance, marks, grades.',
    url: 'https://everything-assistant.com/features/vtop',
  },
  alternates: {
    canonical: 'https://everything-assistant.com/features/vtop',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'VTOP Integration',
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  description: 'Access VIT VTOP data through natural language conversation',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
  featureList: ['Attendance tracking', 'Marks viewer', 'Grade history', 'Timetable access'],
}

export default function VTOPPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FeaturePageTemplate
        iconName="GraduationCap"
        title="vtop integration"
        subtitle="your vtop, simplified"
        description="access attendance, marks, grades, timetable, and more through natural conversation"
        iconColor="text-cyan-400"
        gradient="from-cyan-500/20 to-blue-500/20"
        queries={[
          'show my attendance',
          "what's my cgpa?",
          'show my timetable',
          'check my marks',
          'any upcoming exams?',
          'show da deadlines',
        ]}
        features={[
          { title: 'attendance', description: '75% guardrails, bunk calculator, slot-wise view' },
          { title: 'marks', description: 'cat 1, cat 2, fat marks across all courses' },
          { title: 'grades', description: 'semester grades, cgpa history, grade trends' },
          { title: 'timetable', description: "today's classes, slot timings, venue info" },
          { title: 'calendar', description: 'exam dates, holidays, academic events' },
          { title: 'das', description: 'submission deadlines and status tracking' },
        ]}
        tips={[
          'your credentials are encrypted and never stored',
          'link your vtop once, access everything seamlessly',
          'ask in natural language - no need to memorize commands',
        ]}
        breadcrumb={[{ label: 'features', href: '/features' }]}
      />
    </>
  )
}
