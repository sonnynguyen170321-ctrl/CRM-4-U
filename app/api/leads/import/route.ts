import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canAccessUser } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { scoreLead } from '@/lib/ai/scoring';
import { createTaskForStep } from '@/lib/sequences/engine';

interface ImportRow {
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  email?: string;
  phone?: string;
  priority?: string;
}

type Resolution = 'skip' | 'update' | 'import';

interface ImportBody {
  leads: ImportRow[];
  dryRun?: boolean;
  assignedToId?: string;
  campaignId?: string;
  initialStage?: string;
  sequenceId?: string;
  /** Per-row duplicate handling, keyed by 1-based row number (SKILL.md §24). */
  resolutions?: Record<string, Resolution>;
  defaultResolution?: Resolution;
}

interface DuplicateInfo {
  row: number;
  matchType: 'email' | 'name_company' | 'phone';
  existingLeadId: string;
  existingSummary: string;
  incoming: ImportRow;
}

const normalizePhone = (p?: string | null) => (p ?? '').replace(/\D/g, '');

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
  if (body.leads.length > 5000) {
    return NextResponse.json({ error: 'Too many rows — max 5000 per import' }, { status: 400 });
  }

  // Fetch existing leads for dedup (email > name+company > phone, SKILL.md §24)
  const existingLeads = await prisma.lead.findMany({
    select: {
      id: true, email: true, firstName: true, lastName: true, company: true,
      phone: true, title: true,
    },
  });
  type Existing = (typeof existingLeads)[number];
  const summary = (l: Existing) =>
    `${l.firstName} ${l.lastName} — ${l.company}${l.email ? ` (${l.email})` : ''}`;

  const byEmail = new Map<string, Existing>();
  const byNameCompany = new Map<string, Existing>();
  const byPhone = new Map<string, Existing>();
  for (const l of existingLeads) {
    const email = (l.email ?? '').toLowerCase().trim();
    if (email && !byEmail.has(email)) byEmail.set(email, l);
    const nameKey = `${(l.firstName ?? '').toLowerCase()}|${(l.lastName ?? '').toLowerCase()}|${(l.company ?? '').toLowerCase()}`;
    if (!byNameCompany.has(nameKey)) byNameCompany.set(nameKey, l);
    const phone = normalizePhone(l.phone);
    if (phone && !byPhone.has(phone)) byPhone.set(phone, l);
  }

  const cleanRows: { row: number; data: ImportRow }[] = [];
  const duplicates: DuplicateInfo[] = [];
  const errorRows: { row: number; reason: string }[] = [];

  for (let i = 0; i < body.leads.length; i++) {
    const rowNum = i + 1;
    const row = body.leads[i];
    const firstName = (row.firstName ?? '').trim();
    const lastName = (row.lastName ?? '').trim();
    const email = (row.email ?? '').trim().toLowerCase();
    const company = (row.company ?? '').trim();
    const phone = normalizePhone(row.phone);

    if (!firstName && !lastName && !email) {
      errorRows.push({ row: rowNum, reason: 'Missing name and email' });
      continue;
    }

    let match: Existing | undefined;
    let matchType: DuplicateInfo['matchType'] | undefined;
    if (email && byEmail.has(email)) {
      match = byEmail.get(email);
      matchType = 'email';
    } else if (firstName && lastName && company) {
      const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${company.toLowerCase()}`;
      if (byNameCompany.has(key)) {
        match = byNameCompany.get(key);
        matchType = 'name_company';
      }
    }
    if (!match && phone && byPhone.has(phone)) {
      match = byPhone.get(phone);
      matchType = 'phone';
    }

    if (match && matchType) {
      duplicates.push({
        row: rowNum,
        matchType,
        existingLeadId: match.id,
        existingSummary: summary(match),
        incoming: row,
      });
    } else {
      cleanRows.push({ row: rowNum, data: row });
    }
  }

  // Dry run: per-row duplicate detail so the UI can offer skip/update/import
  if (body.dryRun) {
    return NextResponse.json({
      total: body.leads.length,
      toImport: cleanRows.length,
      duplicates,
      errorRows,
      // Back-compat counters for the existing summary UI
      exactDuplicates: duplicates.filter((d) => d.matchType === 'email').length,
      possibleMatches: duplicates.filter((d) => d.matchType !== 'email').length,
      rowsWithErrors: errorRows.length,
    });
  }

  // Real import
  const assignedToId = body.assignedToId || user.id;
  if (assignedToId !== user.id && !(await canAccessUser(user, assignedToId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const initialStage = (body.initialStage || 'new') as 'new' | 'sequence_active';
  const campaignId = body.campaignId;
  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required for import' }, { status: 400 });
  }

  // Sequence to auto-enroll imported leads into (SKILL.md §24)
  const sequence = body.sequenceId
    ? await prisma.sequence.findUnique({
        where: { id: body.sequenceId },
        include: { steps: { orderBy: { order: 'asc' } } },
      })
    : null;
  if (body.sequenceId && (!sequence || !sequence.isActive || sequence.steps.length === 0)) {
    return NextResponse.json({ error: 'Sequence not found, inactive, or has no steps' }, { status: 400 });
  }

  const defaultResolution: Resolution = body.defaultResolution ?? 'skip';
  const resolutions = body.resolutions ?? {};

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const importErrors: { row: number; reason: string }[] = [];
  const seenEmails = new Set(byEmail.keys());

  const createLead = async (rowNum: number, row: ImportRow) => {
    const firstName = (row.firstName ?? '').trim();
    const lastName = (row.lastName ?? '').trim();
    const email = (row.email ?? '').trim();
    const rawPriority = (row.priority ?? '').toLowerCase().trim();
    const priority = (
      rawPriority === 'hot' || rawPriority === 'warm' || rawPriority === 'cold'
        ? rawPriority
        : scoreLead({
            id: 'new',
            firstName,
            lastName,
            company: (row.company ?? '').trim(),
            title: row.title,
            email,
            phone: row.phone,
            stage: initialStage,
            priority: 'warm',
            source: 'csv-import',
            createdAt: new Date().toISOString(),
            activities: [],
            tasks: [],
          }).label
    ) as 'hot' | 'warm' | 'cold';

    if (email && seenEmails.has(email.toLowerCase())) {
      skipped++;
      return;
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
          stage: sequence ? 'sequence_active' : initialStage,
          priority,
          assignedToId,
          campaignId,
          source: 'csv-import',
          tags: [],
          ...(sequence ? { sequenceId: sequence.id, sequenceStep: 1, sequenceStatus: 'active' as const } : {}),
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

      if (sequence) {
        await prisma.activity.create({
          data: {
            userId: user.id,
            leadId: createdLead.id,
            type: 'sequence_enrolled',
            description: `Enrolled in ${sequence.name} (CSV import)`,
            metadata: { sequenceId: sequence.id, sequenceName: sequence.name },
          },
        });
        await createTaskForStep(createdLead, sequence, sequence.steps[0], new Date());
      }

      if (email) seenEmails.add(email.toLowerCase());
      imported++;
    } catch (err) {
      console.error(`[leads/import] row ${rowNum} failed:`, err);
      importErrors.push({ row: rowNum, reason: 'Database error while creating lead' });
      skipped++;
    }
  };

  // Clean rows always import
  for (const { row, data } of cleanRows) {
    await createLead(row, data);
  }

  // Duplicates follow their per-row resolution (or the batch default)
  for (const dup of duplicates) {
    const resolution = resolutions[String(dup.row)] ?? defaultResolution;
    if (resolution === 'skip') {
      skipped++;
      continue;
    }
    if (resolution === 'import') {
      await createLead(dup.row, dup.incoming);
      continue;
    }
    // 'update' — fill only the existing lead's empty fields
    try {
      const existing = existingLeads.find((l) => l.id === dup.existingLeadId);
      if (!existing) {
        skipped++;
        continue;
      }
      const fill: Record<string, string> = {};
      if (!existing.title && dup.incoming.title?.trim()) fill.title = dup.incoming.title.trim();
      if (!existing.phone && dup.incoming.phone?.trim()) fill.phone = dup.incoming.phone.trim();
      if (!existing.email && dup.incoming.email?.trim()) fill.email = dup.incoming.email.trim();
      if (Object.keys(fill).length > 0) {
        await prisma.lead.update({ where: { id: dup.existingLeadId }, data: fill });
        updated++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`[leads/import] update for row ${dup.row} failed:`, err);
      importErrors.push({ row: dup.row, reason: 'Database error while updating existing lead' });
      skipped++;
    }
  }

  return NextResponse.json({
    imported,
    updated,
    skipped,
    errorRows: [...errorRows, ...importErrors],
    errors: importErrors.map((e) => `Row ${e.row}: ${e.reason}`),
  });
}
