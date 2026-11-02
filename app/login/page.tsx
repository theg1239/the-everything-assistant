import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { LoginForm } from '@/components/login-form'
import { LoginFloatingBackground } from '@/components/login-floating-background'

export default async function LoginPage() {
  const session = await auth()

  if (session?.user) {
    redirect('/')
  }

  return (
    <LoginFloatingBackground>
      <LoginForm />
    </LoginFloatingBackground>
  )
}
