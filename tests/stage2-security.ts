/**
 * AgencyOS Stage 2 — Security & Regression Suite
 *
 * Proves (against a running dev server on localhost:3000), per Stage 2 module:
 *   1. Notifications mark-all-as-read (own rows only, idempotent)
 *   2. Activity feed (employee-only, sanitized: no DENIED rows, no ip/detail)
 *   3. Task comments (RBAC mirrors tasks; dev scoped; cross-task 404)
 *   4. Contacts (manager CRUD; dev read-only; client denied; validation)
 *   5. Meetings (manager write; client read-only own; state machine; isolation)
 *   6. Client briefs (client draft→submit; locked after; manager review; 404 cross-client)
 *   7. Global search (role-scoped groups; client isolation; short query)
 *   8. Settings (safe-key whitelist; employee read; founder/manager write; audit)
 *   9. Sign-up requests (public submit, honeypot, dedupe; founder-only review;
 *      approve issues one-time password; mustChangePassword enforced)
 *  10. Regression: core Phase 6 endpoints still respond for every role.
 *
 * Credentials: gitignored tests/.creds.local.json (rotated passwords) with
 * seeded-demo fallback — same mechanism as tests/phase6-security.ts.
 * Test data uses the "STG2" marker and is cleaned up at the end.
 *
 * Run: bun tests/stage2-security.ts   (dev server must be running)
 * Exit code 0 = all tests passed; 1 = at least one failure.
 */
import fs from 'fs'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
const CREDS_FILE = new URL('./.creds.local.json', import.meta.url).pathname

type Jar = Record<string, string>
let pass = 0
let fail = 0
const failures: string[] = []

function record(name: string, ok: boolean, detail: string) {
  if (ok) {
    pass++
    console.log(`  ✅ ${name}  (${detail})`)
  } else {
    fail++
    failures.push(`${name} — ${detail}`)
    console.log(`  ❌ ${name}  (expected ${detail})`)
  }
}

function cookieHeader(jar: Jar): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

async function req(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  opts: { jar?: Jar; body?: unknown } = {}
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {}
  if (opts.jar) headers['cookie'] = cookieHeader(opts.jar)
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    redirect: 'manual',
  })
  let body: any = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { status: res.status, body }
}

