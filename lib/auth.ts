import { NextAuthOptions } from 'next-auth'
import { getServerSession } from 'next-auth/next'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from './prisma'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
          hd: 'vitstudent.ac.in',
        },
      },
    }),
  ],
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
    signIn: async ({ user, account, profile }) => {
      return true
    },
  },
  pages: {
    signIn: '/login',
  },
}

export const auth = () => getServerSession(authOptions)
