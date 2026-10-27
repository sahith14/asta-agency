import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clapperboard, MonitorSmartphone, Film, CalendarCheck, ShieldCheck, BarChart3, ArrowRight, LogIn, UserPlus, Play } from 'lucide-react'

const SERVICES = [
  {
    icon: MonitorSmartphone,
    title: 'Website Agency',
    description: 'Design, development, revisions, approvals, deployment and maintenance — delivered end to end.',
    points: ['Custom design & build', 'Client approval workflows', 'Ongoing maintenance plans'],
  },
  {
    icon: Clapperboard,
    title: 'Video Production',
    description: 'Commercial shoots, food videos, social reels, property tours and corporate films — tracked frame by frame.',
    points: ['Monthly reels packages', 'Property & promotional videos', 'Full post-production pipeline'],
  },
]

const CATEGORIES = [
  'Restaurants', 'Cafés & Coffee Shops', 'Food & Beverage', 'Real Estate', 'Retail',
  'Hospitality', 'Corporate', 'Events', 'Personal Brands', 'Automotive', 'Healthcare',
]

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl flex h-16 items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-2 font-bold text-lg">
            <span className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <Clapperboard className="h-4 w-4" />
            </span>
            AgencyOS
          </div>
          <nav aria-label="Main" className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login"><LogIn className="h-4 w-4 mr-1.5" />Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/request-access"><UserPlus className="h-4 w-4 mr-1.5" />Sign up</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b bg-gradient-to-b from-muted/60 to-background">
          <div className="mx-auto max-w-6xl px-4 lg:px-6 py-16 lg:py-24 text-center">
            <Badge variant="outline" className="mb-4 border-primary/30 text-primary bg-primary/5">
              One platform · Two creative divisions
            </Badge>
            <h1 className="text-4xl lg:text-6xl font-bold tracking-tight text-balance">
              Your website. Your videos.<br />One studio, fully tracked.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
              AgencyOS runs our website agency and video production house side by side — one client relationship,
              separate connected projects, and every deliverable tracked from brief to final delivery.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" asChild>
                <Link href="/request-access">Request access <ArrowRight className="h-4 w-4 ml-1.5" /></Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login"><LogIn className="h-4 w-4 mr-1.5" />Client & team sign in</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Access is provisioned by our team — request an account and your account manager will set you up.
            </p>
          </div>
        </section>

        {/* Services */}
        <section className="mx-auto max-w-6xl px-4 lg:px-6 py-16" aria-labelledby="services-heading">
          <h2 id="services-heading" className="text-3xl font-bold text-center mb-10">What we do</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {SERVICES.map(s => (
              <Card key={s.title} className="border-2 hover:border-primary/40 transition-colors">
                <CardContent className="pt-6">
                  <div className="h-11 w-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{s.title}</h3>
                  <p className="text-muted-foreground text-sm mb-4">{s.description}</p>
                  <ul className="space-y-1.5">
                    {s.points.map(p => (
                      <li key={p} className="flex items-center gap-2 text-sm">
                        <Play className="h-3 w-3 text-primary shrink-0" /> {p}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-y bg-muted/40" aria-labelledby="how-heading">
          <div className="mx-auto max-w-6xl px-4 lg:px-6 py-16">
            <h2 id="how-heading" className="text-3xl font-bold text-center mb-10">How we work with you</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { icon: UserPlus, title: '1. Request access', text: 'Tell us about your business and what you need. We set up your account and portal.' },
                { icon: CalendarCheck, title: '2. Kick-off & schedule', text: 'We agree scope, dates and deliverables — shoots and milestones go straight into the studio calendar.' },
                { icon: Film, title: '3. Production & review', text: 'Watch progress in your portal. Review edits, leave feedback, approve the version you love.' },
                { icon: BarChart3, title: '4. Delivery & reports', text: 'Final files delivered with usage rights, invoices and progress always visible in one place.' },
              ].map(step => (
                <div key={step.title} className="rounded-lg border bg-background p-5">
                  <step.icon className="h-6 w-6 text-primary mb-3" />
                  <h3 className="font-semibold mb-1">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className="mx-auto max-w-6xl px-4 lg:px-6 py-16 text-center" aria-labelledby="cat-heading">
          <h2 id="cat-heading" className="text-3xl font-bold mb-3">Built for your industry</h2>
          <p className="text-muted-foreground mb-8">Specialist packages for food, property and corporate brands.</p>
          <div className="flex flex-wrap justify-center gap-2 max-w-3xl mx-auto">
            {CATEGORIES.map(c => (
              <Badge key={c} variant="secondary" className="px-3 py-1.5 text-sm">{c}</Badge>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t bg-primary text-primary-foreground">
          <div className="mx-auto max-w-6xl px-4 lg:px-6 py-14 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl font-bold">Ready to work with us?</h2>
              <p className="mt-1 text-primary-foreground/85">Request access and we&apos;ll provision your account — no self-service signup spam, a real account manager.</p>
            </div>
            <div className="flex gap-3">
              <Button size="lg" variant="secondary" asChild>
                <Link href="/request-access"><UserPlus className="h-4 w-4 mr-1.5" />Sign up</Link>
              </Button>
              <Button size="lg" variant="outline" className="bg-transparent text-primary-foreground border-primary-foreground/40 hover:bg-primary-foreground/10" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-6">
        <div className="mx-auto max-w-6xl px-4 lg:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" /> © {new Date().getFullYear()} AgencyOS Studio
          </div>
          <div>Website agency · Video production · Client portal</div>
        </div>
      </footer>
    </div>
  )
}
