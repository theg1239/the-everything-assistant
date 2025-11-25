import type { Metadata } from 'next'
import { FeaturePageTemplate } from '@/components/feature-page-template'

export const metadata: Metadata = {
  title: 'VIT Timetable & Class Schedule | The Everything Assistant',
  description:
    'View your VIT timetable and class schedule instantly. See today\'s classes, slot timings, venues, and faculty details. Never miss a class again.',
  keywords: [
    'VIT timetable',
    'VIT class schedule',
    'VIT slot timings',
    'VIT today classes',
    'VTOP timetable',
    'VIT academic schedule',
    'VIT venue finder',
  ],
  openGraph: {
    title: 'VIT Timetable & Class Schedule | The Everything Assistant',
    description: 'View VIT timetable - today\'s classes, slot timings, and venues.',
    url: 'https://everything-assistant.com/features/vtop/timetable',
  },
  alternates: {
    canonical: 'https://everything-assistant.com/features/vtop/timetable',
  },
}

export default function TimetablePage() {
  return (
    <FeaturePageTemplate
      iconName="Clock"
      title="timetable"
      subtitle="never miss a class"
      description="view your class schedule, today's classes, slot timings, and venue information"
      iconColor="text-indigo-400"
      gradient="from-indigo-500/20 to-violet-500/20"
      queries={[
        'show my timetable',
        "what classes do i have today",
        'next class',
        'classes on monday',
        'show slot timings',
        'where is my next class',
      ]}
      features={[
        { title: "today's classes", description: 'see all your classes for the day' },
        { title: 'weekly view', description: 'complete weekly timetable grid' },
        { title: 'slot timings', description: 'exact start and end times for each slot' },
        { title: 'venue info', description: 'know exactly where to go' },
      ]}
      tips={[
        'ask "next class" for quick access to upcoming class',
        'get notifications before classes start',
        'view classes by day of the week',
      ]}
      breadcrumb={[
        { label: 'features', href: '/features' },
        { label: 'vtop', href: '/features/vtop' },
      ]}
    />
  )
}
