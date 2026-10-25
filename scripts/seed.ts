/**
 * AgencyOS seed — creates founder, staff, clients, portal users, website + video projects,
 * deliverables across production stages, equipment, a scheduled shoot, tasks, invoices,
 * meetings, contacts and notifications.
 *
 * Idempotent: exits cleanly if the founder account already exists.
 * Passwords are RANDOM (never default) and written ONLY to .seed-credentials (gitignored).
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'
import { writeFileSync, appendFileSync } from 'fs'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}
function strongPassword(): string {
  return randomBytes(12).toString('base64url') + 'aA1!'
}
function ref(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString('hex').toUpperCase()}`
}

async function main() {
  const existing = await db.employee.findUnique({ where: { email: 'founder@agencyos.local' } })
  if (existing) {
    console.log('Seed already applied (founder exists). Skipping.')
    return
  }

  const creds: string[] = ['AgencyOS seed credentials — ' + new Date().toISOString(), 'CHANGE ALL PASSWORDS AFTER FIRST SIGN-IN', '']

  // ── Founder & staff ──────────────────────────────────────────
  const staffSpec = [
    { name: 'Founder', email: 'founder@agencyos.local', role: 'OWNER' as const, title: 'Founder & Managing Director' },
    { name: 'Priya Sharma', email: 'priya@agencyos.local', role: 'CLIENT_MANAGER' as const, title: 'Client Manager' },
    { name: 'Daniel Osei', email: 'daniel@agencyos.local', role: 'WEB_DEVELOPER' as const, title: 'Web Developer' },
    { name: 'Hannah Wells', email: 'hannah@agencyos.local', role: 'SUPPORT_FINANCE' as const, title: 'Support & Finance' },
    { name: 'Marcus Reid', email: 'marcus@agencyos.local', role: 'VIDEOGRAPHER' as const, title: 'Videographer' },
    { name: 'Elena Kovacs', email: 'elena@agencyos.local', role: 'VIDEO_EDITOR' as const, title: 'Video Editor' },
    { name: 'Tom Ashworth', email: 'tom@agencyos.local', role: 'CREATIVE_DIRECTOR' as const, title: 'Creative Director' },
  ]
  const staff: Record<string, string> = {}
  for (const s of staffSpec) {
    const pw = strongPassword()
    const emp = await db.employee.create({
      data: { name: s.name, email: s.email, role: s.role, title: s.title, passwordHash: hashPassword(pw) },
    })
    staff[s.role] = emp.id
    creds.push(`STAFF ${s.role}: ${s.email} / ${pw}`)
  }

  // ── Clients & portal users ───────────────────────────────────
  const anchorPw = strongPassword()
  const brightcutsPw = strongPassword()
  const anchor = await db.client.create({
    data: {
      name: 'The Anchor Bar & Grill', businessCategory: 'Restaurant',
      contactName: 'Marta Silva', contactEmail: 'marta@anchorbar.local', contactPhone: '+44 20 7946 0101',
      address: '12 Riverside Walk, London', notes: 'Website + monthly reels retainer.',
    },
  })
  const brightcuts = await db.client.create({
    data: {
      name: 'Brightcuts Consulting', businessCategory: 'Corporate',
      contactName: 'Jordan Blake', contactEmail: 'jordan@brightcuts.local', contactPhone: '+44 20 7946 0202',
      address: '4th Floor, Kings Court, Manchester', notes: 'Corporate brand film project.',
    },
  })
  const marta = await db.clientUser.create({
    data: { name: 'Marta Silva', email: 'marta@anchorbar.local', clientId: anchor.id, passwordHash: hashPassword(anchorPw) },
  })
  const jordan = await db.clientUser.create({
    data: { name: 'Jordan Blake', email: 'jordan@brightcuts.local', clientId: brightcuts.id, passwordHash: hashPassword(brightcutsPw) },
  })
  creds.push('')
  creds.push(`CLIENT PORTAL (The Anchor): marta@anchorbar.local / ${anchorPw}`)
  creds.push(`CLIENT PORTAL (Brightcuts): jordan@brightcuts.local / ${brightcutsPw}`)

  // ── Website project ──────────────────────────────────────────
  const web = await db.project.create({
    data: {
      reference: ref('WEB'), name: 'Anchor Website Rebuild', serviceType: 'WEBSITE',
      clientId: anchor.id, managerId: staff['CLIENT_MANAGER'],
      status: 'IN_PROGRESS', priority: 'HIGH',
      brief: 'Modern restaurant website with online menu, booking CTA and events page.',
      startDate: new Date('2026-10-05'), targetDate: new Date('2026-11-20'), agreedPrice: 2400, budget: 2400,
    },
  })
  await db.task.create({ data: { title: 'Design homepage concepts', projectId: web.id, assigneeId: staff['WEB_DEVELOPER'], createdById: staff['OWNER'], status: 'DONE', priority: 'HIGH' } })
  await db.task.create({ data: { title: 'Build menu & booking pages', projectId: web.id, assigneeId: staff['WEB_DEVELOPER'], createdById: staff['OWNER'], status: 'IN_PROGRESS', priority: 'MEDIUM', dueDate: new Date('2026-11-05') } })

  // ── Video package ────────────────────────────────────────────
  const pkg = await db.videoPackage.create({
    data: {
      name: 'Restaurant Monthly Reels — 6 Videos', description: 'Six short-form social reels per month for restaurants.',
      businessCategory: 'Restaurant', videoCount: 6, shootSessions: 1, shootDurationHours: 4,
      revisionRounds: 2, deliverableFormats: '9:16 vertical, 1080x1920', turnaroundDays: 7,
      licensingTerms: 'Full usage rights for client social channels', additionalWorkTerms: 'Extra reel £95 each',
      price: 720,
      deliverableTemplate: JSON.stringify([
        { title: 'Signature dish hero reel', category: 'FOOD_SOCIAL_REEL', platform: 'Instagram', aspectRatio: '9:16', durationSec: 30 },
        { title: 'Behind the scenes reel', category: 'FOOD_SOCIAL_REEL', platform: 'Instagram', aspectRatio: '9:16', durationSec: 30 },
        { title: 'Chef interview clip', category: 'PERSONAL_BRAND', platform: 'Instagram', aspectRatio: '9:16', durationSec: 45 },
        { title: 'Cocktail bar reel', category: 'FOOD_SOCIAL_REEL', platform: 'Instagram', aspectRatio: '9:16', durationSec: 20 },
        { title: 'Weekend atmosphere reel', category: 'RESTAURANT_PROMO', platform: 'TikTok', aspectRatio: '9:16', durationSec: 25 },
        { title: 'Sunday roast promo', category: 'RESTAURANT_PROMO', platform: 'Facebook', aspectRatio: '9:16', durationSec: 30 },
      ]),
    },
  })

  // ── Video project (snapshot of package at contract time) ─────
  const vp = await db.project.create({
    data: {
      reference: ref('VP'), name: 'Anchor October Reels', serviceType: 'VIDEO_PRODUCTION',
      clientId: anchor.id, managerId: staff['CLIENT_MANAGER'],
      status: 'IN_PROGRESS', priority: 'MEDIUM',
      brief: 'Monthly reels package — October batch.', startDate: new Date('2026-10-10'),
      targetDate: new Date('2026-11-10'), agreedPrice: 720, budget: 720,
    },
  })
  const videoProject = await db.videoProject.create({
    data: {
      projectId: vp.id, businessCategory: 'Restaurant',
      campaignObjective: 'Drive weekend bookings and grow Instagram following',
      targetAudience: 'Local foodies, 25–45', distributionPlatforms: 'Instagram, TikTok, Facebook',
      targetFormats: '9:16 vertical', shootLocations: 'The Anchor Bar & Grill, Riverside Walk',
      packageId: pkg.id, packageNameSnapshot: pkg.name, agreedVideoCount: 6, revisionAllowance: 2,
      clientVisibleNotes: 'Filming day scheduled — see your portal for times.',
    },
  })

  const template = JSON.parse(pkg.deliverableTemplate!) as Array<{ title: string; category: string; platform: string; aspectRatio: string; durationSec: number }>
  const statuses = ['DELIVERED', 'DELIVERED', 'APPROVED', 'CLIENT_REVIEW', 'EDITING', 'SCHEDULED'] as const
  const now = Date.now()
  for (let i = 0; i < template.length; i++) {
    const t = template[i]
    const status = statuses[i]
    const d = await db.videoDeliverable.create({
      data: {
        reference: ref('VD'), projectId: vp.id, videoProjectId: videoProject.id,
        title: t.title, category: t.category as 'FOOD_SOCIAL_REEL', status,
        priority: 'MEDIUM', targetPlatform: t.platform, aspectRatio: t.aspectRatio,
        targetDurationSec: t.durationSec, videographerId: staff['VIDEOGRAPHER'], editorId: staff['VIDEO_EDITOR'],
        revisionAllowance: 2, deadline: new Date(now + (i + 3) * 86400000),
        ...(status === 'DELIVERED' ? { deliveredAt: new Date(now - 86400000), deliveryReference: 'Frame.io link shared via email', footageBackupVerified: true, footageReceivedAt: new Date(now - 5 * 86400000), shootCompletedAt: new Date(now - 6 * 86400000), actualShootDate: new Date(now - 6 * 86400000) } : {}),
        ...(status === 'APPROVED' ? { footageBackupVerified: true, footageReceivedAt: new Date(now - 4 * 86400000), shootCompletedAt: new Date(now - 6 * 86400000), actualShootDate: new Date(now - 6 * 86400000) } : {}),
        ...(status === 'CLIENT_REVIEW' ? { footageBackupVerified: true, footageReceivedAt: new Date(now - 3 * 86400000), shootCompletedAt: new Date(now - 6 * 86400000), actualShootDate: new Date(now - 6 * 86400000), currentVersionNumber: 1 } : {}),
        ...(status === 'EDITING' ? { footageBackupVerified: true, footageReceivedAt: new Date(now - 2 * 86400000) } : {}),
        ...(status === 'SCHEDULED' ? { plannedShootDate: new Date(now + 2 * 86400000) } : {}),
      },
    })
    if (status === 'CLIENT_REVIEW') {
      await db.videoVersion.create({
        data: {
          deliverableId: d.id, versionNumber: 1, previewReference: 'https://preview.agencyos.local/anchor-dish-v1',
          uploadedById: staff['VIDEO_EDITOR'], uploadedByName: 'Elena Kovacs',
          changeSummary: 'First cut — signature dish hero', reviewStatus: 'PENDING_CLIENT',
        },
      })
    }
    if (status === 'DELIVERED') {
      await db.videoVersion.create({
        data: {
          deliverableId: d.id, versionNumber: 1, previewReference: 'https://preview.agencyos.local/final-v1',
          uploadedById: staff['VIDEO_EDITOR'], uploadedByName: 'Elena Kovacs',
          reviewStatus: 'APPROVED', approvedAt: new Date(now - 2 * 86400000),
        },
      })
    }
  }

  // ── Equipment ────────────────────────────────────────────────
  const cam = await db.equipmentItem.create({ data: { name: 'Sony FX3 Body #1', category: 'Camera', serial: 'FX3-001' } })
  await db.equipmentItem.create({ data: { name: 'Sony FX3 Body #2', category: 'Camera', serial: 'FX3-002' } })
  await db.equipmentItem.create({ data: { name: 'DJI Ronin RS4 Pro', category: 'Gimbal', serial: 'RS4-114' } })
  await db.equipmentItem.create({ data: { name: 'Godox SL150 II Kit', category: 'Lighting', serial: 'GDX-77' } })
  await db.equipmentItem.create({ data: { name: 'Sennheiser MKH416', category: 'Audio', serial: 'SEN-416' } })

  // ── Shoot session (scheduled, with crew + equipment) ─────────
  const shootDate = new Date(now + 2 * 86400000)
  const shoot = await db.shootSession.create({
    data: {
      reference: ref('SH'), projectId: vp.id, title: 'Anchor October Filming Day',
      date: shootDate, startTime: '09:00', endTime: '13:00', timezone: 'Europe/London',
      address: 'The Anchor Bar & Grill, 12 Riverside Walk, London',
      locationNotes: 'Back entrance for kit load-in. Park in bays 3–4.', managerId: staff['CLIENT_MANAGER'],
      clientContact: 'Marta Silva (on-site)', accessArrangements: 'Kitchen access from 08:30',
      callSheetNotes: 'Focus on signature dish + cocktail bar first while light is best.',
      transportNotes: 'Van booked', budgetedTravelCost: 24, status: 'SCHEDULED',
    },
  })
  await db.shootAssignment.create({ data: { sessionId: shoot.id, employeeId: staff['VIDEOGRAPHER'], crewRole: 'VIDEOGRAPHER' } })
  await db.shootAssignment.create({ data: { sessionId: shoot.id, employeeId: staff['CLIENT_MANAGER'], crewRole: 'MANAGER' } })
  const scheduled = await db.videoDeliverable.findFirst({ where: { projectId: vp.id, status: 'SCHEDULED' } })
  if (scheduled) await db.shootDeliverable.create({ data: { sessionId: shoot.id, deliverableId: scheduled.id } })
  await db.equipmentReservation.create({ data: { itemId: cam.id, sessionId: shoot.id, startAt: new Date(shootDate.setHours(0, 0, 0, 0)), endAt: new Date(shootDate.setHours(23, 59, 59, 999)) } })

  // ── Expenses ─────────────────────────────────────────────────
  await db.productionExpense.create({ data: { projectId: vp.id, category: 'TRAVEL_FUEL', description: 'Van fuel — recce + shoot day', amount: 34.5, recordedById: staff['OWNER'] } })
  await db.productionExpense.create({ data: { projectId: vp.id, category: 'MUSIC_LICENCE', description: 'Artlist monthly licence allocation', amount: 9.99, recordedById: staff['OWNER'] } })

  // ── Invoices ─────────────────────────────────────────────────
  await db.invoice.create({ data: { number: ref('INV'), clientId: anchor.id, projectId: web.id, amount: 1200, status: 'PAID', issuedAt: new Date(now - 20 * 86400000), paidAt: new Date(now - 12 * 86400000), dueDate: new Date(now - 5 * 86400000), notes: 'Website rebuild — 50% deposit' } })
  await db.invoice.create({ data: { number: ref('INV'), clientId: anchor.id, projectId: vp.id, amount: 720, status: 'SENT', issuedAt: new Date(now - 3 * 86400000), dueDate: new Date(now + 11 * 86400000), notes: 'October reels package' } })

  // ── Meetings, contacts, tickets ──────────────────────────────
  await db.meeting.create({ data: { title: 'Anchor website walkthrough', clientId: anchor.id, projectId: web.id, startAt: new Date(now + 86400000), endAt: new Date(now + 86400000 + 3600000), location: 'Google Meet', notes: 'Review homepage concepts' } })
  await db.contact.create({ data: { name: 'Marta Silva', email: 'marta@anchorbar.local', phone: '+44 20 7946 0101', company: 'The Anchor Bar & Grill', jobTitle: 'Owner', clientId: anchor.id, createdById: staff['OWNER'] } })
  await db.contact.create({ data: { name: 'Jordan Blake', email: 'jordan@brightcuts.local', phone: '+44 20 7946 0202', company: 'Brightcuts Consulting', jobTitle: 'Marketing Lead', clientId: brightcuts.id, createdById: staff['OWNER'] } })

  // ── Corporate brand film project (Brightcuts, PLANNED stage) ─
  const bp = await db.project.create({
    data: {
      reference: ref('VP'), name: 'Brightcuts Corporate Brand Film', serviceType: 'VIDEO_PRODUCTION',
      clientId: brightcuts.id, managerId: staff['CLIENT_MANAGER'], status: 'DISCOVERY', priority: 'LOW',
      brief: '2–3 minute corporate brand film for website and LinkedIn.', targetDate: new Date(now + 30 * 86400000), agreedPrice: 3500, budget: 3500,
    },
  })
  const bvp = await db.videoProject.create({
    data: { projectId: bp.id, businessCategory: 'Corporate', campaignObjective: 'Brand trust for enterprise clients', targetAudience: 'B2B decision makers', distributionPlatforms: 'Website, LinkedIn', agreedVideoCount: 1, revisionAllowance: 2 },
  })
  await db.videoDeliverable.create({
    data: { reference: ref('VD'), projectId: bp.id, videoProjectId: bvp.id, title: 'Corporate brand film', category: 'CORPORATE_BRAND_FILM', status: 'PLANNED', priority: 'LOW', aspectRatio: '16:9', targetDurationSec: 150, deadline: new Date(now + 25 * 86400000), revisionAllowance: 2 },
  })

  // ── Public-site portfolio (clearly-labelled sample projects) ─
  const { seedPortfolio } = await import('./seed-portfolio')
  await seedPortfolio(db)

  // ── App settings ─────────────────────────────────────────────
  await db.appSetting.create({ data: { key: 'agencyName', value: 'AgencyOS Studio' } })
  await db.appSetting.create({ data: { key: 'supportEmail', value: 'support@agencyos.local' } })
  await db.appSetting.create({ data: { key: 'internalQcChecklist', value: 'Correct aspect ratio and resolution\nAudio clarity and levels\nColour consistency\nCaptions and spelling\nBrand assets\nMusic rights\nCorrect export duration\nCorrect call to action\nClient brief compliance\nFinal playback verification' } })

  // ── Welcome notification for founder ─────────────────────────
  await db.notification.create({ data: { userType: 'EMPLOYEE', userId: staff['OWNER'], type: 'WELCOME', title: 'Welcome to AgencyOS', body: 'Video Production division is live. Seed data loaded for verification.', link: '/app' } })

  writeFileSync('.seed-credentials', creds.join('\n') + '\n')
  console.log('Seed complete. Credentials written to .seed-credentials (gitignored).')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
