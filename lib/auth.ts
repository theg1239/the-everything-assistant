import { NextAuthOptions } from 'next-auth'
import { getServerSession } from 'next-auth/next'
import GoogleProvider from 'next-auth/providers/google'
import SpotifyProvider from 'next-auth/providers/spotify'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from '@/lib/prisma'
import type { PrismaClient as NextAuthPrismaClient } from '@/prisma/generated/client'

const prismaForAuth = prisma as unknown as NextAuthPrismaClient

type AuthProvider = ReturnType<typeof GoogleProvider> | ReturnType<typeof SpotifyProvider>

const providers: AuthProvider[] = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    authorization: {
      params: {
        prompt: 'consent',
        access_type: 'offline',
        response_type: 'code',
      },
    },
  }),
]

const hasSpotifyCreds = Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)

if (hasSpotifyCreds) {
  providers.push(
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID ?? '',
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? '',
      authorization:
        'https://accounts.spotify.com/authorize?scope=user-read-currently-playing%20user-read-playback-state%20user-modify-playback-state',
    })
  )
} else {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('Spotify credentials not set; Spotify integration is disabled')
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prismaForAuth),
  providers,
  session: {
    strategy: 'database',
  },
  callbacks: {
    session: async ({ session, user }) => {
      if (session.user) {
        session.user.id = user.id

        const userData = await prisma.user.findUnique({
          where: { id: user.id },
          select: { mfaEnabled: true },
        })

        session.requiresMFA = userData?.mfaEnabled || false
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
}

export const auth = () => getServerSession(authOptions)