async function login(email: string, password: string): Promise<Jar> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`)
  const jar: Jar = {}
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';')
    const eq = pair.indexOf('=')
    jar[pair.slice(0, eq)] = pair.slice(eq + 1)
  }
  return jar
}

type Account = { email: string; password: string }
const ACC: Record<string, Account> = fs.existsSync(CREDS_FILE)
  ? JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'))
  : {
      founder: { email: 'founder@agencyos.co.uk', password: 'Founder!2026' },
      manager: { email: 'manager@agencyos.co.uk', password: 'Manager!2026' },
      dev: { email: 'dev@agencyos.co.uk', password: 'Dev!2026' },
      finance: { email: 'finance@agencyos.co.uk', password: 'Finance!2026' },
      marta: { email: 'marta@anchorinn.co.uk', password: 'Client!2026' },
      jordan: { email: 'jordan@brightcuts.co.uk', password: 'Client!2026' },
    }

async function cleanup() {
  await db.taskComment.deleteMany({ where: { body: { contains: 'STG2' } } })
  await db.contact.deleteMany({ where: { OR: [{ name: { contains: 'STG2' } }, { email: { contains: 'stg2test' } }] } })
  await db.brief.deleteMany({ where: { title: { contains: 'STG2' } } })
  await db.meeting.deleteMany({ where: { title: { contains: 'STG2' } } })
  await db.setting.deleteMany({})
  await db.notification.deleteMany({ where: { dedupeKey: { startsWith: 'meeting-' } } })
  await db.notification.deleteMany({ where: { dedupeKey: { startsWith: 'brief-' } } })
  await db.notification.deleteMany({ where: { type: 'SIGNUP_REQUEST' } })
  await db.notification.deleteMany({ where: { type: 'TASK_COMMENT' } })
  const sally = await db.user.findUnique({ where: { email: 'sally@stg2test-cafe.co.uk' } })
  if (sally) await db.user.delete({ where: { id: sally.id } })
  await db.client.deleteMany({ where: { name: 'STG2TEST Cafe' } })
  await db.signupRequest.deleteMany({ where: { OR: [{ email: { contains: 'stg2test' } }, { email: { contains: 'spam' } }] } })
}

async function main() {
  await cleanup()

  console.log('\n════════════════════════════════════════════════════')
  console.log(' AgencyOS Stage 2 — Security & Regression Suite')
  console.log('════════════════════════════════════════════════════\n')

  const founder = await login(ACC.founder.email, ACC.founder.password)
  const manager = await login(ACC.manager.email, ACC.manager.password)
  const dev = await login(ACC.dev.email, ACC.dev.password)
  const finance = await login(ACC.finance.email, ACC.finance.password)
  const marta = await login(ACC.marta.email, ACC.marta.password)
  const jordan = await login(ACC.jordan.email, ACC.jordan.password)
  const anon = {}

  // Lookups
  const clientsRes = await req('GET', '/api/clients', { jar: founder })
  const anchor = clientsRes.body.clients.find((c: any) => c.name === 'The Anchor Inn')
  const bright = clientsRes.body.clients.find((c: any) => c.name === 'Bright Cuts Barbers')
  const tasksRes = await req('GET', '/api/tasks', { jar: founder })
  const someTask = tasksRes.body.tasks[0]

  console.log('\n■ 1. Notifications — mark all as read')
  {
    // founder seeds a notification to marta via meeting (existing path) is overkill; use PATCH directly
    const unread = await req('GET', '/api/notifications?unreadOnly=1', { jar: marta })
    const before = unread.body.notifications.length
    const r1 = await req('PATCH', '/api/notifications', { jar: marta, body: { all: true } })
    record('PATCH {all:true} returns 200', r1.status === 200, '200')
    const after = await req('GET', '/api/notifications?unreadOnly=1', { jar: marta })
    record('all own notifications read', after.body.notifications.length === 0, `0 (was ${before})`)
    const again = await req('PATCH', '/api/notifications', { jar: marta, body: { all: true } })
    record('idempotent (second call 200)', again.status === 200, '200')
    const unauth = await req('PATCH', '/api/notifications', { jar: anon, body: { all: true } })
    record('unauthenticated 401', unauth.status === 401, '401')
  }

  console.log('\n■ 2. Activity feed — sanitized, employee-only')
  {
    const r1 = await req('GET', '/api/activity', { jar: anon })
    record('unauthenticated 401', r1.status === 401, '401')
    const r2 = await req('GET', '/api/activity', { jar: marta })
    record('client 403', r2.status === 403, '403')
    const r3 = await req('GET', '/api/activity', { jar: manager })
    record('manager 200 with entries', r3.status === 200 && r3.body.entries.length > 0, '200 + entries')
    const bad = r3.body.entries.some((e: any) => 'ip' in e || 'detail' in e || e.result === 'DENIED' || e.result === 'FAILURE')
    record('no ip/detail/DENIED/FAILURE rows', !bad, 'sanitized')
    const r4 = await req('GET', '/api/activity?result=DENIED', { jar: founder })
    const stillClean = r4.body.entries.every((e: any) => e.result === 'SUCCESS' || e.result === 'ALLOWED')
    record('result filter cannot leak denied rows', r4.status === 200 && stillClean, 'clean')
  }

  console.log('\n■ 3. Task comments — task RBAC mirrored')
  {
    const base = `/api/tasks/${someTask.id}/comments`
    const r1 = await req('GET', base, { jar: anon })
    record('unauthenticated 401', r1.status === 401, '401')
    const r2 = await req('GET', base, { jar: marta })
    record('client 403', r2.status === 403, '403')
    const r3 = await req('GET', base, { jar: finance })
    record('finance 403 (no task access)', r3.status === 403, '403')
    const c1 = await req('POST', base, { jar: founder, body: { body: 'STG2 comment from founder' } })
    record('founder POST 201', c1.status === 201, '201')
    const c2 = await req('POST', base, { jar: manager, body: { body: 'STG2 comment from manager' } })
    record('manager POST 201', c2.status === 201, '201')
    const c3 = await req('POST', base, { jar: founder, body: { body: '' } })
    record('empty body 400', c3.status === 400, '400')
    const c4 = await req('POST', base, { jar: founder, body: { body: 'x'.repeat(4001) } })
    record('over-length body 400', c4.status === 400, '400')
    const list = await req('GET', base, { jar: dev })
    record(
      'dev GET (if task visible) or 404 (if not) — both acceptable',
      list.status === 200 || list.status === 404,
      String(list.status)
    )
    const ghost = await req('GET', '/api/tasks/nonexistent123/comments', { jar: founder })
    record('unknown task 404', ghost.status === 404, '404')
    if (list.status === 200) {
      const count = list.body.comments.filter((c: any) => c.body.includes('STG2')).length
      record('comments persisted', count >= 2, `${count} STG2 comments`)
    }
  }

  console.log('\n■ 4. Contacts — directory RBAC + validation')
  {
    const r1 = await req('GET', '/api/contacts', { jar: anon })
    record('unauthenticated 401', r1.status === 401, '401')
    const r2 = await req('GET', '/api/contacts', { jar: marta })
    record('client 403', r2.status === 403, '403')
    const r3 = await req('POST', '/api/contacts', { jar: manager, body: { clientId: anchor.id, name: 'STG2 Contact', email: 'bad-email' } })
    record('invalid email 400', r3.status === 400, '400')
    const c1 = await req('POST', '/api/contacts', {
      jar: manager,
      body: { clientId: anchor.id, name: 'STG2 Contact', title: 'Owner', email: 'stg2test@example.com', isPrimary: true },
    })
    record('manager POST 201', c1.status === 201, '201')
    const cid = c1.body.contact.id
    const r4 = await req('POST', '/api/contacts', { jar: dev, body: { clientId: anchor.id, name: 'STG2 dev' } })
    record('dev POST 403', r4.status === 403, '403')
    const r5 = await req('GET', '/api/contacts', { jar: dev })
    record('dev GET 200 (read-only)', r5.status === 200, '200')
    const r6 = await req('DELETE', `/api/contacts/${cid}`, { jar: marta })
    record('client DELETE 403', r6.status === 403, '403')
    const r7 = await req('PATCH', `/api/contacts/${cid}`, { jar: manager, body: { phone: '+44 7700 900000' } })
    record('manager PATCH 200', r7.status === 200, '200')
    const r8 = await req('DELETE', `/api/contacts/${cid}`, { jar: manager })
    record('manager DELETE 200', r8.status === 200, '200')
    const r9 = await req('GET', '/api/contacts/nonexistent123', { jar: founder })
    record('unknown contact 404', r9.status === 404, '404')
  }

  console.log('\n■ 5. Meetings — scheduling, state machine, portal isolation')
  {
    const r1 = await req('GET', '/api/meetings', { jar: anon })
    record('unauthenticated 401', r1.status === 401, '401')
    const r2 = await req('GET', '/api/meetings', { jar: marta })
    record('client on staff API 403', r2.status === 403, '403')
    const r3 = await req('POST', '/api/meetings', { jar: manager, body: { title: 'x', startsAt: 'not-a-date' } })
    record('invalid date 400', r3.status === 400, '400')
    const m1 = await req('POST', '/api/meetings', {
      jar: manager,
      body: { title: 'STG2 Meeting', startsAt: new Date(Date.now() + 86400000).toISOString(), durationMinutes: 30, clientId: anchor.id },
    })
    record('manager POST 201', m1.status === 201, '201')
    const mid = m1.body.meeting.id
    const r4 = await req('POST', '/api/meetings', { jar: finance, body: { title: 'x', startsAt: new Date().toISOString() } })
    record('finance POST 403', r4.status === 403, '403')
    const r5 = await req('PATCH', `/api/meetings/${mid}`, { jar: manager, body: { outcome: 'too early' } })
    record('outcome while SCHEDULED 400', r5.status === 400, '400')
    const r6 = await req('PATCH', `/api/meetings/${mid}`, { jar: manager, body: { status: 'COMPLETED', outcome: 'STG2 outcome' } })
    record('complete 200', r6.status === 200, '200')
    const r7 = await req('PATCH', `/api/meetings/${mid}`, { jar: manager, body: { status: 'CANCELLED' } })
    record('cancel after complete 400', r7.status === 400, '400')
    const p1 = await req('GET', '/api/portal/meetings', { jar: marta })
    record('marta portal GET sees own meeting', p1.status === 200 && p1.body.meetings.length === 1, '1 meeting')
    const p2 = await req('GET', '/api/portal/meetings', { jar: jordan })
    record('jordan portal GET isolation (0)', p2.status === 200 && p2.body.meetings.length === 0, '0 meetings')
    const p3 = await req('GET', '/api/portal/meetings', { jar: dev })
    record('dev on portal API 403', p3.status === 403, '403')
    const p4 = await req('GET', `/api/portal/meetings?clientId=${bright.id}`, { jar: marta })
    record('client cannot pass clientId 403', p4.status === 403, '403')
    const p5 = await req('GET', '/api/portal/meetings', { jar: founder })
    record('founder portal without clientId 400', p5.status === 400, '400')
    const p6 = await req('GET', `/api/portal/meetings?clientId=${anchor.id}`, { jar: founder })
    record('founder portal with clientId 200', p6.status === 200, '200')
    const n1 = await req('GET', '/api/notifications', { jar: marta })
    record('client notified of scheduling', n1.body.notifications.some((n: any) => n.type === 'MEETING_SCHEDULED'), 'notification')
  }

  console.log('\n■ 6. Client briefs — draft → submit → review, cross-client 404')
  {
    const b1 = await req('POST', '/api/portal/briefs', {
      jar: marta,
      body: { title: 'STG2 Brief', objectives: 'More bookings', audience: 'Locals', scope: 'Booking form' },
    })
    record('marta create draft 201', b1.status === 201 && b1.body.brief.status === 'DRAFT', '201 DRAFT')
    const bid = b1.body.brief.id
    const b2 = await req('POST', '/api/portal/briefs', { jar: marta, body: { title: 'x' } })
    record('missing fields 400', b2.status === 400, '400')
    const b3 = await req('GET', `/api/portal/briefs/${bid}`, { jar: jordan })
    record('jordan GET foreign brief 404', b3.status === 404, '404')
    const b4 = await req('PATCH', `/api/portal/briefs/${bid}`, { jar: jordan, body: { submit: true } })
    record('jordan PATCH foreign brief 404', b4.status === 404, '404')
    const b5 = await req('PATCH', `/api/portal/briefs/${bid}`, { jar: marta, body: { budget: '£500', submit: true } })
    record('marta edit+submit → SUBMITTED', b5.status === 200 && b5.body.brief.status === 'SUBMITTED', 'SUBMITTED')
    const b6 = await req('PATCH', `/api/portal/briefs/${bid}`, { jar: marta, body: { budget: '£600' } })
    record('edit after submit 400', b6.status === 400, '400')
    const b7 = await req('GET', '/api/briefs', { jar: finance })
    record('finance staff list 200', b7.status === 200, '200')
    const b8 = await req('GET', '/api/briefs', { jar: marta })
    record('client staff list 403', b8.status === 403, '403')
    const b9 = await req('PATCH', `/api/briefs/${bid}`, { jar: manager, body: { status: 'ACCEPTED', reviewNotes: 'STG2 accepted' } })
    record('manager ACCEPTED 200', b9.status === 200 && b9.body.brief.status === 'ACCEPTED', '200 ACCEPTED')
    const b10 = await req('PATCH', `/api/briefs/${bid}`, { jar: manager, body: { status: 'REJECTED' } })
    record('review after decision 400', b10.status === 400, '400')
    const b11 = await req('PATCH', `/api/briefs/${bid}`, { jar: dev, body: { status: 'REJECTED' } })
    record('dev review 403', b11.status === 403, '403')
    const b12 = await req('GET', '/api/portal/briefs', { jar: marta })
    record('marta sees decision', b12.status === 200 && b12.body.briefs[0].status === 'ACCEPTED', 'ACCEPTED')
    const b13 = await req('GET', '/api/notifications', { jar: marta })
    record('client notified of decision', b13.body.notifications.some((n: any) => n.type === 'BRIEF_REVIEWED'), 'notification')
    const b14 = await req('GET', '/api/notifications', { jar: founder })
    record('founder notified of submission', b14.body.notifications.some((n: any) => n.type === 'BRIEF_SUBMITTED'), 'notification')
  }

  console.log('\n■ 7. Global search — role-scoped')
  {
    const s1 = await req('GET', '/api/search?q=anchor', { jar: anon })
    record('unauthenticated 401', s1.status === 401, '401')
    const s2 = await req('GET', '/api/search?q=anchor', { jar: founder })
    const types = (s2.body.groups ?? []).map((g: any) => g.type)
    record('founder finds client/project', s2.status === 200 && types.includes('client') && types.includes('project'), types.join('+') || 'none')
    const s3 = await req('GET', '/api/search?q=anchor', { jar: marta })
    const s3types = (s3.body.groups ?? []).map((g: any) => g.type)
    record('marta only own project (no client group)', s3.status === 200 && !s3types.includes('client'), s3types.join('+') || 'none')
    const s4 = await req('GET', '/api/search?q=anchor', { jar: jordan })
    record('jordan finds nothing of Anchor', s4.status === 200 && s4.body.groups.length === 0, '0 groups')
    const s5 = await req('GET', '/api/search?q=a', { jar: founder })
    record('short query empty', s5.status === 200 && s5.body.groups.length === 0, '0 groups')
    const s6 = await req('GET', '/api/search?q=anchor', { jar: dev })
    const s6types = (s6.body.groups ?? []).map((g: any) => g.type)
    record('dev has no clients group', s6.status === 200 && !s6types.includes('client'), s6types.join('+') || 'none')
  }

  console.log('\n■ 8. Settings — safe keys only')
  {
    const s1 = await req('GET', '/api/settings', { jar: anon })
    record('unauthenticated 401', s1.status === 401, '401')
    const s2 = await req('GET', '/api/settings', { jar: marta })
    record('client 403', s2.status === 403, '403')
    const s3 = await req('GET', '/api/settings', { jar: dev })
    record('dev read 200 (6 keys)', s3.status === 200 && Object.keys(s3.body.settings).length === 6, '200')
    const s4 = await req('PUT', '/api/settings', { jar: manager, body: { SUPPORT_EMAIL: 'nope' } })
    record('invalid email 400', s4.status === 400, '400')
    const s5 = await req('PUT', '/api/settings', { jar: manager, body: { ADMIN_BACKDOOR: 'x' } })
    record('unknown key rejected 400', s5.status === 400, '400')
    const s6 = await req('PUT', '/api/settings', { jar: dev, body: { AGENCY_NAME: 'X' } })
    record('dev write 403', s6.status === 403, '403')
    const s7 = await req('PUT', '/api/settings', { jar: manager, body: { AGENCY_NAME: 'STG2 Agency', PORTAL_WELCOME: 'STG2 welcome' } })
    record('manager write 200', s7.status === 200 && s7.body.settings.AGENCY_NAME === 'STG2 Agency', '200')
    const page = await fetch(`${BASE}/portal`, { headers: { cookie: cookieHeader(marta) } })
    const html = await page.text()
    record('portal renders welcome + brand', html.includes('STG2 welcome') && html.includes('STG2 Agency'), 'rendered')
    const s8 = await req('PUT', '/api/settings', { jar: founder, body: { AGENCY_NAME: 'AgencyOS', PORTAL_WELCOME: '' } })
    record('founder restore 200', s8.status === 200, '200')
    const audit = await req('GET', '/api/audit', { jar: founder })
    record('SETTINGS_UPDATED audited', audit.body.entries.some((e: any) => e.action === 'SETTINGS_UPDATED'), 'audit')
  }

  console.log('\n■ 9. Sign-up requests — public submit, founder-mediated approval')
  {
    const s1 = await req('POST', '/api/public/signup-requests', {
      body: { name: 'Test Person', email: 'nope', company: 'X Co' },
    })
    record('invalid email 400', s1.status === 400, '400')
    const s2 = await req('POST', '/api/public/signup-requests', {
      body: { name: 'Bot One', email: 'bot1@spam.com', company: 'Bots', website: 'http://spam.com' },
    })
    record('honeypot silent 202', s2.status === 202, '202')
    const s3 = await req('POST', '/api/public/signup-requests', {
      body: { name: 'Sally Requests', email: 'sally@stg2test-cafe.co.uk', company: 'STG2TEST Cafe', message: 'Need a website' },
    })
    record('public submit 202', s3.status === 202, '202')
    const s4 = await req('POST', '/api/public/signup-requests', {
      body: { name: 'Sally Again', email: 'sally@stg2test-cafe.co.uk', company: 'STG2TEST Cafe' },
    })
    record('duplicate pending 202 (deduped)', s4.status === 202, '202')
    const q1 = await req('GET', '/api/signup-requests', { jar: founder })
    const sallyReq = q1.body.requests.find((r: any) => r.email === 'sally@stg2test-cafe.co.uk')
    record('founder sees request PENDING', sallyReq?.status === 'PENDING', 'PENDING')
    record('duplicate did not create second row', q1.body.requests.filter((r: any) => r.email === 'sally@stg2test-cafe.co.uk').length === 1, '1 row')
    record('honeypot not stored', !q1.body.requests.some((r: any) => r.email === 'bot1@spam.com'), 'absent')
    const q2 = await req('GET', '/api/signup-requests', { jar: manager })
    record('manager queue 403', q2.status === 403, '403')
    const q3 = await req('GET', '/api/signup-requests', { jar: marta })
    record('client queue 403', q3.status === 403, '403')
    const a1 = await req('POST', `/api/signup-requests/${sallyReq.id}/approve`, { jar: manager, body: {} })
    record('manager approve 403', a1.status === 403, '403')
    const a2 = await req('POST', `/api/signup-requests/${sallyReq.id}/approve`, { jar: founder, body: { userName: 'Sally Requests' } })
    record('founder approve 200 + one-time password', a2.status === 200 && typeof a2.body.generatedPassword === 'string' && a2.body.generatedPassword.length >= 10, '200')
    record('client business created', typeof a2.body.clientId === 'string', 'clientId')
    const a3 = await req('POST', `/api/signup-requests/${sallyReq.id}/approve`, { jar: founder, body: {} })
    record('re-approve 400', a3.status === 400, '400')
    const nl = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'sally@stg2test-cafe.co.uk', password: a2.body.generatedPassword }),
    })
    const nj = await nl.json().catch(() => ({}))
    record('new user one-time login works', nl.status === 200, '200')
    record('mustChangePassword enforced', nj.user?.mustChangePassword === true, 'true')
    record('role CLIENT (isolated portal account)', nj.user?.role === 'CLIENT', 'CLIENT')
    const audit = await req('GET', '/api/audit', { jar: founder })
    record('SIGNUP_REQUEST_APPROVED audited', audit.body.entries.some((e: any) => e.action === 'SIGNUP_REQUEST_APPROVED'), 'audit')
    const pw = await req('GET', '/api/audit', { jar: founder })
    const auditText = JSON.stringify(pw.body.entries)
    record('password never in audit', !auditText.includes(a2.body.generatedPassword), 'absent')
  }

  console.log('\n■ 10. Regression — core Phase 6 endpoints respond for every role')
  {
    const checks: Array<[string, Promise<{ status: number }>, number]> = [
      ['founder /api/clients', req('GET', '/api/clients', { jar: founder }), 200],
      ['founder /api/finance/overview', req('GET', '/api/finance/overview', { jar: founder }), 200],
      ['founder /api/audit', req('GET', '/api/audit', { jar: founder }), 200],
      ['manager /api/tasks', req('GET', '/api/tasks', { jar: manager }), 200],
      ['manager /api/contacts', req('GET', '/api/contacts', { jar: manager }), 200],
      ['dev /api/tasks', req('GET', '/api/tasks', { jar: dev }), 200],
      ['finance /api/finance/overview', req('GET', '/api/finance/overview', { jar: finance }), 200],
      ['marta /api/portal/projects', req('GET', '/api/portal/projects', { jar: marta }), 200],
      ['marta /api/portal/billing', req('GET', '/api/portal/billing', { jar: marta }), 200],
      ['jordan /api/portal/projects', req('GET', '/api/portal/projects', { jar: jordan }), 200],
      ['marta foreign portal demo 404', req('GET', '/api/portal/demos/nonexistent999', { jar: marta }), 404],
      ['marta internal tasks 403', req('GET', '/api/tasks', { jar: marta }), 403],
      ['anon /api/projects 401', req('GET', '/api/projects', { jar: anon }), 401],
    ]
    for (const [name, p, expected] of checks) {
      const r = await p
      record(name, r.status === expected, String(expected))
    }
    const loginPage = await fetch(`${BASE}/login`)
    const loginHtml = await loginPage.text()
    record('/login offers Request access', loginPage.status === 200 && loginHtml.includes('Request access'), '200 + link')
    const signupPage = await fetch(`${BASE}/signup`)
    record('/signup renders', signupPage.status === 200 && (await signupPage.text()).includes('Request access'), '200')
  }

  await cleanup()

  console.log('\n════════════════════════════════════════════════════')
  console.log(` Stage 2 suite: ${pass} passed, ${fail} failed`)
  if (fail > 0) {
    console.log(' Failures:')
    for (const f of failures) console.log(`   • ${f}`)
  }
  console.log('════════════════════════════════════════════════════\n')
  await db.$disconnect()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(async (err) => {
  console.error('Suite crashed:', err)
  await cleanup().catch(() => {})
  await db.$disconnect().catch(() => {})
  process.exit(1)
})
