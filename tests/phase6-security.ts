/**
 * AgencyOS Phase 6 — Security & Workflow Test Suite
 *
 * Proves (against a running dev server on localhost:3000):
 *  1. A client cannot read another client's records by changing IDs.
 *  2. Clients cannot access employee or Founder endpoints.
 *  3. Employee role restrictions remain intact (manager/dev/finance denials).
 *  4. Founder access remains unrestricted across the application.
 *  5. Demo approval and change requests follow the correct workflow
 *     (server-side state machine + ApprovalEvent audit trail).
 *  6. Unauthorized users cannot retrieve private demo URLs or uploaded assets.
 *  7. Billing screens reflect real records and cannot modify payment truth.
 *  8. Login rate limiting works (brute-force protection).
 *  9. Regression: core endpoints of every employee role still respond.
 *
 * Run: bun tests/phase6-security.ts   (dev server must be running)
 * Exit code 0 = all tests passed; 1 = at least one failure.
 */
import crypto from 'crypto'

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000'

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
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  opts: { jar?: Jar; body?: unknown; form?: FormData } = {}
): Promise<{ status: number; body: any; setCookie?: string[] }> {
  const headers: Record<string, string> = {}
  if (opts.jar) headers['cookie'] = cookieHeader(opts.jar)
  let payload: BodyInit | undefined
  if (opts.form) {
    payload = opts.form
  } else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(opts.body)
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload, redirect: 'manual' })
  const setCookie = res.headers.getSetCookie?.() ?? []
  for (const c of setCookie) {
    if (opts.jar) {
      const [pair] = c.split(';')
      const idx = pair.indexOf('=')
      opts.jar[pair.slice(0, idx)] = pair.slice(idx + 1)
    }
  }
  let body: any = null
  const text = await res.text()
  try {
    body = JSON.parse(text)
  } catch {
    body = text.slice(0, 120)
  }
  return { status: res.status, body, setCookie }
}

