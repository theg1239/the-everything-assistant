import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { COURSE_MAP } from '@/lib/course-map'
import CourseClient from './course-client'

interface PageProps {
  params: Promise<{ code: string }>
}

export async function generateStaticParams() {
  return Object.keys(COURSE_MAP).map(code => ({
    code: code.toLowerCase(),
  }))
}

function findCourse(code: string): { code: string; name: string } | null {
  const upperCode = code.toUpperCase()
  if (COURSE_MAP[upperCode]) {
    return { code: upperCode, name: COURSE_MAP[upperCode] }
  }
  const found = Object.entries(COURSE_MAP).find(
    ([k]) => k.toLowerCase() === code.toLowerCase()
  )
  if (found) {
    return { code: found[0], name: found[1] }
  }
  return null
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params
  const course = findCourse(code)

  if (!course) {
    return {
      title: 'Course Not Found | Past Papers',
      description: 'The requested course was not found.',
    }
  }

  const title = `${course.code} ${course.name} Past Papers | VIT Question Papers`
  const description = `Download ${course.code} - ${course.name} previous year question papers, CAT papers, FAT papers, and quiz papers for VIT students. Free PDF access to help you prepare for exams.`

  return {
    title,
    description,
      keywords: [
      course.code,
      course.name,
      `${course.code} past papers`,
      `${course.code} question papers`,
      `${course.code} VIT`,
      `${course.name} exam papers`,
      'VIT question papers',
      'VIT past papers',
      'CAT papers',
      'FAT papers',
      `VIT Vellore ${course.name} past papers`,
      `${course.name} VIT Vellore past papers`,
      `${course.name} previous year papers`,
      `${course.code} CAT1 papers`,
      `${course.code} CAT2 papers`,
      `${course.code} FAT papers`,
      `${course.name} CAT1 papers`,
      `${course.name} CAT2 papers`,
      `${course.name} FAT papers`,
      `${course.name} CAT-1 papers`,
      `${course.name} CAT-2 papers`,
      `${course.code} CAT-1 papers`,
      `${course.code} CAT-2 papers`,
    ],
    openGraph: {
      title,
      description,
      type: 'website',
      url: `https://everything-assistant.com/features/past-papers/course/${code.toLowerCase()}`,
      siteName: 'Everything Assistant',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      canonical: `https://everything-assistant.com/features/past-papers/course/${code.toLowerCase()}`,
    },
  }
}

export default async function CoursePage({ params }: PageProps) {
  const { code } = await params
  const course = findCourse(code)

  if (!course) {
    notFound()
  }

  return <CourseClient courseCode={course.code} courseName={course.name} />
}
