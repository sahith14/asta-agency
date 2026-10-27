/**
 * AgencyOS — Sample data API (for evaluators / demos).
 * POST   /api/settings/sample-data → create a clearly-labelled demo dataset.
 * DELETE /api/settings/sample-data → remove every isSample record (cascades).
 *
 * Every created row is flagged `isSample: true` and names are prefixed with
 * "SAMPLE — " so they can never be mistaken for real client work.
 */
import { db } from "@/lib/db";
import { ConflictError, jsonOk, withAuth } from "@/lib/api";
import { requireFounder } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

const DAY_MS = 24 * 60 * 60 * 1000;

export const POST = withAuth(async (req, user) => {
  // RBAC: seeding/clearing demo data is founder-only.
  requireFounder(user);
  const existing = await db.client.findFirst({ where: { isSample: true }, select: { id: true } });
  if (existing) {
    throw new ConflictError("Sample data already loaded. Remove it first.");
  }

  const now = new Date();
  const daysFromNow = (days: number) => new Date(now.getTime() + days * DAY_MS);
  const todayAt = (hour: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);

  const counts = await db.$transaction(async (tx) => {
    // --- Client 1: The Corner Bakery (active, live brochure site) ---------
    const bakery = await tx.client.create({
      data: {
        businessName: "SAMPLE — The Corner Bakery",
        clientType: "RESTAURANT_CAFE",
        status: "ACTIVE",
        primaryContactName: "Sarah Whitfield",
        email: "hello@thecornerbakery.co.uk",
        phone: "01632 960 431",
        billingAddress: "12 Mill Lane, York, YO1 9QA",
        notes:
          "Sample record — family-run bakery, site launched last year, on a Standard maintenance plan.",
        isSample: true,
      },
    });
    await tx.contact.create({
      data: {
        clientId: bakery.id,
        name: "Sarah Whitfield",
        email: "sarah@thecornerbakery.co.uk",
        phone: "01632 960 431",
        jobTitle: "Owner",
        isPrimary: true,
      },
    });
    const bakerySite = await tx.website.create({
      data: {
        clientId: bakery.id,
        name: "SAMPLE — The Corner Bakery Brochure Site",
        primaryDomain: "thecornerbakery.co.uk",
        lifecycleStatus: "LIVE",
        environment: "PRODUCTION",
        websiteType: "BROCHURE",
        framework: "Next.js",
        hostingProvider: "Vercel",
        productionUrl: "https://www.thecornerbakery.co.uk",
        domainRenewalDate: daysFromNow(18),
        sslExpiryDate: daysFromNow(25),
        maintenanceCoverage: "STANDARD",
        launchDate: daysFromNow(-260),
        technicalNotes:
          "Sample record — hosted on Vercel, DNS at Cloudflare, SSL via Let's Encrypt auto-renew.",
        isSample: true,
      },
    });
    await tx.domain.create({
      data: {
        websiteId: bakerySite.id,
        domainName: "thecornerbakery.co.uk",
        registrar: "Cloudflare",
        renewalDate: daysFromNow(18),
        autoRenew: true,
      },
    });

    // --- Client 2: Fade & Fone Barbershop (active, site in development) ----
    const barbershop = await tx.client.create({
      data: {
        businessName: "SAMPLE — Fade & Fone Barbershop",
        clientType: "BARBER_SALON",
        status: "ACTIVE",
        primaryContactName: "Marcus Dyer",
        email: "bookings@fadeandfone.co.uk",
        phone: "0114 496 0213",
        billingAddress: "48 London Road, Sheffield, S2 4LR",
        notes: "Sample record — booking website in development, launch planned this quarter.",
        isSample: true,
      },
    });
    await tx.contact.create({
      data: {
        clientId: barbershop.id,
        name: "Marcus Dyer",
        email: "marcus@fadeandfone.co.uk",
        phone: "0114 496 0213",
        jobTitle: "Manager",
        isPrimary: true,
      },
    });
    await tx.website.create({
      data: {
        clientId: barbershop.id,
        name: "SAMPLE — Fade & Fone Booking Site",
        primaryDomain: "fadeandfone.co.uk",
        lifecycleStatus: "IN_DEVELOPMENT",
        environment: "DEVELOPMENT",
        websiteType: "BOOKING",
        framework: "Next.js",
        hostingProvider: "Vercel",
        stagingUrl: "https://staging.fadeandfone.co.uk",
        deploymentProjectRef: "fadeandfone",
        domainRenewalDate: daysFromNow(75),
        sslExpiryDate: daysFromNow(80),
        maintenanceCoverage: "BASIC",
        technicalNotes: "Sample record — hosted on Vercel preview deployments, go-live pending content.",
        isSample: true,
      },
    });

    // --- Client 3: Riverside Motors (prospect) -----------------------------
    const motors = await tx.client.create({
      data: {
        businessName: "SAMPLE — Riverside Motors",
        clientType: "MECHANIC_GARAGE",
        status: "PROSPECT",
        primaryContactName: "Priya Shah",
        email: "priya@riversidemotors.co.uk",
        phone: "01332 448 902",
        billingAddress: "7 Riverside Way, Derby, DE1 3BB",
        notes: "Sample record — prospect, enquiry received, quote to follow.",
        isSample: true,
      },
    });
    await tx.contact.create({
      data: {
        clientId: motors.id,
        name: "Priya Shah",
        email: "priya@riversidemotors.co.uk",
        phone: "01332 448 902",
        jobTitle: "Director",
        isPrimary: true,
      },
    });

    // --- Projects ----------------------------------------------------------
    const bakeryProject = await tx.project.create({
      data: {
        clientId: bakery.id,
        name: "SAMPLE — Bakery Website Refresh",
        projectType: "REDESIGN",
        status: "READY_TO_LAUNCH",
        scope:
          "Sample record — refresh of menu pages, new photo gallery and a faster pre-order enquiry flow.",
        agreedAmountMinor: 180000, // £1,800.00 in pence
        currency: "GBP",
        startDate: daysFromNow(-30),
        dueDate: daysFromNow(7),
        isSample: true,
      },
    });
    await tx.projectWebsite.create({
      data: { projectId: bakeryProject.id, websiteId: bakerySite.id },
    });
    await tx.milestone.create({
      data: { projectId: bakeryProject.id, title: "SAMPLE — Design approved", completedAt: daysFromNow(-14), position: 0 },
    });
    await tx.milestone.create({
      data: { projectId: bakeryProject.id, title: "SAMPLE — Build complete", completedAt: daysFromNow(-3), position: 1 },
    });
    await tx.milestone.create({
      data: { projectId: bakeryProject.id, title: "SAMPLE — Launch & go live", dueDate: daysFromNow(5), position: 2 },
    });

    await tx.project.create({
      data: {
        clientId: motors.id,
        name: "SAMPLE — Riverside Motors New Site",
        projectType: "NEW_WEBSITE",
        status: "LEAD",
        scope: "Sample record — new 5-page brochure site with a booking enquiry form.",
        currency: "GBP",
        isSample: true,
      },
    });

    // --- Tasks --------------------------------------------------------------
    await tx.task.create({
      data: {
        title: "SAMPLE — Fix contact form validation on bakery site",
        description: "Sample record — spam getting through; tighten honeypot and add server-side checks.",
        status: "TODO",
        priority: "HIGH",
        dueAt: daysFromNow(-3), // overdue
        clientId: bakery.id,
        websiteId: bakerySite.id,
        projectId: bakeryProject.id,
        assigneeId: user.id,
        createdById: user.id,
        isSample: true,
      },
    });
    await tx.task.create({
      data: {
        title: "SAMPLE — Send staging link to Fade & Fone",
        description: "Sample record — demo staging deployment and gather feedback on booking flow.",
        status: "IN_PROGRESS",
        priority: "NORMAL",
        dueAt: todayAt(17), // due today
        clientId: barbershop.id,
        assigneeId: user.id,
        createdById: user.id,
        isSample: true,
      },
    });
    await tx.task.create({
      data: {
        title: "SAMPLE — Prepare monthly SEO report for bakery",
        status: "TODO",
        priority: "NORMAL",
        dueAt: daysFromNow(7), // next week
        clientId: bakery.id,
        websiteId: bakerySite.id,
        assigneeId: user.id,
        createdById: user.id,
        isSample: true,
      },
    });
    await tx.task.create({
      data: {
        title: "SAMPLE — Send introductory quote to Riverside Motors",
        status: "COMPLETED",
        priority: "NORMAL",
        dueAt: daysFromNow(-1),
        completedAt: daysFromNow(-1),
        clientId: motors.id,
        assigneeId: user.id,
        createdById: user.id,
        isSample: true,
      },
    });

    return {
      clients: 3,
      contacts: 3,
      websites: 2,
      domains: 1,
      projects: 2,
      milestones: 3,
      tasks: 4,
    };
  });

  await logActivity({
    action: "SAMPLE_DATA_LOADED",
    entityType: "SAMPLE_DATA",
    entityId: null,
    entityLabel: "Sample data",
    summary: `Loaded sample dataset (${counts.clients} clients, ${counts.websites} websites, ${counts.projects} projects, ${counts.tasks} tasks).`,
    kind: "AUDIT",
    actor: user,
    metadata: counts,
  });

  return jsonOk({ created: counts });
});

// ---------------------------------------------------------------------------
// DELETE /api/settings/sample-data
// ---------------------------------------------------------------------------

export const DELETE = withAuth(async (req, user) => {
  // RBAC: seeding/clearing demo data is founder-only.
  requireFounder(user);
  const sampleClients = await db.client.findMany({
    where: { isSample: true },
    select: { id: true },
  });
  const ids = sampleClients.map((c) => c.id);

  // Task.client is onDelete: SetNull, so tasks must be removed explicitly to
  // mirror cascade semantics. This also sweeps orphaned sample tasks.
  const tasks = await db.task.deleteMany({
    where: { OR: [{ clientId: { in: ids } }, { isSample: true }] },
  });
  const clients = await db.client.deleteMany({ where: { id: { in: ids } } });

  await logActivity({
    action: "SAMPLE_DATA_REMOVED",
    entityType: "SAMPLE_DATA",
    entityId: null,
    entityLabel: "Sample data",
    summary: `Removed sample dataset (${clients.count} clients, ${tasks.count} tasks).`,
    kind: "AUDIT",
    actor: user,
    metadata: { clients: clients.count, tasks: tasks.count },
  });

  return jsonOk({ removed: true });
});
