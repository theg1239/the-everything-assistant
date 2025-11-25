import type { Metadata } from 'next'
import { FeaturePageTemplate } from '@/components/feature-page-template'

export const metadata: Metadata = {
  title: 'VIT Grades & CGPA Tracker | The Everything Assistant',
  description:
    'Track your VIT grades and CGPA in real-time. View CAT, FAT marks, semester grades, grade history, and calculate your GPA instantly.',
  keywords: [
    'VIT grades',
    'VIT CGPA',
    'VIT GPA calculator',
    'VIT semester grades',
    'VIT marks',
    'VTOP grades',
    'VIT academic performance',
    'VIT grade history',
  ],
  openGraph: {
    title: 'VIT Grades & CGPA Tracker | The Everything Assistant',
    description: 'Track VIT grades and CGPA - view marks, semester grades, and grade history.',
    url: 'https://everything-assistant.com/features/vtop/grades',
  },
  alternates: {
    canonical: 'https://everything-assistant.com/features/vtop/grades',
  },
}

export default function GradesPage() {
  return (
    <FeaturePageTemplate
      iconName="Award"
      title="grades & cgpa"
      subtitle="track your progress"
      description="view semester grades, cgpa history, cat/fat marks, and track your academic journey"
      iconColor="text-amber-400"
      gradient="from-amber-500/20 to-yellow-500/20"
      queries={[
        'show my grades',
        "what's my cgpa",
        'show cat 1 marks',
        'semester 3 grades',
        'show fat marks',
        'grade history',
      ]}
      features={[
        { title: 'semester grades', description: 'all grades organized by semester' },
        { title: 'cgpa tracking', description: 'cumulative gpa across all semesters' },
        { title: 'cat/fat marks', description: 'continuous assessment and final marks' },
        { title: 'grade trends', description: 'see how your performance changes over time' },
      ]}
      tips={[
        'ask for specific semester or course grades',
        'compare marks across different courses',
        'track improvement semester by semester',
      ]}
      breadcrumb={[
        { label: 'features', href: '/features' },
        { label: 'vtop', href: '/features/vtop' },
      ]}
    />
  )
}
