import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

// Called by Topbar on mount to auto-create overdue-task notifications.
// Fires at most once per calendar day per user (idempotent).
export async function POST() {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Count pending overdue tasks for this user
  const overdueCount = await prisma.task.count({
    where: {
      userId: user.id,
      status: 'pending',
      dueDate: { lt: todayStart },
    },
  });

  if (overdueCount > 0) {
    // Check whether we already sent this notification today
    const existing = await prisma.notification.findFirst({
      where: {
        userId: user.id,
        type: 'overdue_tasks',
        createdAt: { gte: todayStart },
      },
    });

    if (!existing) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: 'overdue_tasks',
          title: 'Overdue Tasks',
          text: `You have ${overdueCount} overdue task${overdueCount > 1 ? 's' : ''} — clear them before they pile up.`,
          linkTo: '/?tab=overdue',
        },
      });
    } else {
      // Update the count if it changed
      if (!existing.text.startsWith(`You have ${overdueCount}`)) {
        await prisma.notification.update({
          where: { id: existing.id },
          data: {
            text: `You have ${overdueCount} overdue task${overdueCount > 1 ? 's' : ''} — clear them before they pile up.`,
            isRead: false,
          },
        });
      }
    }
  }

  // Check for reminders that are now due (dueAt <= now, not dismissed) and haven't been notified
  const dueReminders = await prisma.reminder.findMany({
    where: {
      userId: user.id,
      isDismissed: false,
      dueAt: { lte: now },
    },
    select: { id: true, text: true, leadId: true },
    take: 10,
  });

  await Promise.all(
    dueReminders.map(async (rem: { id: string; text: string; leadId: string | null }) => {
      const reminderLinkTo = rem.leadId ? `/leads/${rem.leadId}` : null;
      const alreadyNotified = await prisma.notification.findFirst({
        where: {
          userId: user.id,
          type: 'reminder_due',
          linkTo: reminderLinkTo,
          createdAt: { gte: new Date(now.getTime() - 86400000) },
          text: { contains: rem.text.slice(0, 30) },
        },
      });
      if (!alreadyNotified) {
        await prisma.notification.create({
          data: {
            userId: user.id,
            type: 'reminder_due',
            title: 'Reminder Due',
            text: `Reminder: ${rem.text}`,
            linkTo: reminderLinkTo,
          },
        });
      }
    })
  );

  return NextResponse.json({ checked: true, overdueCount });
}
