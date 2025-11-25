import type { MetadataRoute } from 'next'

const BASE_URL = 'https://everything-assistant.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/mgmt/',
          '/dev/',
          '/chat/*', // Individual chat sessions shouldn't be indexed
          '/share/*', // Share links are private
          '/_next/',
          '/workflows/',
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: ['/api/', '/mgmt/', '/dev/', '/chat/*', '/share/*', '/_next/', '/workflows/'],
      },
      {
        userAgent: 'Bingbot',
        allow: '/',
        disallow: ['/api/', '/mgmt/', '/dev/', '/chat/*', '/share/*', '/_next/', '/workflows/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}
