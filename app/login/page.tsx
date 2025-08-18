import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { LoginForm } from '@/components/auth/login-form'

export default async function LoginPage() {
  const session = await getServerSession(authOptions)

  if (session?.user) {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
      <LoginForm />
    </div>
  )
}
