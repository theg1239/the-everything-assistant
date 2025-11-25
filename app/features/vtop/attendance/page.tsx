import type { Metadata } from 'next'
import { FeaturePageTemplate } from '@/components/feature-page-template'

export const metadata: Metadata = {
  title: 'VIT Attendance Tracker - 75% Calculator | The Everything Assistant',
  description:
    'Track your VIT attendance with 75% guardrails. Calculate how many classes you can bunk, view slot-wise attendance, and never fall below the threshold.',
  keywords: [
    'VIT attendance',
    'VIT attendance tracker',
    'VIT 75% calculator',
    'VIT bunk calculator',
    'VIT attendance percentage',
    'VTOP attendance',
    'VIT Vellore attendance',
  ],
  openGraph: {
    title: 'VIT Attendance Tracker | The Everything Assistant',
    description: 'Track VIT attendance with 75% guardrails and bunk calculator.',
    url: 'https://everything-assistant.com/features/vtop/attendance',
  },
  alternates: {
    canonical: 'https://everything-assistant.com/features/vtop/attendance',
  },
}

export default function AttendancePage() {
  return (
    <FeaturePageTemplate
      iconName="BarChart3"
      title="attendance tracker"
      subtitle="stay above 75%"
      description="track attendance with smart guardrails, bunk calculator, and slot-wise breakdown"
      iconColor="text-purple-400"
      gradient="from-purple-500/20 to-pink-500/20"
      queries={[
        'show my attendance',
        'how many classes can i bunk',
        'which subjects are below 75%',
        'attendance for dsa',
        'slot-wise attendance',
        'attendance summary',
      ]}
      features={[
        { title: '75% guardrails', description: 'warnings when you\'re approaching the threshold' },
        { title: 'bunk calculator', description: 'know exactly how many classes you can skip' },
        { title: 'slot-wise view', description: 'see attendance broken down by each slot' },
        { title: 'course breakdown', description: 'individual attendance for each subject' },
      ]}
      tips={[
        'link your vtop to enable automatic tracking',
        'get alerts when any subject falls below 80%',
        'plan your leaves without risking attendance shortage',
      ]}
      breadcrumb={[
        { label: 'features', href: '/features' },
        { label: 'vtop', href: '/features/vtop' },
      ]}
    />
  )
}
