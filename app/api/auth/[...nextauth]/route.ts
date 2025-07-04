import NextAuth from 'next-auth'
import { checkBotId } from 'botid/server'
import { authOptions } from '@/lib/auth'

const handler = async (request: Request, context: any) => {
  // Check for bot protection on POST requests (login attempts)
  if (request.method === 'POST') {
    try {
      // Skip BotID in development mode
      if (process.env.NODE_ENV !== 'development') {
        const verification = await checkBotId()
        if (verification.isBot) {
          return new Response(
            JSON.stringify({ error: 'Access denied' }), 
            { 
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            }
          )
        }
      }
    } catch (error) {
      console.warn('BotID verification failed:', error)
      // Continue with request if BotID check fails to avoid blocking legitimate users
    }
  }

  return NextAuth(authOptions)(request, context)
}

export { handler as GET, handler as POST }
