import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

interface ImportRow {
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  email?: string;
  phone?: string;
  priority?: string;
}

interface ImportBody {
  leads: ImportRow[];
  dryRun?: boolean;
  assignedToId?: string;
  campaignId?: string;
  initialStage?: string;
  sequenceId?: string;
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  let body: ImportBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.leads) || body.leads.length === 0) {
    return NextResponse.json({ error: 'No leads provided' }, { status: 400 });
  }

  // Fetch existing leads for dedup (email + name+company)
  const existingLeads = await prisma.lead.findMany({
    select: { email: true, firstName: true, lastName: true, company: true },
  });
  const existingEmails = new Set(
    existingLeads
      .map((l: any) => (l.email ?? '').toLowerCase().trim())
      .filter(Boolean)
  );
  const existingNameCompany = new Set(
    existingLeads.map(
      (l: any) =>
        `${(l.firstName ?? '').toLowerCase()}|${(l.lastName ?? '').toLowerCase()}|${(l.company ?? '').toLowerCase()}`
    )
  );

  const toImport: ImportRow[] = [];
  const exactDuplicates: number[] = [];
  const possibleMatches: number[] = [];
  const rowsWithErrors: number[] = [];

  for (let i = 0; i < body.leads.length; i++) {
    const row = body.leads[i];
    const firstName = (row.firstName ?? '').trim();
    const lastName = (row.lastName ?? '').trim();
    const email = (row.email ?? '').trim().toLowerCase();
    const company = (row.company ?? '').trim().toLowerCase();

    const hasName = firstName || lastName;
    if (!hasName && !email) {
      rowsWithErrors.push(i + 1);
      continue;
    }

    // Email exact match → exact duplicate
    if (email && existingEmails.has(email)) {
      exactDuplicates.push(i + 1);
      continue;
    }

    // Name+Company match → possible match
    if (firstName && lastName && company) {
      const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${company}`;
      if (existingNameCompany.has(key)) {
        possibleMatches.push(i + 1);
        continue;
      }
    }

    toImport.push(row);
  }

  // Dry run: just return summary
  if (body.dryRun) {
    return NextResponse.json({
      total: body.leads.length,
      toImport: toImport.length,
      exactDuplicates: exactDuplicates.length,
      possibleMatches: possibleMatches.length,
      rowsWithErrors: rowsWithErrors.length,
    });
  }

  // Real import
  const assignedToId = body.assignedToId || user.id;
  const initialStage = body.initialStage || 'new';
  const campaignId = body.campaignId;
  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required for import' }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const seenEmails = new Set(existingEmails);

  for (let i = 0; i < toImport.length; i++) {
    const row = toImport[i];
    const firstName = (row.firstName ?? '').trim();
    const lastName = (row.lastName ?? '').trim();
    const email = (row.email ?? '').trim();
    const rawPriority = (row.priority ?? '').toLowerCase().trim();
    const priority =
      rawPriority === 'hot' || rawPriority === 'warm' || rawPriority === 'cold'
        ? rawPriority
        : 'warm';

    if (email && seenEmails.has(email.toLowerCase())) {
      skipped++;
      continue;
    }

    try {
      const createdLead = await prisma.lead.create({
        data: {
          firstName,
          lastName,
          company: (row.company ?? '').trim(),
          title: (row.title ?? '').trim(),
          email,
          phone: (row.phone ?? '').trim(),
          stage: initialStage as any,
          priority: priority as any,
          assignedToId,
          campaignId,
          sequenceId: body.sequenceId || undefined,
          tags: [],
        },
      });

      await prisma.activity.create({
        data: {
          userId: user.id,
          leadId: createdLead.id,
          type: 'lead_created',
          description: `Lead ${firstName} ${lastName} imported via CSV`,
        },
      });

      if (email) seenEmails.add(email.toLowerCase());
      imported++;
    } catch {
      errors.push(`Row failed to create`);
      skipped++;
    }
  }

  return NextResponse.json({ imported, skipped, errors });
}
