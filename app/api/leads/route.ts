import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, getVisibleUserIds, canAccessUser } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { scoreLead } from '@/lib/ai/scoring';
import { parseBody, capLimit } from '@/lib/validation/core';
import { createLeadSchema } from '@/lib/validation/schemas';
import { handleApiError } from '@/lib/api/errors';

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const stage = searchParams.get('stage') || undefined;
  const priority = searchParams.get('priority') || undefined;
  const assignedTo = searchParams.get('assignedTo') || undefined;
  const campaignId = searchParams.get('campaignId') || undefined;
  const source = searchParams.get('source') || undefined;
  const tag = searchParams.get('tag') || undefined;
  const dateFrom = searchParams.get('dateFrom') || undefined;
  const dateTo = searchParams.get('dateTo') || undefined;
  const limit = capLimit(searchParams.get('limit'), 200, 500);

  // Pod scoping: director sees all, FM their floor, TL/leadgen their pod, SDR self
  const visibleIds = await getVisibleUserIds(user);
  const roleScope: Record<string, unknown> = visibleIds
    ? { assignedToId: { in: visibleIds } }
    : {};

  const leads = await prisma.lead.findMany({
    take: limit,
    where: {
      ...roleScope,
      ...(stage ? { stage: stage as any } : {}),
      ...(priority ? { priority: priority as any } : {}),
      ...(assignedTo ? { assignedToId: assignedTo } : {}),
      ...(campaignId ? { campaignId } : {}),
      ...(source ? { source: { contains: source, mode: 'insensitive' as const } } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
      ...(dateFrom || dateTo ? {
        createdAt: {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59Z') } : {}),
        },
      } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { company: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: {
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      campaign: { select: { id: true, name: true } },
      _count: { select: { tasks: true, notes: true } },
      tasks: {
        where: { status: 'pending' },
        orderBy: { dueDate: 'asc' },
        take: 5,
        select: { dueDate: true, type: true, status: true, sequenceId: true },
      },
    },
    orderBy: [{ updatedAt: 'desc' }],
  });

  // Sort by priority: hot → warm → cold (DB enum order is alphabetical, not business order)
  const priorityRank: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
  leads.sort((a: any, b: any) => (priorityRank[a.priority] ?? 2) - (priorityRank[b.priority] ?? 2));

  // At-risk: a sequence step task overdue by 3+ days (SKILL.md §3)
  const atRiskCutoff = new Date(Date.now() - 3 * 86400000);

  const enriched = leads.map((l: any) => {
    const aiScore = scoreLead({ ...l, activities: [] });
    return {
      ...l,
      nextTaskDue: l.tasks?.[0]?.dueDate ?? null,
      nextTaskType: l.tasks?.[0]?.type ?? null,
      atRisk: (l.tasks ?? []).some(
        (t: any) => t.sequenceId && new Date(t.dueDate) < atRiskCutoff
      ),
      aiScore: aiScore.score,
      aiLabel: aiScore.label,
      aiInsights: aiScore.insights,
      aiRecommendation: aiScore.recommendation,
      tasks: undefined,
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const parsed = await parseBody(req, createLeadSchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const targetAssignedToId = body.assignedToId ?? user.id;
  if (targetAssignedToId !== user.id && !(await canAccessUser(user, targetAssignedToId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // No explicit priority → derive it from the AI lead score (hot/warm/cold)
    const priority =
      body.priority ??
      scoreLead({
        ...body,
        id: 'new',
        stage: body.stage ?? 'new',
        priority: 'warm', // neutral baseline — the score decides the label
        tags: body.tags ?? [],
        lastContactedAt: null,
        nextTaskDue: null,
        createdAt: new Date().toISOString(),
        activities: [],
        tasks: [],
      }).label;

    const lead = await prisma.lead.create({
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        company: body.company,
        title: body.title,
        email: body.email,
        phone: body.phone,
        linkedIn: body.linkedIn,
        whatsApp: body.whatsApp,
        stage: body.stage ?? 'new',
        assignedToId: body.assignedToId ?? user.id,
        campaignId: body.campaignId,
        source: body.source,
        tags: body.tags ?? [],
        priority,
      },
    });

    // Auto-log lead_created activity
    await prisma.activity.create({
      data: {
        userId: user.id,
        leadId: lead.id,
        type: 'lead_created',
        description: `Lead ${lead.firstName} ${lead.lastName} created`,
      },
    });

    return NextResponse.json(lead, { status: 201 });
  } catch (err) {
    return handleApiError('api/leads POST', err);
  }
}
