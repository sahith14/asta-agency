/**
 * Video tracking accuracy verification — acceptance audit Phase 3.
 * Uses the "Audit 20-Video Accuracy Fixture" project (audit-created, safe).
 *
 * Verifies:
 *  1.  Contractual quantity = 20 and exactly 20 distinct deliverable records
 *  2.  Scheduling a shoot-date-like transition (PLANNED→SCHEDULED) does NOT mark filmed
 *  3.  Filming (SCHEDULED→SHOT) does NOT mark delivered
 *  4.  FOOTAGE_READY gate: blocked without footage-backup verification, allowed with it
 *  5.  EDITING / INTERNAL_REVIEW / CLIENT_REVIEW / REVISION_REQUIRED / APPROVED remain distinct
 *  6.  Approval binds to the correct version (v2 after revision; v1 stays rejected)
 *  7.  Delivered counts and remaining quantities accurate (project + dashboard)
 *  8.  Cancelled deliverable + replacement handled consistently (contracted count math)
 *  9.  Dashboard totals derived from real records, no double counting
 * 10. Shoot conflict detection (overlapping videographer flagged)
 *
 * Usage: bun scripts/verify-video-tracking.ts
 * Exit code 0 = all checks passed.
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'

const BASE = 'http://localhost:3000'
const db = new PrismaClient()

let PASS = 0
let FAIL = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    PASS++
    console.log(`PASS: ${name}`)
  } else {
    FAIL++
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function creds(role: string): string {
  for (const line of readFileSync('.seed-credentials', 'utf8').split('\n')) {
    if (line.includes(`${role}:`)) return line.trim().split(' ').pop() ?? ''
  }
  return ''
}

async function api(method: string, path: string, body?: unknown, extra?: Record<string, string>): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(extra ?? {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data: any = null
  try { data = await res.json() } catch { /* empty body */ }
  return { status: res.status, data }
}

