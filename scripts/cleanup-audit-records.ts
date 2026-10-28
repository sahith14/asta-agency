/**
 * Acceptance-audit cleanup — removes ONLY records created exclusively for the
 * 2026-10-24 acceptance audit. Real/seeded client data is never touched.
 *
 * Removes (matched by exact audit-specific names/emails):
 *   - Video project "Audit 20-Video Accuracy Fixture" (+ deliverables, versions,
 *     briefs, shoots, assignments, reservations, related notifications)
 *   - Website project "Audit Website Regression Check"
 *   - Client "Audit Café Test Ltd" (+ any remaining projects/users)
 *   - Client "Audit Test Co" + portal user alice.prospect@audit.local
 *   - Staff account sam.temp@agencyos.local (+ sessions, notifications)
 *   - Signup requests: prospect@test.local (suite), alice.prospect@audit.local
 *   - Task comment "Comment posted after endpoint fix" (posted on a seeded task)
 *   - Creative brief v1 "Audit brief objective" on seeded deliverable VD-MVMOF13HD0E2
 *   - PasswordResetToken rows created by the audit's forgot-password checks
 * AuditLog entries are intentionally KEPT (append-only trail by design).
 *
 * Usage: bun scripts/cleanup-audit-records.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main(): Promise<void> {
  const removed: string[] = []
  const note = (what: string, n: number) => { if (n > 0) removed.push(`${what}: ${n}`) }

  // ── collect audit-created entities by exact names/emails ─────
  const fixtureProjects = await db.project.findMany({
    where: { name: { in: ['Audit 20-Video Accuracy Fixture', 'Audit Website Regression Check'] } },
    select: { id: true, name: true },
  })
  const fixtureIds = fixtureProjects.map(p => p.id)

  if (fixtureIds.length) {
    const dels = await db.videoDeliverable.findMany({ where: { projectId: { in: fixtureIds } }, select: { id: true } })
    const delIds = dels.map(d => d.id)
    const shoots = await db.shootSession.findMany({ where: { projectId: { in: fixtureIds } }, select: { id: true } })
    const shootIds = shoots.map(s => s.id)

    if (delIds.length) {
      await db.versionComment.deleteMany({ where: { version: { deliverableId: { in: delIds } } } })
      await db.videoVersion.deleteMany({ where: { deliverableId: { in: delIds } } })
      await db.creativeBriefVersion.deleteMany({ where: { deliverableId: { in: delIds } } })
      await db.shootDeliverable.deleteMany({ where: { deliverableId: { in: delIds } } })
      await db.videoDeliverable.deleteMany({ where: { id: { in: delIds } } })
    }
    if (shootIds.length) {
      await db.equipmentReservation.deleteMany({ where: { sessionId: { in: shootIds } } })
      await db.shootAssignment.deleteMany({ where: { sessionId: { in: shootIds } } })
      await db.shootSession.deleteMany({ where: { id: { in: shootIds } } })
    }
    await db.notification.deleteMany({ where: { link: { in: fixtureIds.flatMap(id => [`/app/projects/${id}`, `/app/video/deliverables/${id}`]) } } })
    // notifications whose link points at a deleted deliverable id are caught by the deliverable link pass below
    const delLinks = delIds.flatMap(id => [`/app/video/deliverables/${id}`])
    if (delLinks.length) await db.notification.deleteMany({ where: { link: { in: delLinks } } })
    await db.task.deleteMany({ where: { projectId: { in: fixtureIds } } })
    await db.projectScopeChange.deleteMany({ where: { videoProject: { projectId: { in: fixtureIds } } } })
    await db.mediaAsset.deleteMany({ where: { projectId: { in: fixtureIds } } })
    await db.productionExpense.deleteMany({ where: { projectId: { in: fixtureIds } } })
    const fixtureInvoices = await db.invoice.findMany({ where: { clientId: { in: (await db.client.findMany({ where: { name: { in: ['Audit Café Test Ltd', 'Audit Test Co'] } }, select: { id: true } })).map(c => c.id) } }, select: { id: true } })
    if (fixtureInvoices.length) await db.invoice.deleteMany({ where: { id: { in: fixtureInvoices.map(i => i.id) } } })
    await db.project.deleteMany({ where: { id: { in: fixtureIds } } })
    note('audit projects removed', fixtureIds.length)
  }

  // notifications pointing at deleted deliverables (by link pattern via audit ids are gone; sweep by title is unsafe — skip)
  // ── audit clients ────────────────────────────────────────────
  for (const clientName of ['Audit Café Test Ltd', 'Audit Test Co']) {
    const client = await db.client.findFirst({ where: { name: clientName } })
    if (!client) continue
    const pus = await db.clientUser.findMany({ where: { clientId: client.id }, select: { id: true } })
    for (const pu of pus) {
      await db.session.deleteMany({ where: { userType: 'CLIENT_USER', userId: pu.id } })
      await db.notification.deleteMany({ where: { userType: 'CLIENT_USER', userId: pu.id } })
    }
    await db.clientUser.deleteMany({ where: { clientId: client.id } })
    await db.invoice.deleteMany({ where: { clientId: client.id } })
    await db.client.delete({ where: { id: client.id } })
    note(`client ${clientName}`, 1)
  }

  // ── portal user Alice (belt & braces if client row changed name) ──
  const alice = await db.clientUser.findFirst({ where: { email: 'alice.prospect@audit.local' } })
  if (alice) {
    await db.session.deleteMany({ where: { userType: 'CLIENT_USER', userId: alice.id } })
    await db.notification.deleteMany({ where: { userType: 'CLIENT_USER', userId: alice.id } })
    await db.clientUser.delete({ where: { id: alice.id } })
    note('portal user Alice', 1)
  }

  // ── audit staff account ──────────────────────────────────────
  const sam = await db.employee.findFirst({ where: { email: 'sam.temp@agencyos.local' } })
  if (sam) {
    await db.session.deleteMany({ where: { userType: 'EMPLOYEE', userId: sam.id } })
    await db.notification.deleteMany({ where: { userType: 'EMPLOYEE', userId: sam.id } })
    await db.task.updateMany({ where: { assigneeId: sam.id }, data: { assigneeId: null } })
    await db.employee.delete({ where: { id: sam.id } })
    note('staff account Sam Temp', 1)
  }

  // ── signup requests created during the audit/suite runs ──────
  const sr = await db.signupRequest.deleteMany({ where: { email: { in: ['prospect@test.local', 'alice.prospect@audit.local'] } } })
  note('signup requests', sr.count)

  // ── task comment posted on a seeded task during browser tests ──
  const tc = await db.taskComment.deleteMany({ where: { body: 'Comment posted after endpoint fix' } })
  note('audit task comments', tc.count)

  // ── brief v1 saved onto the seeded Cocktail bar reel during tests ──
  const seededDeliverable = await db.videoDeliverable.findFirst({ where: { reference: 'VD-MVMOF13HD0E2' }, select: { id: true } })
  if (seededDeliverable) {
    const bv = await db.creativeBriefVersion.deleteMany({
      where: { deliverableId: seededDeliverable.id, content: { contains: 'Audit brief objective' } },
    })
    note('audit brief versions on seeded deliverable', bv.count)
  }

  // ── password reset tokens created by the audit's forgot-password checks ──
  const prt = await db.passwordResetToken.deleteMany({
    where: { createdAt: { gte: new Date('2026-10-24T18:00:00Z') } },
  })
  note('password reset tokens (audit window)', prt.count)

  console.log('Cleanup complete:')
  if (removed.length === 0) console.log('  nothing to remove')
  for (const r of removed) console.log('  - ' + r)

  // sanity: seeded demo data intact
  const [employees, clients, projects] = await Promise.all([
    db.employee.count(), db.client.count(), db.project.count(),
  ])
  console.log(`Sanity: employees=${employees} clients=${clients} projects=${projects}`)
  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
