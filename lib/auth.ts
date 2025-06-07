import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && user.email) {
        try {
          // Check if user exists
          const existingUser = await sql`
            SELECT id FROM users WHERE email = ${user.email}
          `

          if (existingUser.length === 0) {
            // Create new user
            await sql`
              INSERT INTO users (email, name, image)
              VALUES (${user.email}, ${user.name}, ${user.image})
            `
          } else {
            // Update existing user
            await sql`
              UPDATE users 
              SET name = ${user.name}, image = ${user.image}, updated_at = NOW()
              WHERE email = ${user.email}
            `
          }
          return true
        } catch (error) {
          console.error("Error during sign in:", error)
          return false
        }
      }
      return true
    },
    async session({ session, token }) {
      if (session.user?.email) {
        try {
          const user = await sql`
            SELECT id, email, name, image FROM users WHERE email = ${session.user.email}
          `
          if (user.length > 0) {
            session.user.id = user[0].id
          }
        } catch (error) {
          console.error("Error fetching user:", error)
        }
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
})
