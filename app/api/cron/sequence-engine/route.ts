import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { EmailService } from '@/lib/email/EmailService';
import { renderTemplate } from '@/lib/templates/render';
import { advanceSequence } from '@/lib/sequences/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 25;
const LOCK_STALE_MS = 10 * 60 * 1000;
const DAILY_AUTO_SEND_CAP = 50; // per email account — deliverability guard

/**
 * Sequence auto-send engine. Sends due email steps marked autoComplete and
 * advances those leads to their next step. Triggered by Vercel Cron
 * (vercel.json) and, as a fallback for plans with daily-only crons, by a
 * throttled ping from the app shell while users are online.
 *
 * Concurrency: the Neon HTTP driver has no interactive transactions, so each
 * task is claimed with a compare-and-swap on Task.lockedAt before sending.
 * Double-firing the route cannot double-send.
 */
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

  const now = new Date();
  const lockCutoff = new Date(now.getTime() - LOCK_STALE_MS);

  const dueTasks = await prisma.task.findMany({
    where: {
      status: 'pending',
      type: 'email',
      sequenceId: { not: null },
      dueDate: { lte: now },
      OR: [{ lockedAt: null }, { lockedAt: { lt: lockCutoff } }],
    },
    orderBy: { dueDate: 'asc' },
    take: BATCH_SIZE,
    include: {
      lead: {
        include: { assignedTo: { select: { id: true, firstName: true, lastName: true, role: true } } },
      },
    },
  });

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const task of dueTasks) {
    try {
      const { lead } = task;

      // Step must exist, be an autoComplete email step, with a template
      const step = await prisma.sequenceStep.findFirst({
        where: { sequenceId: task.sequenceId!, order: task.sequenceStep ?? -1 },
        include: { template: true },
      });
      const eligible =
        step?.autoComplete &&
        step.channel === 'email' &&
        step.template &&
        lead.sequenceId === task.sequenceId &&
        lead.sequenceStatus === 'active' &&
        !lead.emailInvalid &&
        lead.email;
      if (!eligible) {
        skipped++; // stays a normal manual task on the SDR's board
        continue;
      }

      const account = await prisma.emailAccount.findFirst({
        where: { userId: lead.assignedToId, isActive: true },
      });
      if (!account) {
        skipped++;
        continue;
      }

      // Per-account daily cap
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const sentToday = await prisma.activity.count({
        where: {
          type: 'email_sent',
          createdAt: { gte: todayStart },
          AND: [
            { metadata: { path: ['auto'], equals: true } },
            { metadata: { path: ['accountId'], equals: account.id } },
          ],
        },
      });
      if (sentToday >= DAILY_AUTO_SEND_CAP) {
        skipped++;
        continue;
      }

      // Claim the task (CAS) — exactly one runner may proceed
      const claimed = await prisma.task.updateMany({
        where: { id: task.id, status: 'pending', lockedAt: task.lockedAt },
        data: { lockedAt: now },
      });
      if (claimed.count !== 1) {
        skipped++;
        continue;
      }

      const subject = renderTemplate(step.template!.subject ?? '', lead, lead.assignedTo);
      const body = renderTemplate(step.template!.body, lead, lead.assignedTo);

      try {
        await EmailService.fromAccount(account).send({
          from: account.email,
          to: lead.email,
          subject,
          text: body,
          html: body.replace(/\n/g, '<br>'),
        });
      } catch (sendErr) {
        // Release the claim so the next run retries; tell the SDR once a day
        await prisma.task.update({ where: { id: task.id }, data: { lockedAt: null } });
        const alreadyNotified = await prisma.notification.findFirst({
          where: {
            userId: lead.assignedToId,
            type: 'auto_send_failed',
            linkTo: `/leads/${lead.id}`,
            createdAt: { gte: todayStart },
          },
        });
        if (!alreadyNotified) {
          await prisma.notification.create({
            data: {
              userId: lead.assignedToId,
              type: 'auto_send_failed',
              title: 'Auto-send Failed',
              text: `Step ${task.sequenceStep} email to ${lead.firstName} ${lead.lastName} failed to send. Check your email connection in Settings.`,
              linkTo: `/leads/${lead.id}`,
            },
          });
        }
        console.error(`[sequence-engine] send failed for task ${task.id}:`, sendErr);
        errors.push(task.id);
        continue;
      }

      await prisma.task.update({
        where: { id: task.id },
        data: { status: 'completed', completedAt: new Date() },
      });
      await prisma.activity.create({
        data: {
          userId: lead.assignedToId,
          leadId: lead.id,
          type: 'email_sent',
          channel: 'email',
          description: `Auto-sent sequence email to ${lead.email}`,
          metadata: { auto: true, accountId: account.id, subject, taskId: task.id },
        },
      });
      await prisma.lead.update({
        where: { id: lead.id },
        data: { lastContactedAt: new Date() },
      });
      await advanceSequence(task, lead.assignedToId);
      sent++;
    } catch (err) {
      console.error(`[sequence-engine] task ${task.id} failed:`, err);
      errors.push(task.id);
    }
  }

  // Daily notifications (idempotent — one per recipient per day, SKILL.md §23)
  let notified = 0;
  try {
    notified = await createDailyNotifications(now);
  } catch (err) {
    console.error('[sequence-engine] daily notifications failed:', err);
  }

  return NextResponse.json({ processed: dueTasks.length, sent, skipped, errors: errors.length, notified });
}

/**
 * "Sequence step due today" (per SDR) and "SDR overdue alert" (to managers).
 * Idempotency follows the /api/notifications/check pattern: skip if a
 * notification of the same type was already created today for the recipient.
 */
async function createDailyNotifications(now: Date): Promise<number> {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  let created = 0;

  // Sequence steps due today, grouped per SDR
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

  // SDRs with overdue tasks → alert their manager (and the manager's manager)
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
