import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { EmailService } from '@/lib/email/EmailService';
import { isBounceMessage, isAutoReply, extractBouncedRecipient } from '@/lib/email/bounceDetection';
import { pauseSequence } from '@/lib/sequences/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ACCOUNTS_PER_RUN = 10;
const FIRST_SYNC_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Inbox sync: polls connected email accounts for new messages and reacts to
 * two events (SKILL.md §3 auto-unenrollment triggers):
 *  - a reply from an enrolled lead → stage Replied, pause sequence,
 *    "Handle Reply" task + notification
 *  - a hard bounce (NDR) → flag lead email invalid, pause sequence, notify
 *
 * Re-processing the same message is harmless: a replied/paused lead no longer
 * matches the enrollment guards, so each transition fires once.
 */
export async function GET(req: NextRequest) {
  const authorized =
    (process.env.CRON_SECRET &&
      req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`) ||
    (await getSessionUser()) !== null;
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const accounts = await prisma.emailAccount.findMany({
    where: { isActive: true },
    orderBy: { lastSyncAt: { sort: 'asc', nulls: 'first' } },
    take: ACCOUNTS_PER_RUN,
  });

  let replies = 0;
  let bounces = 0;
  let failedAccounts = 0;

  for (const account of accounts) {
    try {
      const since = account.lastSyncAt ?? new Date(now.getTime() - FIRST_SYNC_WINDOW_MS);
      const service = await EmailService.fromAccount(account);
      const messages = await service.fetchMessagesSince(since);
      if (messages === null) {
        // Adapter doesn't support sync — don't retry it every run
        await prisma.emailAccount.update({
          where: { id: account.id },
          data: { lastSyncAt: now },
        });
        continue;
      }

      for (const msg of messages) {
        if (isBounceMessage(msg)) {
          const bounced = extractBouncedRecipient(msg);
          if (!bounced) continue;
          const lead = await prisma.lead.findFirst({
            where: {
              email: { equals: bounced, mode: 'insensitive' },
              assignedToId: account.userId,
              emailInvalid: false,
            },
          });
          if (!lead) continue;

          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              emailInvalid: true,
              tags: lead.tags.includes('invalid-email') ? undefined : { push: 'invalid-email' },
            },
          });
          if (lead.sequenceId) {
            await pauseSequence(lead.id, 'bounced', account.userId);
          }
          await prisma.notification.create({
            data: {
              userId: account.userId,
              type: 'email_bounced',
              title: 'Email Bounced',
              text: `Email to ${lead.firstName} ${lead.lastName} (${bounced}) bounced. The address was flagged invalid${lead.sequenceId ? ' and the sequence was paused' : ''}.`,
              linkTo: `/leads/${lead.id}`,
            },
          });
          bounces++;
          continue;
        }

        if (isAutoReply(msg) || !msg.fromEmail) continue;

        // Reply detection: sender matches one of this SDR's enrolled leads
        const lead = await prisma.lead.findFirst({
          where: {
            email: { equals: msg.fromEmail, mode: 'insensitive' },
            assignedToId: account.userId,
            sequenceId: { not: null },
            sequenceStatus: 'active',
          },
        });
        if (!lead) continue;

        await prisma.lead.update({
          where: { id: lead.id },
          data: { stage: 'replied' },
        });
        await pauseSequence(lead.id, 'replied', account.userId);
        await prisma.activity.create({
          data: {
            userId: account.userId,
            leadId: lead.id,
            type: 'stage_changed',
            channel: 'email',
            description: `Reply received from ${lead.firstName} ${lead.lastName} — moved to Replied`,
            metadata: { from: lead.stage, to: 'replied', subject: msg.subject, auto: true },
          },
        });
        await prisma.task.create({
          data: {
            leadId: lead.id,
            userId: account.userId,
            type: 'manual',
            title: `Handle reply from ${lead.firstName} ${lead.lastName}`,
            description: `Replied to your outreach email${msg.subject ? `: "${msg.subject}"` : ''}. Respond while it's warm.`,
            dueDate: new Date(),
            priority: 'high',
          },
        });
        await prisma.notification.create({
          data: {
            userId: account.userId,
            type: 'lead_replied',
            title: 'Lead Replied! 🔥',
            text: `${lead.firstName} ${lead.lastName} (${lead.company}) replied to your email. Sequence paused — handle the reply.`,
            linkTo: `/leads/${lead.id}`,
          },
        });
        replies++;
      }

      await prisma.emailAccount.update({
        where: { id: account.id },
        data: { lastSyncAt: now },
      });
    } catch (err) {
      // Leave lastSyncAt untouched so the next run retries this window
      console.error(`[inbox-sync] account ${account.id} (${account.provider}) failed:`, err);
      failedAccounts++;
    }
  }

  return NextResponse.json({ accounts: accounts.length, replies, bounces, failedAccounts });
}
