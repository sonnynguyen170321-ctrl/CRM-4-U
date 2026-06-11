import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody, capLimit } from '@/lib/validation/core';
import { createActivitySchema } from '@/lib/validation/schemas';
import { nextBusinessDay } from '@/lib/dates/businessDays';

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get('leadId');
  const userId = searchParams.get('userId');
  const type = searchParams.get('type');
  const limit = capLimit(searchParams.get('limit'), 50, 200);

  const scopeUserId =
    user.role === 'sdr' ? user.id : userId && userId !== 'all' ? userId : undefined;

  const activities = await prisma.activity.findMany({
    where: {
      ...(scopeUserId ? { userId: scopeUserId } : {}),
      ...(leadId ? { leadId } : {}),
      ...(type ? { type: type as any } : {}),
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
      lead: { select: { id: true, firstName: true, lastName: true, company: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json(activities);
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const parsed = await parseBody(req, createActivitySchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const activity = await prisma.activity.create({
    data: {
      userId: user.id,
      leadId: body.leadId,
      sequenceId: body.sequenceId,
      type: body.type,
      channel: body.channel,
      description: body.description,
      metadata: body.metadata as object | undefined,
    },
  });

  // Callback requested via the call-logging modal → follow-up phone task
  // next business day (SKILL.md §21)
  if (
    body.leadId &&
    (body.type === 'call_logged' || body.type === 'call_made') &&
    (body.metadata as Record<string, unknown> | undefined)?.outcome === 'callback_requested'
  ) {
    const lead = await prisma.lead.findUnique({
      where: { id: body.leadId },
      select: { firstName: true, lastName: true },
    });
    if (lead) {
      await prisma.task.create({
        data: {
          leadId: body.leadId,
          userId: user.id,
          type: 'phone',
          title: `Callback: ${lead.firstName} ${lead.lastName}`,
          description: 'Callback requested on previous call',
          dueDate: nextBusinessDay(new Date()),
          priority: 'high',
        },
      });
    }
  }

  return NextResponse.json(activity, { status: 201 });
}
