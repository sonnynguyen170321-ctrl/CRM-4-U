import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, getVisibleUserIds } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody } from '@/lib/validation/core';
import { createTaskSchema } from '@/lib/validation/schemas';
import { handleApiError } from '@/lib/api/errors';

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get('tab'); // 'today' | 'yesterday' | 'overdue'
  const leadId = searchParams.get('leadId');
  const scopeUserId = searchParams.get('userId');

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);

  let dateFilter: Record<string, any> = {};
  if (tab === 'today') {
    dateFilter = { dueDate: { gte: todayStart, lt: todayEnd } };
  } else if (tab === 'yesterday') {
    dateFilter = { dueDate: { gte: yesterdayStart, lt: todayStart } };
  } else if (tab === 'overdue') {
    dateFilter = { dueDate: { lt: todayStart }, status: 'pending' };
  }

  // Pod scoping: SDRs see own tasks; TL/FM see their pod/floor; director sees all.
  // Managers may further narrow to one visible userId via ?userId=.
  const visibleIds = await getVisibleUserIds(user);
  let userScope: Record<string, unknown> = visibleIds ? { userId: { in: visibleIds } } : {};
  if (scopeUserId && scopeUserId !== 'all' && user.role !== 'sdr') {
    if (visibleIds && !visibleIds.includes(scopeUserId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    userScope = { userId: scopeUserId };
  }

  const tasks = await prisma.task.findMany({
    where: {
      ...userScope,
      ...(leadId ? { leadId } : {}),
      ...dateFilter,
    },
    include: {
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          company: true,
          priority: true,
          stage: true,
          tags: true,
        },
      },
      user: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ dueDate: 'asc' }],
  });

  // Sort by priority manually (enum alphabetical order ≠ business priority order)
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sorted = tasks.sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));

  return NextResponse.json(sorted);
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const parsed = await parseBody(req, createTaskSchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  try {
    const task = await prisma.task.create({
      data: {
        leadId: body.leadId,
        userId: body.userId ?? user.id,
        type: body.type,
        title: body.title,
        description: body.description,
        dueDate: body.dueDate,
        sequenceId: body.sequenceId,
        sequenceStep: body.sequenceStep,
        priority: body.priority ?? 'medium',
      },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, company: true } },
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    return handleApiError('api/tasks POST', err);
  }
}
