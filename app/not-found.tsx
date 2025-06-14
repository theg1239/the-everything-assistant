'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Suspense } from 'react'

function NotFoundContent() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">404 - Page Not Found</CardTitle>
          <CardDescription className="text-center">
            The page you are looking for doesn't exist or has been moved.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          <p className="text-center text-muted-foreground">
            Sorry, we couldn't find the page you were looking for. Please check the URL or go back
            to the homepage.
          </p>
          <Button asChild>
            <Link href="/">Return to Home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default function NotFound() {
  return (
    <Suspense
      fallback={<div className="flex items-center justify-center min-h-[100dvh]">Loading...</div>}
    >
      <NotFoundContent />
    </Suspense>
  )
}
