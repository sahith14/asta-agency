import { ChangePasswordForm } from './change-password-form'
import { AuthBackdrop } from '@/components/auth/auth-backdrop'

export default function ChangePasswordPage() {
  return (
    <main className="site-scope relative flex flex-1 items-center justify-center overflow-hidden bg-background px-4 py-12 lg:py-16">
      <AuthBackdrop />
      <div className="relative z-10 w-full max-w-md">
        <ChangePasswordForm />
      </div>
    </main>
  )
}
