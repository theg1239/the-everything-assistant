import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { COURSE_MAP } from '@/lib/course-map'
import CourseClient from './course-client'

interface PageProps {
  params: Promise<{ code: string }>
}

// Generate static params for all courses
export async function generateStaticParams() {
  return Object.keys(COURSE_MAP).map(code => ({
    code: code.toLowerCase(),
  }))
}

// Find course by case-insensitive code
function findCourse(code: string): { code: string; name: string } | null {
  const upperCode = code.toUpperCase()
  if (COURSE_MAP[upperCode]) {
    return { code: upperCode, name: COURSE_MAP[upperCode] }
  }
  // Try to find with different casing patterns
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
