import type { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    short_name: 'everything asst.',
    name: 'the everything assistant',
    start_url: '.',
    display: 'standalone',
    theme_color: '#000000',
    background_color: '#000000',
    icons: [
      {
        src: '/assets/tea-icon.png',
        type: 'image/png',
        sizes: '192x192',
      },
      {
        src: '/assets/tea-icon.png',
        type: 'image/png',
        sizes: '512x512',
      },
    ],
  }
}