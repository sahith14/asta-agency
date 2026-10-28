import { SignupForm } from './signup-form'

export const metadata = { title: 'Request access — AgencyOS' }

export default function SignupPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[color:oklch(0.95_0.025_150)] to-background px-4 py-10">
      <div className="w-full max-w-xl">
        <SignupForm />
      </div>
    </main>
  )
}
