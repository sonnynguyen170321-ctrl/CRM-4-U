import { NextRequest, NextResponse } from 'next/server';
import { prisma, tenantStorage } from '@/lib/prisma';
import { EmailService } from '@/lib/email/EmailService';
import { isBounceMessage, isAutoReply, extractBouncedRecipient } from '@/lib/email/bounceDetection';
import { pauseSequence } from '@/lib/sequences/engine';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ACCOUNTS_PER_RUN = 10;
const FIRST_SYNC_WINDOW_MS = 24 * 60 * 60 * 1000;
const MANAGER_ROLES = ['director', 'floor_manager', 'team_lead'];

export async function GET(req: NextRequest) {
  const isCronSecret =
    process.env.CRON_SECRET &&
    req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const session = isCronSecret ? null : await auth();
  const isManager = session?.user && MANAGER_ROLES.includes((session.user as any)?.role ?? '');
  if (!isCronSecret && !isManager) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
    const now = new Date();
    const accounts = await prisma.emailAccount.findMany({
      where: { isActive: true },
      orderBy: { lastSyncAt: { sort: 'asc', nulls: 'first' } },
      take: ACCOUNTS_PER_RUN,
    });

    const userIds = [...new Set(accounts.map(a => a.userId))];
    const userTenants = userIds.length > 0 ? await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, tenantId: true },
    }) : [];
    const tenantMap = new Map(userTenants.map(u => [u.id, u.tenantId]));

    let replies = 0;
    let bounces = 0;
    let failedAccounts = 0;

    for (const account of accounts) {
      const tenantId = tenantMap.get(account.userId);
      if (!tenantId) { failedAccounts++; continue; }

      try {
        await tenantStorage.run({ tenantId }, async () => {
          const since = account.lastSyncAt ?? new Date(now.getTime() - FIRST_SYNC_WINDOW_MS);
          const service = await EmailService.fromAccount(account);
          const messages = await service.fetchMessagesSince(since);
          if (messages === null) {
            await prisma.emailAccount.update({
              where: { id: account.id },
              data: { lastSyncAt: now },
            });
            return;
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
                title: 'Lead Replied!',
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
        });
      } catch (err) {
        console.error(`[inbox-sync] account ${account.id} (${account.provider}) failed:`, err);
        failedAccounts++;
      }
    }

    return NextResponse.json({ accounts: accounts.length, replies, bounces, failedAccounts });
  });
}
