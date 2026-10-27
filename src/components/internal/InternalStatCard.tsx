import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function InternalStatCard({
  title,
  value,
  hint,
  href,
  className,
}: {
  title: string
  value: React.ReactNode
  hint?: string
  href?: string
  className?: string
}) {
  const body = (
    <Card className={cn('h-full transition-colors', href && 'hover:border-primary/40', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
  if (href) {
    return (
      <Link href={href} className="block min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
        {body}
      </Link>
    )
  }
  return body
}
