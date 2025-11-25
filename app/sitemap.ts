import type { MetadataRoute } from 'next'
import { COURSE_MAP } from '@/lib/course-map'

const BASE_URL = 'https://everything-assistant.com'

const featurePages = [
  { url: '/features', changeFrequency: 'weekly' as const, priority: 0.95 },

  { url: '/features/vtop', changeFrequency: 'weekly' as const, priority: 0.9 },
  { url: '/features/vtop/attendance', changeFrequency: 'weekly' as const, priority: 0.8 },
  { url: '/features/vtop/marks', changeFrequency: 'weekly' as const, priority: 0.8 },
  { url: '/features/vtop/timetable', changeFrequency: 'weekly' as const, priority: 0.8 },
  { url: '/features/vtop/grades', changeFrequency: 'weekly' as const, priority: 0.8 },
  { url: '/features/vtop/calendar', changeFrequency: 'weekly' as const, priority: 0.8 },

  { url: '/features/past-papers', changeFrequency: 'daily' as const, priority: 0.9 },

  { url: '/features/mess-menu', changeFrequency: 'daily' as const, priority: 0.8 },
]

// Subject slugs for topic-based pages
const subjectSlugs = [
  // Core Sciences
  'mathematics', 'physics', 'chemistry', 'calculus', 'linear-algebra',
  'probability-statistics', 'discrete-mathematics',
  // Computer Science Core
  'computer-science', 'data-structures', 'database-systems', 'operating-systems',
  'computer-networks', 'computer-architecture', 'theory-of-computation',
  'compiler-design', 'software-engineering',
  // AI/ML
  'machine-learning', 'artificial-intelligence', 'deep-learning', 'data-mining',
  // Electronics
  'digital-electronics', 'microprocessors', 'vlsi-design', 'signals-systems', 'embedded-systems',
  // Web & Security
  'web-technologies', 'information-security', 'cryptography',
  // Other
  'cloud-computing', 'internet-of-things', 'big-data',
]

export default function sitemap(): MetadataRoute.Sitemap {
  const currentDate = new Date()

  // Main pages
  const mainPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/login`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ]

  // Feature pages
  const featureSitemap: MetadataRoute.Sitemap = featurePages.map(page => ({
    url: `${BASE_URL}${page.url}`,
    lastModified: currentDate,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }))

  // Subject-based paper pages (topic slugs)
  const subjectPaperPages: MetadataRoute.Sitemap = subjectSlugs.map(subject => ({
    url: `${BASE_URL}/features/past-papers/subject/${subject}`,
    lastModified: currentDate,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  // All course codes from COURSE_MAP for comprehensive SEO
  // Generates URLs like /features/past-papers/course/bcse202l
  const courseCodePages: MetadataRoute.Sitemap = Object.keys(COURSE_MAP).map(code => ({
    url: `${BASE_URL}/features/past-papers/course/${code.toLowerCase()}`,
    lastModified: currentDate,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  return [...mainPages, ...featureSitemap, ...subjectPaperPages, ...courseCodePages]
}
