import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { EmailService } from '@/lib/email/EmailService';
import { renderTemplate } from '@/lib/templates/render';
import { advanceSequence } from '@/lib/sequences/engine';
import { scheduleSmartSends, isWithinBusinessHours, distributeSends } from '@/lib/sequences/smartSend';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LOCK_STALE_MS = 10 * 60 * 1000;
const DAILY_AUTO_SEND_CAP = 50;

export async function GET(req: NextRequest) {
  const authorized =
    (process.env.CRON_SECRET &&
      req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`) ||
    (await getSessionUser()) !== null;
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.SEQUENCE_AUTOSEND_ENABLED === 'false') {
    return NextResponse.json({ disabled: true, sent: 0 });
  }

  // Distribute send windows for all active accounts
  const activeAccounts = await prisma.emailAccount.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  for (const acc of activeAccounts) {
    await distributeSends(acc.id);
  }

  // Run smart send engine
  const result = await scheduleSmartSends();

  // Fallback: process non-autoComplete tasks (manual email tasks)
  const now = new Date();
  const lockCutoff = new Date(now.getTime() - LOCK_STALE_MS);

  const manualTasks = await prisma.task.findMany({
    where: {
      status: 'pending',
      type: 'email',
      sequenceId: null,
      dueDate: { lte: now },
      OR: [{ lockedAt: null }, { lockedAt: { lt: lockCutoff } }],
    },
    orderBy: { dueDate: 'asc' },
    take: 10,
    include: {
      lead: {
        include: { assignedTo: { select: { id: true, firstName: true, lastName: true, role: true } } },
      },
    },
  });

  for (const task of manualTasks) {
    try {
      const account = await prisma.emailAccount.findFirst({
        where: { userId: task.lead.assignedToId, isActive: true },
      });
      if (!account) continue;

      const claimed = await prisma.task.updateMany({
        where: { id: task.id, status: 'pending', lockedAt: task.lockedAt },
        data: { lockedAt: now },
      });
      if (claimed.count !== 1) continue;

      await EmailService.fromAccount(account).send({
        from: account.email,
        to: task.lead.email,
        subject: task.title,
        text: task.description ?? '',
      });

      await prisma.task.update({
        where: { id: task.id },
        data: { status: 'completed', completedAt: new Date() },
      });
      result.sent++;
    } catch {
      await prisma.task.update({ where: { id: task.id }, data: { lockedAt: null } });
      result.errors.push(task.id);
    }
  }

  // Daily notifications
  let notified = 0;
  try {
    notified = await createDailyNotifications(now);
  } catch (err) {
    console.error('[sequence-engine] daily notifications failed:', err);
  }

  return NextResponse.json({
    processed: (result.sent + result.skipped + result.errors.length + manualTasks.length),
    sent: result.sent,
    skipped: result.skipped,
    errors: result.errors.length,
    notified,
  });
}

async function createDailyNotifications(now: Date): Promise<number> {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  let created = 0;

  const dueSteps = await prisma.task.findMany({
    where: {
      status: 'pending',
      sequenceId: { not: null },
      dueDate: { gte: todayStart, lt: todayEnd },
    },
    select: { userId: true },
  });
  const stepCountByUser = new Map<string, number>();
  for (const t of dueSteps) {
    stepCountByUser.set(t.userId, (stepCountByUser.get(t.userId) ?? 0) + 1);
  }
  for (const [userId, count] of stepCountByUser) {
    const already = await prisma.notification.findFirst({
      where: { userId, type: 'sequence_step_due', createdAt: { gte: todayStart } },
    });
    if (already) continue;
    await prisma.notification.create({
      data: {
        userId,
        type: 'sequence_step_due',
        title: 'Sequence Steps Due Today',
        text: `You have ${count} sequence step${count > 1 ? 's' : ''} due today.`,
        linkTo: '/',
      },
    });
    created++;
  }

  const overdue = await prisma.task.groupBy({
    by: ['userId'],
    _count: { id: true },
    where: { status: 'pending', dueDate: { lt: todayStart } },
  });
  if (overdue.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: overdue.map((o) => o.userId) } },
      select: { id: true, firstName: true, lastName: true, managerId: true, manager: { select: { managerId: true } } },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    for (const o of overdue) {
      const sdr = userMap.get(o.userId);
      if (!sdr) continue;
      const recipients = [sdr.managerId, sdr.manager?.managerId].filter(
        (r): r is string => !!r && r !== o.userId
      );
      for (const recipientId of recipients) {
        const already = await prisma.notification.findFirst({
          where: {
            userId: recipientId,
            type: 'sdr_overdue',
            createdAt: { gte: todayStart },
            text: { startsWith: `${sdr.firstName} ${sdr.lastName}` },
          },
        });
        if (already) continue;
        await prisma.notification.create({
          data: {
            userId: recipientId,
            type: 'sdr_overdue',
            title: 'SDR Overdue Tasks',
            text: `${sdr.firstName} ${sdr.lastName} has ${o._count.id} overdue task${o._count.id > 1 ? 's' : ''}.`,
            linkTo: '/team',
          },
        });
        created++;
      }
    }
  }

  return created;
}
