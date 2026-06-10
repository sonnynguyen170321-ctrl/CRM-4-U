import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, buildRoleScope } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { scoreLead } from '@/lib/ai/scoring';

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
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  let roleScope: Record<string, unknown> = buildRoleScope(user);

  // Team leads and leadgen see only leads assigned to themselves or their direct reports
  if (user.role === 'team_lead' || user.role === 'leadgen') {
    const reports = await prisma.user.findMany({
      where: { managerId: user.id },
      select: { id: true },
    });
    const podIds = [user.id, ...reports.map((r) => r.id)];
    roleScope = { assignedToId: { in: podIds } };
  }

  const leads = await prisma.lead.findMany({
    ...(limit ? { take: limit } : {}),
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
        select: { dueDate: true, type: true, status: true },
      },
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { type: true, createdAt: true },
      },
    },
    orderBy: [{ updatedAt: 'desc' }],
  });

  // Sort by priority: hot → warm → cold (DB enum order is alphabetical, not business order)
  const priorityRank: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
  leads.sort((a: any, b: any) => (priorityRank[a.priority] ?? 2) - (priorityRank[b.priority] ?? 2));

  const enriched = leads.map((l: any) => {
    const aiScore = scoreLead({
      ...l,
      activities: l.activities ?? [],
    });
    return {
      ...l,
      nextTaskDue: l.tasks?.[0]?.dueDate ?? null,
      nextTaskType: l.tasks?.[0]?.type ?? null,
      aiScore: aiScore.score,
      aiLabel: aiScore.label,
      aiInsights: aiScore.insights,
      aiRecommendation: aiScore.recommendation,
      tasks: undefined,
      activities: undefined,
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const body = await req.json();

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
      priority: body.priority ?? 'warm',
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
}
