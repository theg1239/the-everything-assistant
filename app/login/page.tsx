import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { LoginForm } from '@/components/login-form'
import { LoginFloatingBackground } from '@/components/login-floating-background'

export default async function LoginPage() {
  const session = await getServerSession(authOptions)

  if (session?.user) {
    redirect('/')
  }

  return (
    <LoginFloatingBackground>
      <LoginForm />
    </LoginFloatingBackground>
  )
}
