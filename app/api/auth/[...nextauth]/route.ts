import NextAuth from 'next-auth'
import { checkBotId } from 'botid/server'
import { authOptions } from '@/lib/auth/options'

const handler = async (request: Request, context: any) => {
  if (request.method === 'POST') {
    try {
      if (process.env.DISABLE_BOTID !== 'true' && process.env.NODE_ENV !== 'development') {
        const verification = await checkBotId()
        if (verification.isBot) {
          return new Response(JSON.stringify({ error: 'Access denied' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }
    } catch (error) {
      console.warn('BotID verification failed:', error)
    }
  }

  return NextAuth(authOptions)(request, context)
}

export { handler as GET, handler as POST }
