import Link from 'next/link'
import { db } from '@/lib/db'
import { requirePageUser } from './_lib'
import { ROLES, ROLE_LABELS, TASK_STATUSES } from '@/lib/constants'
import { formatGBP, formatDate, formatDateTime, relativeTime, humanizeStatus } from '@/lib/format'
import { InternalStatusBadge } from '@/components/internal/InternalStatusBadge'
import { InternalStatCard } from '@/components/internal/InternalStatCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

const ACTIVE_PROJECT_STATUSES = ['DISCOVERY', 'BUILD', 'REVIEW', 'LAUNCH']
const OPEN_TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CLIENT']

export default async function DashboardPage() {
  const user = await requirePageUser()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">Welcome back, {user.name.split(' ')[0]}</h1>
        <p className="text-sm text-muted-foreground">
          {ROLE_LABELS[user.role]} dashboard — live operational data.
        </p>
      </div>
      {user.role === ROLES.FOUNDER ? <FounderDashboard userId={user.id} /> : null}
      {user.role === ROLES.CLIENT_MANAGER ? <ManagerDashboard /> : null}
      {user.role === ROLES.WEB_DEVELOPER ? <DeveloperDashboard userId={user.id} /> : null}
      {user.role === ROLES.SUPPORT_FINANCE ? <FinanceDashboard /> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FOUNDER
// ---------------------------------------------------------------------------

async function FounderDashboard({ userId }: { userId: string }) {
  const [totalClients, activeProjects, openTickets, outstanding, demosAwaiting, crsSubmitted, recentAudit, recentNotifications] =
    await Promise.all([
      db.client.count(),
      db.project.count({ where: { status: { in: ACTIVE_PROJECT_STATUSES } } }),
      db.supportTicket.count({ where: { status: { in: OPEN_TICKET_STATUSES } } }),
      db.invoice.aggregate({ _sum: { amountCents: true }, where: { status: { in: ['ISSUED', 'OVERDUE'] } } }),
      db.demo.count({ where: { status: 'READY_FOR_FOUNDER' } }),
      db.changeRequest.count({ where: { status: 'SUBMITTED' } }),
      db.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { actor: { select: { name: true } } },
      }),
      db.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 8 }),
    ])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <InternalStatCard title="Clients" value={totalClients} href="/app/clients" hint="All client businesses" />
        <InternalStatCard title="Active projects" value={activeProjects} href="/app/projects" hint="Discovery → launch" />
        <InternalStatCard title="Open tickets" value={openTickets} href="/app/tickets" hint="Awaiting resolution" />
        <InternalStatCard
          title="Outstanding invoices"
          value={formatGBP(outstanding._sum.amountCents ?? 0)}
          href="/app/finance"
          hint="Issued + overdue"
        />
        <InternalStatCard
          title="Demos awaiting authorization"
          value={demosAwaiting}
          href="/app/demos"
          hint="Ready for founder review"
        />
        <InternalStatCard title="Change requests" value={crsSubmitted} href="/app/change-requests" hint="Newly submitted" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent audit log</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-3 overflow-y-auto">
            {recentAudit.length === 0 ? <p className="text-sm text-muted-foreground">No audit entries yet.</p> : null}
            {recentAudit.map((entry) => (
              <div key={entry.id} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{entry.action.replace(/_/g, ' ').toLowerCase()}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(entry.createdAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {entry.actor?.name ?? 'System'} · {entry.result}
                  {entry.entityType ? ` · ${entry.entityType}` : ''}
                </p>
                <Separator className="mt-3" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent notifications</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-3 overflow-y-auto">
            {recentNotifications.length === 0 ? <p className="text-sm text-muted-foreground">No notifications yet.</p> : null}
            {recentNotifications.map((n) => (
              <div key={n.id} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Link href={n.link ?? '/app'} className="font-medium hover:underline">
                    {n.title}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(n.createdAt)}</span>
                </div>
                {n.body ? <p className="text-xs text-muted-foreground">{n.body}</p> : null}
                <Separator className="mt-3" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CLIENT_MANAGER
// ---------------------------------------------------------------------------

async function ManagerDashboard() {
  const [totalClients, activeProjects, openTickets, demosInFlight, crsAwaiting, recentTasks] = await Promise.all([
    db.client.count(),
    db.project.count({ where: { status: { in: ACTIVE_PROJECT_STATUSES } } }),
    db.supportTicket.count({ where: { status: { in: OPEN_TICKET_STATUSES } } }),
    db.demo.count({ where: { status: { in: ['PREPARING', 'READY_FOR_FOUNDER'] } } }),
    db.changeRequest.count({ where: { status: { in: ['SUBMITTED', 'UNDER_FOUNDER_REVIEW'] } } }),
    db.task.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        project: { select: { id: true, name: true } },
        assignedTo: { select: { name: true } },
      },
    }),
  ])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <InternalStatCard title="Clients" value={totalClients} href="/app/clients" hint="All client businesses" />
        <InternalStatCard title="Active projects" value={activeProjects} href="/app/projects" hint="Discovery → launch" />
        <InternalStatCard title="Open tickets" value={openTickets} href="/app/tickets" hint="Awaiting resolution" />
        <InternalStatCard title="Demos in flight" value={demosInFlight} href="/app/demos" hint="Preparing or awaiting founder" />
        <InternalStatCard title="CRs awaiting review" value={crsAwaiting} href="/app/change-requests" hint="Submitted or in founder review" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recent tasks</CardTitle>
        </CardHeader>
        <CardContent className="max-h-96 space-y-3 overflow-y-auto">
          {recentTasks.length === 0 ? <p className="text-sm text-muted-foreground">No tasks yet.</p> : null}
          {recentTasks.map((t) => (
            <div key={t.id} className="text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/app/projects/${t.projectId}`} className="font-medium hover:underline">
                  {t.title}
                </Link>
                <InternalStatusBadge status={t.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                {t.project.name} · {t.assignedTo?.name ? `Assigned to ${t.assignedTo.name}` : 'Unassigned'} · {humanizeStatus(t.priority)} priority
                {t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ''}
              </p>
              <Separator className="mt-3" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// WEB_DEVELOPER
// ---------------------------------------------------------------------------

async function DeveloperDashboard({ userId }: { userId: string }) {
  const [projects, myTasks] = await Promise.all([
    db.project.findMany({
      where: { assignedToId: userId },
      orderBy: { updatedAt: 'desc' },
      include: { client: { select: { name: true } } },
    }),
    db.task.findMany({
      where: {
        OR: [{ assignedToId: userId }, { project: { assignedToId: userId } }],
        status: { not: 'DONE' },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      include: { project: { select: { id: true, name: true } } },
    }),
  ])

  const in7Days = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  const dueSoon = myTasks.filter((t) => t.dueDate && t.dueDate.getTime() <= in7Days.getTime())
  const groups = TASK_STATUSES.filter((s) => s !== 'DONE').map((status) => ({
    status,
    tasks: myTasks.filter((t) => t.status === status),
  }))

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Assigned projects</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects assigned to you yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {projects.map((p) => (
              <Link key={p.id} href={`/app/projects/${p.id}`} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold leading-snug">{p.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground">{p.client.name}</p>
                    <InternalStatusBadge status={p.status} />
                    <p className="text-xs text-muted-foreground">Target launch: {formatDate(p.targetLaunchDate)}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">My tasks by status</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {groups.map((g) => (
            <Card key={g.status}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  {humanizeStatus(g.status)}
                  <span className="text-muted-foreground">{g.tasks.length}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-72 space-y-2 overflow-y-auto">
                {g.tasks.length === 0 ? <p className="text-xs text-muted-foreground">Nothing here.</p> : null}
                {g.tasks.map((t) => (
                  <Link
                    key={t.id}
                    href={`/app/tasks?project=${t.project.id}`}
                    className="block min-h-[44px] rounded-lg border p-2 text-sm transition-colors hover:bg-accent"
                  >
                    <p className="font-medium leading-snug">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.project.name}
                      {t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ''} · {humanizeStatus(t.priority)}
                    </p>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Due within 7 days</h2>
        <Card>
          <CardContent className="max-h-96 space-y-3 overflow-y-auto pt-4">
            {dueSoon.length === 0 ? <p className="text-sm text-muted-foreground">Nothing due in the next 7 days.</p> : null}
            {dueSoon.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <p className="font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground">{t.project.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">due {formatDate(t.dueDate)}</span>
                  <InternalStatusBadge status={t.priority} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SUPPORT_FINANCE
// ---------------------------------------------------------------------------

async function FinanceDashboard() {
  const [openTickets, unpaidAgg, unpaidCount, pendingPayments, openBillingQs] = await Promise.all([
    db.supportTicket.count({ where: { status: { in: OPEN_TICKET_STATUSES } } }),
    db.invoice.aggregate({ _sum: { amountCents: true }, where: { status: { in: ['ISSUED', 'OVERDUE'] } } }),
    db.invoice.count({ where: { status: { in: ['ISSUED', 'OVERDUE'] } } }),
    db.payment.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { invoice: { select: { number: true, client: { select: { name: true } } } } },
    }),
    db.billingQuestion.findMany({
      where: { status: { in: ['OPEN', 'IN_REVIEW'] } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { client: { select: { name: true } } },
    }),
  ])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <InternalStatCard title="Open tickets" value={openTickets} href="/app/tickets" hint="Awaiting resolution" />
        <InternalStatCard
          title="Unpaid invoices"
          value={unpaidCount}
          href="/app/finance"
          hint={`${formatGBP(unpaidAgg._sum.amountCents ?? 0)} outstanding`}
        />
        <InternalStatCard title="Payments pending verification" value={pendingPayments.length} href="/app/finance" hint="Bank transfers to check" />
        <InternalStatCard title="Open billing questions" value={openBillingQs.length} href="/app/finance" hint="Questions & cancellations" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Payments awaiting verification</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-3 overflow-y-auto">
            {pendingPayments.length === 0 ? <p className="text-sm text-muted-foreground">No pending payments.</p> : null}
            {pendingPayments.map((p) => (
              <div key={p.id} className="text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{p.invoice.number}</span>
                  <span>{formatGBP(p.amountCents)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.invoice.client.name} · {humanizeStatus(p.method)} · {formatDateTime(p.createdAt)}
                </p>
                <Separator className="mt-3" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Open billing questions</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-3 overflow-y-auto">
            {openBillingQs.length === 0 ? <p className="text-sm text-muted-foreground">No open billing questions.</p> : null}
            {openBillingQs.map((q) => (
              <div key={q.id} className="text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{q.subject}</span>
                  <InternalStatusBadge status={q.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {q.client.name} · {humanizeStatus(q.type)} · {formatDate(q.createdAt)}
                </p>
                <Separator className="mt-3" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
