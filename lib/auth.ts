import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { prisma } from "./prisma"
import type { Session, User } from "next-auth"


export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          hd: "vitstudent.ac.in"
        }
      }
    }),
  ],
  session: {
    strategy: "database" as const
  },
  callbacks: {
    session({ session, user }: { session: Session; user: User }) {
      if (session.user && user && user.id) {
        session.user.id = user.id || ""
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
}

export const GET = async (req: Request, ctx?: { params: any }) => {
  return await NextAuth(authOptions).GET(req, ctx)
}

export const POST = async (req: Request, ctx?: { params: any }) => {
  return await NextAuth(authOptions).POST(req, ctx)
}

const nextAuthHandler = NextAuth(authOptions)
export const auth = nextAuthHandler.auth
export const signIn = nextAuthHandler.signIn
export const signOut = nextAuthHandler.signOut