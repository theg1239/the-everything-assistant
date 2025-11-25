import type { Metadata } from 'next'
import { FeaturePageTemplate } from '@/components/feature-page-template'

export const metadata: Metadata = {
  title: 'VIT Academic Calendar 2024-25 | Exam Dates & Holidays',
  description:
    'View VIT academic calendar for 2024-25. Get exam schedules, CAT FAT dates, holidays, semester dates, and important academic events.',
  keywords: [
    'VIT academic calendar',
    'VIT exam dates',
    'VIT CAT dates',
    'VIT FAT dates',
    'VIT holidays',
    'VIT semester dates',
    'VIT calendar 2024',
    'VIT calendar 2025',
  ],
  openGraph: {
    title: 'VIT Academic Calendar 2024-25 | The Everything Assistant',
    description: 'View VIT academic calendar - exam dates, holidays, and semester schedules.',
    url: 'https://everything-assistant.com/features/vtop/calendar',
  },
  alternates: {
    canonical: 'https://everything-assistant.com/features/vtop/calendar',
  },
}

export default function CalendarPage() {
  return (
    <FeaturePageTemplate
      iconName="Calendar"
      title="academic calendar"
      subtitle="stay prepared"
      description="exam dates, holidays, semester schedules, and important academic events"
      iconColor="text-rose-400"
      gradient="from-rose-500/20 to-pink-500/20"
      queries={[
        'when is cat 1',
        'show fat dates',
        'vit holidays',
        'when does semester end',
        'exam schedule',
        'next holiday',
      ]}
      features={[
        { title: 'exam dates', description: 'cat 1, cat 2, fat exam schedules' },
        { title: 'holidays', description: 'official vit holidays and breaks' },
        { title: 'semester dates', description: 'start, end, and registration dates' },
        { title: 'working days', description: 'instructional days and makeup classes' },
      ]}
      tips={[
        'ask about specific exams like "when is cat 1"',
        'get holiday lists for planning ahead',
        'never miss important academic deadlines',
      ]}
      breadcrumb={[
        { label: 'features', href: '/features' },
        { label: 'vtop', href: '/features/vtop' },
      ]}
    />
  )
}