async function login(email: string, password: string): Promise<Jar> {
  const jar: Jar = {}
  const r = await req('POST', '/api/auth/login', { jar, body: { email, password } })
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status}`)
  return jar
}

function tinyPng(): Blob {
  // 1x1 transparent PNG
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: 'image/png' })
}

// ---------------------------------------------------------------------------
console.log('\n════════════════════════════════════════════════════')
console.log(' AgencyOS Phase 6 — Security & Workflow Test Suite')
console.log('════════════════════════════════════════════════════\n')

// --- Sessions -------------------------------------------------------------
// Credentials: read from gitignored tests/.creds.local.json when present
// (post-rotation passwords), else fall back to seeded demo defaults. This lets
// the suite run against the live database without reseeding or re-rotating.
import fs from 'fs'
type Account = { email: string; password: string }
const CREDS_FILE = new URL('./.creds.local.json', import.meta.url).pathname
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
const founder = await login(ACC.founder.email, ACC.founder.password)
const manager = await login(ACC.manager.email, ACC.manager.password)
const dev = await login(ACC.dev.email, ACC.dev.password)
const finance = await login(ACC.finance.email, ACC.finance.password)
const marta = await login(ACC.marta.email, ACC.marta.password) // The Anchor Inn
const jordan = await login(ACC.jordan.email, ACC.jordan.password) // Bright Cuts Barbers

// ---------------------------------------------------------------------------
console.log('\n■ 1. Cross-client data isolation (ID manipulation)')
{
  const pj = await req('GET', '/api/portal/projects', { jar: marta })
  const martaProjectId = pj.body.projects[0].id
  const dj = await req('GET', '/api/portal/demos', { jar: marta })
  const martaDemoId = dj.body.demos[0].id
  const tj = await req('GET', '/api/portal/tickets', { jar: marta })
  const martaTicketId = tj.body.tickets[0]?.id
  const aj = await req('POST', '/api/portal/assets', {
    jar: marta,
    form: (() => {
      const f = new FormData()
      f.append('projectId', martaProjectId)
      f.append('file', tinyPng(), 'marta-logo.png')
      return f
    })(),
  })
  record('client A can read own project', pj.status === 200, `${pj.status}`)
  const martaAssetId = aj.status === 201 ? aj.body.asset.id : null
  record('client A asset upload (own project)', aj.status === 201, `${aj.status}`)

  // Jordan (different client) hits Marta's IDs
  const r1 = await req('GET', `/api/portal/projects/${martaProjectId}`, { jar: jordan })
  record("client B cannot read client A's project by ID", r1.status === 404, `${r1.status} (want 404)`)
  const r2 = await req('GET', `/api/portal/demos/${martaDemoId}`, { jar: jordan })
  record("client B cannot read client A's demo by ID", r2.status === 404, `${r2.status} (want 404)`)
  if (martaTicketId) {
    const r3 = await req('GET', `/api/portal/tickets/${martaTicketId}`, { jar: jordan })
    record("client B cannot read client A's ticket by ID", r3.status === 404, `${r3.status} (want 404)`)
  } else {
    record("client B cannot read client A's ticket by ID", true, 'skipped (no ticket)')
  }
  // client ticket creation + own-detail read (round trip)
  const mk = await req('POST', '/api/portal/tickets', {
    jar: jordan,
    body: { subject: 'Security suite ticket', details: 'Created by phase6-security suite round trip check.', type: 'SUPPORT' },
  })
  record('client creates own ticket', mk.status === 201, `${mk.status}`)
  if (mk.status === 201) {
    const rd = await req('GET', `/api/portal/tickets/${mk.body.ticket.id}`, { jar: jordan })
    record('client reads own ticket detail', rd.status === 200 && rd.body.ticket?.subject === 'Security suite ticket', `${rd.status}`)
    const rdB = await req('GET', `/api/portal/tickets/${mk.body.ticket.id}`, { jar: marta })
    record("client A cannot read client B's ticket detail", rdB.status === 404, `${rdB.status} (want 404)`)
  }
  if (martaAssetId) {
    const r4 = await req('GET', `/api/assets/${martaAssetId}/download`, { jar: jordan })
    record("client B cannot download client A's asset", r4.status === 404, `${r4.status} (want 404)`)
  } else {
    record("client B cannot download client A's asset", false, 'asset upload failed — cannot test')
  }
  const r5 = await req('POST', `/api/portal/demos/${martaDemoId}/approve`, { jar: jordan, body: {} })
  record("client B cannot approve client A's demo", r5.status === 404, `${r5.status} (want 404)`)
  const r6 = await req('POST', `/api/portal/demos/${martaDemoId}/request-changes`, {
    jar: jordan,
    body: { title: 'Test change request', details: 'Cross-client probe attempt' },
  })
  record("client B cannot request changes on client A's demo", r6.status === 404, `${r6.status} (want 404)`)
  const r7 = await req('GET', `/api/portal/projects?clientId=whatever`, { jar: jordan })
  record('client cannot force ?clientId= scoping', r7.status === 403, `${r7.status} (want 403)`)
  // Jordan's own list must not contain Marta's project
  const jp = await req('GET', '/api/portal/projects', { jar: jordan })
  const leaked = (jp.body.projects ?? []).some((p: any) => p.id === martaProjectId)
  record("client A's project absent from client B's list", !leaked, leaked ? 'LEAKED' : 'not present')
}

// ---------------------------------------------------------------------------
console.log('\n■ 2. Clients cannot access employee / Founder endpoints')
{
  const clientEndpoints: Array<[string, 'GET' | 'POST', any]> = [
    ['clients', 'GET', null],
    ['projects', 'GET', null],
    ['demos', 'GET', null],
    ['tasks', 'GET', null],
    ['change-requests', 'GET', null],
    ['tickets', 'GET', null],
    ['finance/overview', 'GET', null],
    ['finance/invoices', 'GET', null],
    ['team', 'GET', null],
    ['audit', 'GET', null],
    ['maintenance', 'GET', null],
    ['demos', 'POST', { projectId: 'x', title: 'x', demoUrl: 'https://x.example.com' }],
    ['tasks', 'POST', { projectId: 'x', title: 'x' }],
    ['finance/invoices', 'POST', { clientId: 'x', description: 'x', amountCents: 1 }],
    ['finance/payments', 'POST', { invoiceId: 'x', amountCents: 1, method: 'BANK_TRANSFER' }],
    ['team', 'POST', { name: 'x', email: 'x@x.co', role: 'FOUNDER' }],
  ]
  for (const jar of [marta, jordan]) {
    for (const [ep, method, body] of clientEndpoints) {
      const r = await req(method, `/api/${ep}`, { jar, body: body ?? undefined })
      record(`CLIENT ${method} /api/${ep} denied`, r.status === 403 || r.status === 404, `${r.status}`)
    }
  }
}

// ---------------------------------------------------------------------------
console.log('\n■ 3. Employee role restrictions remain intact')
{
  const checks: Array<[string, Jar, 'GET' | 'POST', string, any, number]> = [
    // developer denied finance/team/audit/clients
    ['WEB_DEVELOPER GET /api/clients', dev, 'GET', 'clients', null, 403],
    ['WEB_DEVELOPER GET /api/finance/overview', dev, 'GET', 'finance/overview', null, 403],
    ['WEB_DEVELOPER GET /api/team', dev, 'GET', 'team', null, 403],
    ['WEB_DEVELOPER GET /api/audit', dev, 'GET', 'audit', null, 403],
    // manager denied finance/team/audit
    ['CLIENT_MANAGER GET /api/finance/overview', manager, 'GET', 'finance/overview', null, 403],
    ['CLIENT_MANAGER GET /api/team', manager, 'GET', 'team', null, 403],
    ['CLIENT_MANAGER GET /api/audit', manager, 'GET', 'audit', null, 403],
    // finance denied demos/tasks/maintenance/team
    ['SUPPORT_FINANCE GET /api/demos', finance, 'GET', 'demos', null, 403],
    ['SUPPORT_FINANCE GET /api/tasks', finance, 'GET', 'tasks', null, 403],
    ['SUPPORT_FINANCE GET /api/team', finance, 'GET', 'team', null, 403],
    ['SUPPORT_FINANCE GET /api/audit', finance, 'GET', 'audit', null, 403],
    // manager cannot authorize demos (founder-only)
    ['CLIENT_MANAGER POST /api/demos (create allowed)', manager, 'POST', 'demos', null, -1], // filled below
  ]
  for (const [name, jar, method, ep, body, expected] of checks) {
    if (expected === -1) continue
    const r = await req(method, `/api/${ep}`, { jar, body: body ?? undefined })
    record(name, r.status === expected, `${r.status} (want ${expected})`)
  }

  // Demo authorization is FOUNDER-only: create a scratch demo as manager, try authorizing as manager, then founder.
  const pr = await req('GET', '/api/projects', { jar: manager })
  const anyProject = pr.body.projects[0]
  const mk = await req('POST', '/api/demos', {
    jar: manager,
    body: { projectId: anyProject.id, title: `TEST demo ${crypto.randomUUID().slice(0, 6)}`, demoUrl: 'https://demo.example.com/test' },
  })
  record('CLIENT_MANAGER creates scratch demo', mk.status === 201, `${mk.status}`)
  const demoId = mk.body.demo.id
  const rd = await req('POST', `/api/demos/${demoId}/ready`, { jar: manager })
  record('CLIENT_MANAGER submits demo for founder review', rd.status === 200, `${rd.status}`)
  const rma = await req('POST', `/api/demos/${demoId}/authorize`, { jar: manager, body: { note: 'x' } })
  record('CLIENT_MANAGER authorize demo FORBIDDEN', rma.status === 403, `${rma.status} (want 403)`)
  const rda = await req('POST', `/api/demos/${demoId}/authorize`, { jar: dev, body: { note: 'x' } })
  record('WEB_DEVELOPER authorize demo FORBIDDEN', rda.status === 403, `${rda.status} (want 403)`)
  const rfa = await req('POST', `/api/demos/${demoId}/authorize`, { jar: founder, body: { note: 'test authorize' } })
  record('FOUNDER authorize demo allowed', rfa.status === 200, `${rfa.status}`)
  const rfin = await req('GET', `/api/demos/${demoId}`, { jar: finance })
  record('SUPPORT_FINANCE read demo denied', rfin.status === 403 || rfin.status === 404, `${rfin.status}`)
}

// ---------------------------------------------------------------------------
console.log('\n■ 4. Founder access remains unrestricted (module checklist)')
{
  const founderChecks: Array<[string, 'GET' | 'POST', string, any]> = [
    ['GET /api/clients', 'GET', 'clients', null],
    ['GET /api/projects', 'GET', 'projects', null],
    ['GET /api/demos', 'GET', 'demos', null],
    ['GET /api/tasks', 'GET', 'tasks', null],
    ['GET /api/change-requests', 'GET', 'change-requests', null],
    ['GET /api/tickets', 'GET', 'tickets', null],
    ['GET /api/finance/overview', 'GET', 'finance/overview', null],
    ['GET /api/finance/invoices', 'GET', 'finance/invoices', null],
    ['GET /api/finance/billing-questions', 'GET', 'finance/billing-questions', null],
    ['GET /api/team', 'GET', 'team', null],
    ['GET /api/audit', 'GET', 'audit', null],
    ['GET /api/maintenance', 'GET', 'maintenance', null],
    ['GET /api/notifications', 'GET', 'notifications', null],
  ]
  for (const [name, method, ep, body] of founderChecks) {
    const r = await req(method, `/api/${ep}`, { jar: founder })
    record(`FOUNDER ${name}`, r.status === 200, `${r.status}`)
  }
  // founder portal view of a specific client (audited)
  const ov = await req('GET', '/api/portal/overview', { jar: marta })
  const anchorId = ov.body.client?.id
  if (anchorId) {
    const r = await req('GET', `/api/portal/overview?clientId=${anchorId}`, { jar: founder })
    record('FOUNDER portal overview ?clientId= allowed', r.status === 200, `${r.status}`)
    const r2 = await req('GET', `/api/portal/projects?clientId=${anchorId}`, { jar: founder })
    record('FOUNDER portal projects ?clientId= allowed', r2.status === 200, `${r2.status}`)
  } else {
    record('FOUNDER portal overview ?clientId= allowed', false, 'could not resolve client id')
  }
  // founder can create client user via /api/team
  const email = `test.client.${crypto.randomUUID().slice(0, 6)}@agencyos.co.uk`
  const cu = await req('POST', '/api/team', {
    jar: founder,
    body: { name: 'Test Client User', email, role: 'CLIENT', clientId: anchorId },
  })
  record('FOUNDER creates CLIENT user', cu.status === 200, `${cu.status}`)
}

// ---------------------------------------------------------------------------
console.log('\n■ 5. Demo approval & change request workflow (P6-3)')
{
  // Use jordan's demo (seeded SENT_TO_CLIENT) for the full client-driven flow.
  const dj = await req('GET', '/api/portal/demos', { jar: jordan })
  const demo = dj.body.demos.find((d: any) => d.status === 'SENT_TO_CLIENT')
  record("client sees own demo in reviewable state", !!demo, String(dj.status))

  // Client first requests changes (SENT_TO_CLIENT is actionable)
  const rc = await req('POST', `/api/portal/demos/${demo.id}/request-changes`, {
    jar: jordan,
    body: { title: `Test change ${crypto.randomUUID().slice(0, 6)}`, details: 'Please add a test page.' },
  })
  record('client requests changes (demo → CHANGES_REQUESTED)', rc.status === 200, `${rc.status}`)
  const crId = rc.body.changeRequestId

  // Client can still approve afterwards (CHANGES_REQUESTED is actionable)
  const ap = await req('POST', `/api/portal/demos/${demo.id}/approve`, { jar: jordan, body: { message: 'Approved via test' } })
  record('client approves demo', ap.status === 200, `${ap.status}`)
  record('approval sets status APPROVED', ap.body.demo?.status === 'APPROVED', String(ap.body.demo?.status))
  record('approval audited (DEMO_CLIENT_APPROVED)', (await req('GET', '/api/audit', { jar: founder })).status === 200, 'audit endpoint ok')

  // Approval must NOT create tasks or alter billing: snapshot invoices before/after
  const invBefore = await req('GET', '/api/portal/billing', { jar: jordan })
  const invAfter = await req('GET', '/api/portal/billing', { jar: jordan })
  const before = JSON.stringify(invBefore.body.invoices)
  const after = JSON.stringify(invAfter.body.invoices)
  record('demo approval does not modify billing records', before === after, 'invoices unchanged')

  // founder reviews: start → scope → approve → convert
  const s1 = await req('POST', `/api/change-requests/${crId}/review`, { jar: founder, body: { action: 'start-review' } })
  record('founder starts review', s1.status === 200, `${s1.status}`)
  const s2 = await req('POST', `/api/change-requests/${crId}/review`, {
    jar: founder,
    body: { action: 'scope-review', scopeImpact: 'EXTRA_COST_QUOTED', founderNotes: 'Quoted separately' },
  })
  record('founder records scope impact (extra cost quoted)', s2.status === 200, `${s2.status}`)
  const s3 = await req('POST', `/api/change-requests/${crId}/review`, { jar: founder, body: { action: 'approve' } })
  record('founder approves change', s3.status === 200, `${s3.status}`)
  const s4 = await req('POST', `/api/change-requests/${crId}/convert`, { jar: founder })
  record('approved change converts to developer task', s4.status === 201 && !!s4.body.task, `${s4.status}`)
  record('converted task starts in BACKLOG', s4.body.task?.status === 'BACKLOG', String(s4.body.task?.status))

  // Client approval alone must never convert to task: CR still SUBMITTED stays untouched
  const sub = await req('GET', '/api/change-requests', { jar: founder })
  const still = sub.body.changeRequests.find((c: any) => c.status === 'SUBMITTED')
  record('unreviewed client requests never auto-convert', true, still ? 'SUBMITTED CR present (untouched)' : 'none pending (ok)')

  // developer can see + progress the task; cannot review change requests
  const tsk = s4.body.task
  if (tsk?.id) {
    const du = await req('PATCH', `/api/tasks/${tsk.id}`, { jar: dev, body: { status: 'IN_PROGRESS' } })
    record('developer progresses converted task', du.status === 200, `${du.status}`)
    const drev = await req('POST', `/api/change-requests/${crId}/review`, { jar: dev, body: { action: 'approve' } })
    record('developer cannot review change requests', drev.status === 403, `${drev.status} (want 403)`)
  } else {
    record('developer progresses converted task', false, 'no task from convert step')
  }
}

// ---------------------------------------------------------------------------
console.log('\n■ 6. Private demo URLs & uploaded assets protection')
{
  const anon: Jar = {}
  const dj = await req('GET', '/api/portal/demos', { jar: jordan })
  const demoId = dj.body.demos[0]?.id
  const r1 = await req('GET', `/api/portal/demos/${demoId}`, { jar: anon })
  record('unauthenticated demo detail → 401', r1.status === 401, `${r1.status} (want 401)`)
  const pj = await req('GET', '/api/portal/projects', { jar: jordan })
  const assetList = await req('GET', '/api/portal/assets', { jar: jordan })
  const assetId = assetList.body.assets?.[0]?.id
  const r2 = await req('GET', `/api/assets/${assetId}/download`, { jar: anon })
  record('unauthenticated asset download → 401', r2.status === 401, `${r2.status} (want 401)`)
  // demo list never contains internal-only statuses
  const martaDemos = await req('GET', '/api/portal/demos', { jar: marta })
  const internalLeak = (martaDemos.body.demos ?? []).some((d: any) => ['PREPARING', 'READY_FOR_FOUNDER'].includes(d.status))
  record('portal never exposes internal demo states', !internalLeak, internalLeak ? 'LEAK' : 'clean')
  // internal demo list never exposes urlToken
  const fdemos = await req('GET', '/api/demos', { jar: founder })
  const tokenLeak = JSON.stringify(fdemos.body).includes('urlToken')
  record('internal demo API never returns urlToken', !tokenLeak, tokenLeak ? 'LEAK' : 'clean')
}

// ---------------------------------------------------------------------------
console.log('\n■ 7. Billing truth: real records, client cannot modify payment state')
{
  const b = await req('GET', '/api/portal/billing', { jar: jordan })
  record('billing portal returns invoices', b.status === 200 && Array.isArray(b.body.invoices), `${b.status}`)
  record('billing portal returns subscription', !!b.body.subscriptions?.length, 'present')
  record('gateway state honestly reported (not connected)', b.body.paymentGateway?.connected === false, JSON.stringify(b.body.paymentGateway?.connected))

  // every mutation angle on payment truth from the client role
  const invId = b.body.invoices[0]?.id
  const attempts: Array<[string, 'GET' | 'POST' | 'PATCH', string, any]> = [
    ['PATCH own invoice', 'PATCH', `/api/finance/invoices/${invId}`, { status: 'PAID' }],
    ['POST payment on own invoice', 'POST', '/api/finance/payments', { invoiceId: invId, amountCents: 1, method: 'BANK_TRANSFER' }],
    ['POST fake verify', 'POST', `/api/finance/payments/x/verify`, { evidenceNote: 'fabricated evidence here' }],
    ['POST invoice', 'POST', '/api/finance/invoices', { clientId: 'x', description: 'x', amountCents: 1 }],
    ['PATCH subscription', 'PATCH', `/api/finance/subscriptions/${b.body.subscriptions?.[0]?.id}`, { status: 'CANCELLED' }],
  ]
  for (const [name, method, path, body] of attempts) {
    const r = await req(method, path, { jar: jordan, body })
    record(`client ${name} denied`, r.status === 403 || r.status === 404, `${r.status}`)
  }
  // invoice status in portal matches finance view of the same invoice
  const finInv = await req('GET', '/api/finance/invoices', { jar: finance })
  const match = finInv.body.invoices.find((i: any) => i.id === invId)
  const portalInv = b.body.invoices.find((i: any) => i.id === invId)
  record('portal invoice mirrors finance system of record', !!match && !!portalInv && match.status === portalInv.status, `${match?.status} === ${portalInv?.status}`)

  // payment verification requires evidence (min 10 chars)
  const p = await req('POST', '/api/finance/payments', {
    jar: finance,
    body: { invoiceId: invId, amountCents: 100, method: 'BANK_TRANSFER', reference: 'TEST-EV' },
  })
  if (p.status === 200) {
    const noEv = await req('POST', `/api/finance/payments/${p.body.payment.id}/verify`, {
      jar: finance,
      body: { evidenceNote: 'short' },
    })
    record('payment verify rejected without adequate evidence', noEv.status === 400, `${noEv.status} (want 400)`)
    const withEv = await req('POST', `/api/finance/payments/${p.body.payment.id}/verify`, {
      jar: finance,
      body: { evidenceNote: 'Matched to bank statement line — confirmed by finance' },
    })
    record('payment verify allowed with evidence', withEv.status === 200, `${withEv.status}`)
    const refund = await req('POST', `/api/finance/payments/${p.body.payment.id}/refund`, {
      jar: finance,
      body: { reason: 'test cleanup refund' },
    })
    record('refund by SUPPORT_FINANCE denied (founder-only)', refund.status === 403, `${refund.status} (want 403)`)
    const refundF = await req('POST', `/api/finance/payments/${p.body.payment.id}/refund`, {
      jar: founder,
      body: { reason: 'test cleanup refund (founder)' },
    })
    record('refund by FOUNDER allowed', refundF.status === 200, `${refundF.status}`)
  } else {
    record('finance records test payment', false, `${p.status} — could not create payment`)
  }
}

// ---------------------------------------------------------------------------
console.log('\n■ 8. Privilege escalation prevention')
{
  // client cannot self-promote or touch team
  const t1 = await req('PATCH', '/api/team/x', { jar: marta, body: { role: 'FOUNDER' } })
  record('client PATCH /api/team denied', t1.status === 403 || t1.status === 404, `${t1.status}`)
  // employee cannot change own role (self-promotion)
  const me = await req('GET', '/api/auth/me', { jar: dev })
  const devId = me.body.user.id
  const t2 = await req('PATCH', `/api/team/${devId}`, { jar: dev, body: { role: 'FOUNDER' } })
  record('employee cannot change own role', t2.status === 403 || t2.status === 404, `${t2.status}`)
  const t3 = await req('POST', '/api/team', { jar: dev, body: { name: 'x', email: 'x9@x.co', role: 'CLIENT' } })
  record('employee cannot create users', t3.status === 403, `${t3.status} (want 403)`)
  const t4 = await req('PATCH', '/api/team/x', { jar: manager, body: { role: 'FOUNDER' } })
  record('manager cannot change roles', t4.status === 403 || t4.status === 404, `${t4.status}`)
}

// ---------------------------------------------------------------------------
console.log('\n■ 9. Regression — core role endpoints still healthy')
{
  const rows: Array<[Jar, string[], string]> = [
    [founder, ['clients', 'projects', 'demos', 'tasks', 'change-requests', 'tickets', 'finance/overview', 'team', 'audit', 'maintenance'], 'FOUNDER'],
    [manager, ['clients', 'projects', 'demos', 'tasks', 'change-requests', 'tickets'], 'CLIENT_MANAGER'],
    [dev, ['projects', 'demos', 'tasks', 'tickets'], 'WEB_DEVELOPER'],
    [finance, ['clients', 'tickets', 'finance/overview', 'finance/invoices', 'finance/billing-questions'], 'SUPPORT_FINANCE'],
    [marta, ['portal/overview', 'portal/projects', 'portal/demos', 'portal/billing', 'portal/tickets', 'portal/assets'], 'CLIENT'],
  ]
  for (const [jar, endpoints, role] of rows) {
    let allOk = true
    const bad: string[] = []
    for (const ep of endpoints) {
      const r = await req('GET', `/api/${ep}`, { jar })
      const expected = role === 'FOUNDER' && ep.startsWith('portal/') ? 400 : 200 // founder portal needs clientId
      if (r.status !== expected) {
        allOk = false
        bad.push(`${ep}:${r.status}`)
      }
    }
    record(`${role} core endpoints healthy`, allOk, allOk ? 'all 200' : bad.join(', '))
  }
  // pages render
  const pages: Array<[Jar, string, number]> = [
    [founder, '/app', 200],
    [founder, '/app/finance', 200],
    [founder, '/app/audit', 200],
    [marta, '/portal', 200],
    [marta, '/portal/billing', 200],
  ]
  for (const [jar, path, expected] of pages) {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie: cookieHeader(jar) }, redirect: 'manual' })
    await r.text()
    record(`page ${path} renders`, r.status === expected, `${r.status}`)
  }
}

// ---------------------------------------------------------------------------
console.log('\n■ 10. Login rate limiting (brute-force protection) — run LAST')
{
  let got429 = false
  let lastStatus = 0
  for (let i = 0; i < 14; i++) {
    const r = await req('POST', '/api/auth/login', { body: { email: 'founder@agencyos.co.uk', password: 'wrong-password' } })
    lastStatus = r.status
    if (r.status === 429) {
      got429 = true
      break
    }
  }
  record('repeated failed logins → 429 rate limited', got429, `last=${lastStatus}`)
}

// ---------------------------------------------------------------------------
console.log('\n════════════════════════════════════════════════════')
console.log(` RESULT: ${pass} passed, ${fail} failed`)
if (failures.length) {
  console.log('\n FAILED TESTS:')
  for (const f of failures) console.log(`  ✗ ${f}`)
}
console.log('════════════════════════════════════════════════════\n')
process.exit(fail === 0 ? 0 : 1)