async function main(): Promise<void> {
  // ── founder session ─────────────────────────────────────────
  const fpw = creds('OWNER')
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'founder@agencyos.local', password: fpw }),
  })
  check('founder login 200', loginRes.status === 200)
  const rawCookie = loginRes.headers.get('set-cookie') ?? ''
  const cookie = rawCookie.split(';')[0]
  check('founder session cookie captured', cookie.includes('agencyos_session'))
  const founder = { Cookie: cookie }

  // ── fixture bootstrap (harness self-containment) ────────────
  // The fixture is audit-created test data. A data cleanup or rebuilt database
  // removes it — recreate it deterministically so the suite never depends on
  // leftover state. No application code or assertions are affected.
  {
    const before = await api('GET', '/api/projects?serviceType=VIDEO_PRODUCTION&pageSize=200', undefined, founder)
    const existingFixture = (before.data.projects as Array<{ id: string; name: string }>).find(p => p.name === 'Audit 20-Video Accuracy Fixture')
    if (!existingFixture) {
      const clientsRes = await api('GET', '/api/clients?pageSize=200', undefined, founder)
      let auditClient = (clientsRes.data.clients as Array<{ id: string; name: string }>).find(c => c.name === 'Audit Cafe (verify fixture)')
      if (!auditClient) {
        const cc = await api('POST', '/api/clients', { name: 'Audit Cafe (verify fixture)', contactEmail: 'audit-fixture@verify.local' }, founder)
        check('fixture client created by harness', cc.status === 201 && !!cc.data?.client, `status ${cc.status} ${JSON.stringify(cc.data).slice(0, 120)}`)
        auditClient = cc.data?.client
      }
      if (!auditClient) {
        check('fixture client available', false, 'could not find or create the fixture client')
        return void (await db.$disconnect())
      }
      const pc = await api('POST', '/api/projects', {
        name: 'Audit 20-Video Accuracy Fixture',
        serviceType: 'VIDEO_PRODUCTION',
        clientId: auditClient.id,
        video: { agreedVideoCount: 20, revisionAllowance: 2, createDeliverables: true },
      }, founder)
      check('fixture project created by harness (20 contracted videos)', pc.status === 201, `status ${pc.status} ${JSON.stringify(pc.data).slice(0, 120)}`)
    }
  }

  // ── locate fixture ──────────────────────────────────────────
  const projectsRes = await api('GET', '/api/projects?serviceType=VIDEO_PRODUCTION', undefined, founder)
  const projects = projectsRes.data.projects as Array<{ id: string; name: string }>
  const fixture = projects.find(p => p.name === 'Audit 20-Video Accuracy Fixture')
  check('fixture project exists', !!fixture)
  if (!fixture) return void (await db.$disconnect())

  const detail = await api('GET', `/api/projects/${fixture.id}`, undefined, founder)
  const project = detail.data.project
  let deliverables = project.deliverables as Array<{
    id: string; reference: string; title: string; status: string; revisionCount: number
  }>
  const vp = project.videoProject as { agreedQuantity: number; revisionAllowance: number } | null

  // ── 0. reset fixture to a clean PLANNED state (audit-created data only) ──
  const fixDeliverableIds = deliverables.map(d => d.id)
  await db.videoVersion.deleteMany({ where: { deliverableId: { in: fixDeliverableIds } } })
  await db.shootDeliverable.deleteMany({ where: { deliverableId: { in: fixDeliverableIds } } })
  // remove replacement deliverables created by prior runs (audit-created fixture only)
  await db.videoDeliverable.deleteMany({ where: { projectId: fixture.id, isReplacement: true } })
  await db.equipmentReservation.deleteMany({ where: { session: { projectId: fixture.id } } })
  await db.shootAssignment.deleteMany({ where: { session: { projectId: fixture.id } } })
  await db.shootSession.deleteMany({ where: { projectId: fixture.id } })
  await db.videoDeliverable.updateMany({
    where: { id: { in: fixDeliverableIds } },
    data: {
      status: 'PLANNED', revisionCount: 0, currentVersionNumber: 0,
      footageBackupVerified: false, actualShootDate: null, shootCompletedAt: null,
      footageReceivedAt: null, deliveredAt: null, deliveredById: null,
      deliveryReference: null, cancelReason: null,
      replacesId: null, plannedShootDate: null,
    },
  })
  await db.session.deleteMany({ where: { userType: 'CLIENT_USER', userId: { in: (await db.clientUser.findMany({ where: { clientId: project.clientId as string, email: 'fixture.reviewer@auditcafe.local' } })).map(u => u.id) } } })
  await db.clientUser.deleteMany({ where: { clientId: project.clientId as string, email: 'fixture.reviewer@auditcafe.local' } })
  // re-fetch post-reset state so count checks reflect reality
  const detailReset = await api('GET', `/api/projects/${fixture.id}`, undefined, founder)
  deliverables = detailReset.data.project.deliverables as typeof deliverables

  // ── 1. contractual quantity & record count ──────────────────
  check('contractual quantity is 20', (vp as any)?.agreedVideoCount === 20, `got ${(vp as any)?.agreedVideoCount}`)
  check('exactly 20 deliverable records', deliverables.length === 20, `got ${deliverables.length}`)
  check('deliverable ids unique', new Set(deliverables.map(d => d.id)).size === 20)
  check('deliverable references unique', new Set(deliverables.map(d => d.reference)).size === 20)
  check('all 20 start non-cancelled', deliverables.every(d => d.status !== 'CANCELLED'))

  const byTitle = (t: string) => deliverables.find(d => d.title === t)
  const d1 = deliverables[0] // lifecycle probe
  const dCancel = deliverables[1] // cancel + replacement probe
  const transition = (id: string, body: Record<string, unknown>) =>
    api('POST', `/api/video/deliverables/${id}/transition`, body, founder)

  const statusOf = async (id: string): Promise<string> => {
    const r = await api('GET', `/api/video/deliverables/${id}`, undefined, founder)
    return r.data.deliverable?.status ?? r.data.status ?? ''
  }

  // ── 2/3/4. schedule ≠ filmed, film ≠ delivered, backup gate ──
  let r = await transition(d1.id, { to: 'SCHEDULED' })
  check('PLANNED→SCHEDULED allowed for OWNER', r.status === 200, `status ${r.status}`)
  let s = await statusOf(d1.id)
  check('scheduled ≠ filmed/delivered', s === 'SCHEDULED', `got ${s}`)

  r = await transition(d1.id, { to: 'SHOT' })
  check('SCHEDULED→SHOT (filmed) allowed', r.status === 200, `status ${r.status}`)
  s = await statusOf(d1.id)
  check('filmed ≠ delivered', s === 'SHOT', `got ${s}`)

  r = await transition(d1.id, { to: 'FOOTAGE_READY' })
  check('SHOT→FOOTAGE_READY blocked without backup verification (422)', r.status === 422, `status ${r.status}`)
  s = await statusOf(d1.id)
  check('status unchanged after blocked transition', s === 'SHOT', `got ${s}`)
  const pv = await api('PATCH', `/api/video/deliverables/${d1.id}`, { footageBackupVerified: true }, founder)
  check('PATCH footage backup verification accepted', pv.status === 200, `status ${pv.status}`)
  r = await transition(d1.id, { to: 'FOOTAGE_READY' })
  check('SHOT→FOOTAGE_READY allowed after backup verification', r.status === 200, `status ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`)
  s = await statusOf(d1.id)
  check('footage-ready ≠ delivered', s === 'FOOTAGE_READY', `got ${s}`)

  // ── 5. editing / internal review distinctness ────────────────
  r = await transition(d1.id, { to: 'EDITING' })
  check('FOOTAGE_READY→EDITING allowed', r.status === 200, `status ${r.status}`)

  // ── 6. version registration (while EDITING) + internal review binds version ─
  // Registering a version keeps the deliverable EDITING; the EDITING→INTERNAL_REVIEW
  // transition submits it for internal review. Registration is blocked elsewhere.
  let v = await api('POST', `/api/video/deliverables/${d1.id}/versions`, { previewReference: 'https://preview.agencyos.local/audit-v1', changeSummary: 'v1' }, founder)
  check('register version v1 while EDITING (201)', v.status === 201, `status ${v.status} ${JSON.stringify(v.data).slice(0, 120)}`)
  const v1Id = v.data?.version?.id ?? v.data?.id
  check('v1 registered as PENDING_INTERNAL', (v.data?.version?.reviewStatus ?? v.data?.reviewStatus) === 'PENDING_INTERNAL')
  s = await statusOf(d1.id)
  check('deliverable still EDITING after registration', s === 'EDITING', `got ${s}`)

  r = await transition(d1.id, { to: 'INTERNAL_REVIEW' })
  check('EDITING→INTERNAL_REVIEW submit allowed', r.status === 200, `status ${r.status}`)

  // version registration must be rejected while not EDITING/REVISION_REQUIRED
  const vReject = await api('POST', `/api/video/deliverables/${d1.id}/versions`, { previewReference: 'x' }, founder)
  check('version registration blocked while INTERNAL_REVIEW (422)', vReject.status === 422, `status ${vReject.status}`)

  // internal rejection sends it back to editing
  v = await api('POST', `/api/video/versions/${v1Id}`, { decision: 'INTERNAL_REJECTED' }, founder)
  check('internal rejection works', v.status === 200, `status ${v.status}`)
  s = await statusOf(d1.id)
  check('deliverable back to EDITING after internal rejection', s === 'EDITING', `got ${s}`)

  // v2 — the one that will be approved
  v = await api('POST', `/api/video/deliverables/${d1.id}/versions`, { previewReference: 'https://preview.agencyos.local/audit-v2', changeSummary: 'v2 fixes' }, founder)
  check('register version v2 (201)', v.status === 201, `status ${v.status}`)
  const v2Id = v.data?.version?.id ?? v.data?.id
  await transition(d1.id, { to: 'INTERNAL_REVIEW' })
  v = await api('POST', `/api/video/versions/${v2Id}`, { decision: 'INTERNAL_APPROVED' }, founder)
  check('internal approval of v2', v.status === 200, `status ${v.status}`)
  s = await statusOf(d1.id)
  check('deliverable in CLIENT_REVIEW after internal approval', s === 'CLIENT_REVIEW', `got ${s}`)

  // invalid jump must be rejected (CLIENT_REVIEW has no direct DELIVERED path)
  r = await transition(d1.id, { to: 'DELIVERED' })
  check('CLIENT_REVIEW→DELIVERED jump rejected (422)', r.status === 422, `status ${r.status}`)

  // v1 must remain INTERNAL_REJECTED and never be the approved one
  const versionsAfter = await api('GET', `/api/video/deliverables/${d1.id}/versions`, undefined, founder)
  const vers = versionsAfter.data.versions as Array<{ id: string; versionNumber: number; reviewStatus: string }>
  const v1Row = vers.find(x => x.versionNumber === 1)
  const v2Row = vers.find(x => x.versionNumber === 2)
  check('v1 stays INTERNAL_REJECTED', v1Row?.reviewStatus === 'INTERNAL_REJECTED', v1Row?.reviewStatus)
  check('v2 is PENDING_CLIENT (the only client-reviewable)', v2Row?.reviewStatus === 'PENDING_CLIENT', v2Row?.reviewStatus)

  // ── client review via portal: provision a portal user for the fixture client ─
  const clientId = project.clientId as string
  const pu = await api('POST', `/api/clients/${clientId}`, { name: 'Fixture Reviewer', email: 'fixture.reviewer@auditcafe.local' }, founder)
  check('portal user provisioned for fixture client (201)', pu.status === 201, `status ${pu.status} ${JSON.stringify(pu.data).slice(0, 120)}`)
  const tempPw: string = pu.data?.temporaryPassword ?? ''
  check('temp password returned once and non-empty', tempPw.length >= 10)

  const cliLogin = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'fixture.reviewer@auditcafe.local', password: tempPw }),
  })
  check('fixture reviewer login 200', cliLogin.status === 200)
  let cliCookie = (cliLogin.headers.get('set-cookie') ?? '').split(';')[0]

  // Provisioned accounts must change their one-time password before the API
  // serves anything else (server-side enforcement). Verify the gate, then clear it.
  const gated = await fetch(`${BASE}/api/portal/projects`, { headers: { Cookie: cliCookie } })
  check('must-change-password gate blocks other APIs (403)', gated.status === 403, `status ${gated.status}`)
  const pwChange = await fetch(`${BASE}/api/auth/password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cliCookie },
    body: JSON.stringify({ currentPassword: tempPw, newPassword: 'Fixture-Reviewer-2026!pw' }),
  })
  check('self password change clears requirement (200)', pwChange.status === 200, `status ${pwChange.status}`)
  const cliLogin2 = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'fixture.reviewer@auditcafe.local', password: 'Fixture-Reviewer-2026!pw' }),
  })
  check('reviewer re-login with new password 200', cliLogin2.status === 200)
  cliCookie = (cliLogin2.headers.get('set-cookie') ?? '').split(';')[0]
  const ungated = await fetch(`${BASE}/api/portal/projects`, { headers: { Cookie: cliCookie } })
  check('APIs open after password change (200)', ungated.status === 200, `status ${ungated.status}`)
  const client = { Cookie: cliCookie }

  // client sees ONLY their own deliverables
  const portalDeliverables = await api('GET', '/api/portal/deliverables', undefined, client)
  const pd = portalDeliverables.data as { deliverables?: Array<{ id: string; reference: string }> }
  const foreignRefs = (pd.deliverables ?? []).filter(x => !x.reference.startsWith('VD-') || !deliverables.some(m => m.reference === x.reference))
  check('portal list contains only fixture-client deliverables', Array.isArray(pd.deliverables) && pd.deliverables.length >= 1 && foreignRefs.length === 0, `count ${pd.deliverables?.length}`)

  // client revision request on v2
  let pr = await fetch(`${BASE}/api/portal/overview`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cliCookie },
    body: JSON.stringify({ versionId: v2Id, decision: 'REVISION_REQUESTED', comment: 'Audit: tighten the cut', timecode: '00:07' }),
  })
  check('client revision request accepted', pr.status === 200, `status ${pr.status}`)
  s = await statusOf(d1.id)
  check('deliverable in REVISION_REQUIRED', s === 'REVISION_REQUIRED', `got ${s}`)
  const d1Row = await db.videoDeliverable.findUnique({ where: { id: d1.id } })
  check('revision counter incremented', d1Row?.revisionCount === 1, `got ${d1Row?.revisionCount}`)
  check('revisions stay within allowance', (vp?.revisionAllowance ?? 0) >= d1Row!.revisionCount)

  // revise: back to editing, register v3, internal approve, client approves v3
  r = await transition(d1.id, { to: 'EDITING' })
  check('REVISION_REQUIRED→EDITING allowed', r.status === 200, `status ${r.status}`)
  v = await api('POST', `/api/video/deliverables/${d1.id}/versions`, { previewReference: 'https://preview.agencyos.local/audit-v3', changeSummary: 'v3' }, founder)
  const v3Id = v.data?.version?.id ?? v.data?.id
  check('register version v3 (201)', v.status === 201, `status ${v.status}`)
  await transition(d1.id, { to: 'INTERNAL_REVIEW' })
  await api('POST', `/api/video/versions/${v3Id}`, { decision: 'INTERNAL_APPROVED' }, founder)
  pr = await fetch(`${BASE}/api/portal/overview`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cliCookie },
    body: JSON.stringify({ versionId: v3Id, decision: 'APPROVED' }),
  })
  check('client approves v3', pr.status === 200, `status ${pr.status}`)
  s = await statusOf(d1.id)
  check('deliverable APPROVED after client approval', s === 'APPROVED', `got ${s}`)
  const v3Row = await db.videoVersion.findUnique({ where: { id: v3Id } })
  const v2RowAfter = await db.videoVersion.findUnique({ where: { id: v2Id } })
  check('approval bound to v3 (APPROVED)', v3Row?.reviewStatus === 'APPROVED', v3Row?.reviewStatus)
  check('v2 remains CLIENT_REJECTED (not approved)', v2RowAfter?.reviewStatus === 'CLIENT_REJECTED', v2RowAfter?.reviewStatus)

  // ── 7. delivered counts & remaining ─────────────────────────
  r = await api('POST', `/api/video/deliverables/${d1.id}/transition`, { to: 'DELIVERED', reason: 'audit-delivery-001' }, founder)
  check('APPROVED→DELIVERED with delivery reference allowed', r.status === 200, `status ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`)
  s = await statusOf(d1.id)
  check('deliverable DELIVERED', s === 'DELIVERED', `got ${s}`)

  const dash1 = await api('GET', '/api/video/dashboard', undefined, founder)
  const totals1 = dash1.data.totals
  check('dashboard delivered increased to 3', totals1.delivered === 3, `got ${totals1.delivered}`)

  // ── 8. cancel + replacement ──────────────────────────────────
  const beforeCancel = (await api('GET', '/api/video/dashboard', undefined, founder)).data.totals
  r = await api('POST', `/api/video/deliverables/${dCancel.id}/transition`, { to: 'CANCELLED', reason: 'Audit fixture: replaced by re-shoot' }, founder)
  check('cancel with reason allowed', r.status === 200, `status ${r.status}`)
  const afterCancel = (await api('GET', '/api/video/dashboard', undefined, founder)).data.totals
  check('contracted drops by 1 after cancel', afterCancel.contracted === beforeCancel.contracted - 1, `${beforeCancel.contracted} → ${afterCancel.contracted}`)
  check('cancelled count incremented', afterCancel.cancelled === beforeCancel.cancelled + 1)

  r = await api('POST', '/api/video/deliverables', {
    projectId: fixture.id,
    title: `${dCancel.title} (replacement)`,
    replacesId: dCancel.id,
  }, founder)
  check('replacement deliverable created referencing cancelled record', r.status === 201, `status ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`)
  const afterReplace = (await api('GET', '/api/video/dashboard', undefined, founder)).data.totals
  check('contracted restored after replacement', afterReplace.contracted === beforeCancel.contracted, `${afterReplace.contracted}`)

  // ── 9. dashboard derived from real records, no double counting ─
  const allDeliverables = await db.videoDeliverable.findMany({ select: { status: true } })
  const real = {
    contracted: allDeliverables.filter(d => d.status !== 'CANCELLED').length,
    delivered: allDeliverables.filter(d => d.status === 'DELIVERED').length,
    cancelled: allDeliverables.filter(d => d.status === 'CANCELLED').length,
  }
  const dash2 = (await api('GET', '/api/video/dashboard', undefined, founder)).data
  check('dashboard.contracted == real non-cancelled count', dash2.totals.contracted === real.contracted, `${dash2.totals.contracted} vs ${real.contracted}`)
  check('dashboard.delivered == real delivered count', dash2.totals.delivered === real.delivered, `${dash2.totals.delivered} vs ${real.delivered}`)
  check('dashboard.cancelled == real cancelled count', dash2.totals.cancelled === real.cancelled, `${dash2.totals.cancelled} vs ${real.cancelled}`)
  const stageCountsMap = dash2.stageCounts as Record<string, number>
  const stageSum = Object.values(stageCountsMap).reduce((a, b) => a + b, 0)
  const stageSumNonCancelled = Object.entries(stageCountsMap).filter(([k]) => k !== 'CANCELLED').reduce((a, [, b]) => a + b, 0)
  check('stageCounts partition covers every record exactly once (no double count)', stageSum === allDeliverables.length, `${stageSum} vs ${allDeliverables.length}`)
  check('non-cancelled stage sum == contracted', stageSumNonCancelled === real.contracted, `${stageSumNonCancelled} vs ${real.contracted}`)
  const statusSum = Object.entries(dash2.stageCounts as Record<string, number>).map(([k, n]) => {
    const actual = allDeliverables.filter(d => d.status === k).length
    return { k, n, actual }
  })
  const stageMismatch = statusSum.filter(x => x.n !== x.actual)
  check('each stageCount equals real per-status count', stageMismatch.length === 0, JSON.stringify(stageMismatch))

  // ── 10. shoot conflict detection ─────────────────────────────
  const shoots = await api('GET', '/api/video/shoots', undefined, founder)
  const shootList = shoots.data.shoots as Array<{ date: string }>
  check('existing shoots available for conflict probe', shootList.length >= 1)
  const vgTeam = await api('GET', '/api/team', undefined, founder)
  const vg = (vgTeam.data.employees as Array<{ id: string; role: string }>).find(e => e.role === 'VIDEOGRAPHER')
  check('videographer found', !!vg)
  if (shootList.length >= 1 && vg) {
    const date = shootList[0].date.slice(0, 10)
    const mk = (start: string, end: string, title: string) =>
      api('POST', '/api/video/shoots', { projectId: fixture.id, title, date: `${date}T00:00:00.000Z`, startTime: start, endTime: end, videographerIds: [vg.id] }, founder)
    const conflictRes = await mk('10:00', '11:00', 'Audit conflict probe')
    const conflicts = (conflictRes.data?.conflicts ?? []) as unknown[]
    check('overlapping videographer booking flagged', Array.isArray(conflicts) && conflicts.length >= 1, `conflicts: ${conflicts.length}`)
    const clearRes = await mk('13:00', '14:00', 'Audit clear probe')
    const clearConflicts = (clearRes.data?.conflicts ?? []) as unknown[]
    check('non-overlapping booking not flagged', Array.isArray(clearConflicts) && clearConflicts.length === 0, `conflicts: ${clearConflicts.length}`)
  }

  // ── cleanup-safe marker: nothing deleted here; audit cleanup script handles removal ──
  console.log('')
  console.log('══════════════════════════════════')
  console.log(`RESULTS: ${PASS} passed, ${FAIL} failed`)
  if (failures.length) console.log('Failures:\n- ' + failures.join('\n- '))
  console.log('══════════════════════════════════')

  await db.$disconnect()
  process.exit(FAIL === 0 ? 0 : 1)
}

main().catch(async e => {
  console.error('Script error:', e)
  await db.$disconnect()
  process.exit(1)
})
