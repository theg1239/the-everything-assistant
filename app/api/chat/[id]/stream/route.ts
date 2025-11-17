import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

interface StreamRouteParams {
  id: string
}

export async function GET(_req: Request, { params }: { params: Promise<StreamRouteParams> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return new Response('Bad Request', { status: 400 })
  }

  return new Response(null, { status: 204 })
}
