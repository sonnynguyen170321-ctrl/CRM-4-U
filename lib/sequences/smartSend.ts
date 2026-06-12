import { prisma } from '@/lib/prisma';
import { EmailService } from '@/lib/email/EmailService';
import { renderTemplate } from '@/lib/templates/render';
import { advanceSequence } from './engine';

const BUSINESS_HOUR_START = 9;
const BUSINESS_HOUR_END = 17;
const MAX_SENDS_PER_DAY = 80;
const OPTIMAL_WINDOWS: Record<string, { start: number; end: number }> = {
  'America/New_York': { start: 9, end: 11 },
  'America/Chicago': { start: 9, end: 11 },
  'America/Denver': { start: 9, end: 10 },
  'America/Los_Angeles': { start: 9, end: 11 },
  'Europe/London': { start: 9, end: 12 },
  'Europe/Berlin': { start: 9, end: 11 },
  'Asia/Ho_Chi_Minh': { start: 9, end: 11 },
  'Asia/Singapore': { start: 9, end: 11 },
  'Australia/Sydney': { start: 9, end: 11 },
};

export function isWithinBusinessHours(date: Date, timezone: string = 'UTC'): boolean {
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  const hour = tzDate.getHours();
  return hour >= BUSINESS_HOUR_START && hour < BUSINESS_HOUR_END;
}

export function getOptimalSendTime(leadTimezone: string | null): { hour: number; minute: number } {
  if (!leadTimezone || !OPTIMAL_WINDOWS[leadTimezone]) return { hour: 10, minute: 0 };
  const window = OPTIMAL_WINDOWS[leadTimezone];
  const hour = window.start + Math.floor(Math.random() * (window.end - window.start));
  return { hour, minute: Math.floor(Math.random() * 60) };
}

export function snapToBusinessHours(date: Date, timezone: string = 'UTC'): Date {
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  const hour = tzDate.getHours();
  if (hour >= BUSINESS_HOUR_START && hour < BUSINESS_HOUR_END) return date;
  const snapped = new Date(tzDate);
  if (hour < BUSINESS_HOUR_START) {
    snapped.setHours(BUSINESS_HOUR_START, 0, 0, 0);
  } else {
    snapped.setDate(snapped.getDate() + 1);
    snapped.setHours(BUSINESS_HOUR_START, 0, 0, 0);
  }
  return new Date(snapped.toLocaleString('en-US', { timeZone: 'UTC' }));
}

export async function distributeSends(accountId: string): Promise<void> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
    select: { id: true, dailySendCount: true, dailySendDate: true, hourlySendWindow: true },
  });
  if (!account) return;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (account.dailySendDate && account.dailySendDate < today) {
    await prisma.emailAccount.update({
      where: { id: accountId },
      data: { dailySendCount: 0, hourlySendWindow: 0 },
    });
  }

  const currentHour = now.getHours();
  const windowStart = Math.floor(currentHour / 2) * 2;
  if (account.hourlySendWindow !== windowStart) {
    await prisma.emailAccount.update({
      where: { id: accountId },
      data: { hourlySendWindow: windowStart, dailySendCount: { increment: account.dailySendCount } },
    });
  }
}

export async function canSendNow(accountId: string): Promise<boolean> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
    select: { dailySendCount: true, dailySendDate: true },
  });
  if (!account) return false;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (!account.dailySendDate || account.dailySendDate < today) {
    await prisma.emailAccount.update({
      where: { id: accountId },
      data: { dailySendCount: 0, dailySendDate: today },
    });
    return true;
  }

  return account.dailySendCount < MAX_SENDS_PER_DAY;
}

export async function incrementSendCount(accountId: string): Promise<void> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  await prisma.emailAccount.update({
    where: { id: accountId },
    data: {
      dailySendCount: { increment: 1 },
      dailySendDate: today,
    },
  });
}

