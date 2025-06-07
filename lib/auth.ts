import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { Pool } from "@neondatabase/serverless"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true, // Required for Vercel deployment
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }: { 
      user: { email?: string | null; name?: string | null; image?: string | null };
      account: { provider?: string } | null;
      profile?: any;
    }) {
      if (account?.provider === "google" && user.email) {
        try {          // Check if user exists
          const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [user.email]
          )

          if (existingUser.rows.length === 0) {
            // Create new user
            await pool.query(
              'INSERT INTO users (email, name, image) VALUES ($1, $2, $3)',
              [user.email, user.name, user.image]
            )
          } else {
            // Update existing user
            await pool.query(
              'UPDATE users SET name = $1, image = $2, updated_at = NOW() WHERE email = $3',
              [user.name, user.image, user.email]
            )
          }
          return true
        } catch (error) {
          console.error("Error during sign in:", error)
          return false
        }
      }
      return true
    },    async session({ session, token }: { session: any; token: any }) {
      if (session.user?.email) {
        try {
          const user = await pool.query(
            'SELECT id, email, name, image FROM users WHERE email = $1',
            [session.user.email]
          )
          if (user.rows.length > 0) {
            session.user.id = user.rows[0].id
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