export async function scheduleSmartSends(): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const now = new Date();
  const lockCutoff = new Date(now.getTime() - 10 * 60 * 1000);

  const dueTasks = await prisma.task.findMany({
    where: {
      status: 'pending',
      type: 'email',
      sequenceId: { not: null },
      dueDate: { lte: now },
      OR: [{ lockedAt: null }, { lockedAt: { lt: lockCutoff } }],
    },
    orderBy: { dueDate: 'asc' },
    take: 50,
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

      const step = await prisma.sequenceStep.findFirst({
        where: { sequenceId: task.sequenceId!, order: task.sequenceStep ?? -1 },
        include: { template: { include: { abVariants: true } } },
      });

      const template = step?.template;
      const eligible =
        step?.autoComplete &&
        step.channel === 'email' &&
        template &&
        lead.sequenceId === task.sequenceId &&
        lead.sequenceStatus === 'active' &&
        !lead.emailInvalid &&
        lead.email;
      if (!eligible || !template) { skipped++; continue; }

      if (lead.timezone && !isWithinBusinessHours(now, lead.timezone)) {
        skipped++;
        continue;
      }

      const account = await prisma.emailAccount.findFirst({
        where: { userId: lead.assignedToId, isActive: true },
      });
      if (!account) { skipped++; continue; }

      if (!(await canSendNow(account.id))) { skipped++; continue; }

      const claimed = await prisma.task.updateMany({
        where: { id: task.id, status: 'pending', lockedAt: task.lockedAt },
        data: { lockedAt: now },
      });
      if (claimed.count !== 1) { skipped++; continue; }

      let subject: string;
      let body: string;

      if (template.abVariants.length > 0 && template.abVariants.length >= 2) {
        const variantA = template.abVariants.find(v => v.version === 'A');
        const variantB = template.abVariants.find(v => v.version === 'B');
        const useB = variantB && Math.random() < 0.5;
        const selected = useB ? variantB! : variantA!;
        subject = renderTemplate(selected.subject ?? template.subject ?? '', lead, lead.assignedTo);
        body = renderTemplate(selected.body ?? template.body, lead, lead.assignedTo);

        await prisma.abTestVariant.update({
          where: { id: selected.id },
          data: { sentCount: { increment: 1 } },
        });
      } else {
        subject = renderTemplate(template.subject ?? '', lead, lead.assignedTo);
        body = renderTemplate(template.body, lead, lead.assignedTo);
      }

      try {
        await EmailService.fromAccount(account).send({
          from: account.email,
          to: lead.email,
          subject,
          text: body,
          html: body.replace(/\n/g, '<br>'),
        });

        await incrementSendCount(account.id);
      } catch (sendErr) {
        await prisma.task.update({ where: { id: task.id }, data: { lockedAt: null } });
        console.error(`[smart-send] send failed for task ${task.id}:`, sendErr);
        errors.push(task.id);
        continue;
      }

      await prisma.task.update({
        where: { id: task.id },
        data: { status: 'completed', completedAt: new Date() },
      });

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          lastContactedAt: new Date(),
          emailSentCount: { increment: 1 },
        },
      });

      await prisma.activity.create({
        data: {
          userId: lead.assignedToId,
          leadId: lead.id,
          type: 'email_sent',
          channel: 'email',
          description: lead.timezone
            ? `Smart-sent at ${new Date().toLocaleTimeString('en-US', { timeZone: lead.timezone })} ${lead.timezone}`
            : 'Auto-sent sequence email',
          metadata: {
            auto: true,
            accountId: account.id,
            subject,
            taskId: task.id,
            timezone: lead.timezone,
            sequenceStep: step.order,
          },
        },
      });

      await advanceSequence(task, lead.assignedToId);
      sent++;
    } catch (err) {
      console.error(`[smart-send] task ${task.id} failed:`, err);
      errors.push(task.id);
    }
  }

  return { sent, skipped, errors };
}

export async function isWithinSendWindow(accountId: string): Promise<boolean> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
    select: { hourlySendWindow: true, dailySendCount: true, dailySendDate: true },
  });
  if (!account) return false;

  const now = new Date();
  const currentHour = now.getHours();
  const windowStart = Math.floor(currentHour / 2) * 2;
  return account.hourlySendWindow === windowStart;
}
