import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { EmailService } from '@/lib/email/EmailService';

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const body = await req.json();
  // body: { accountId, to, subject, body, leadId }

  const account = await prisma.emailAccount.findFirst({
    where: { id: body.accountId, userId: user.id },
  });
  if (!account) {
    return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
  }

  try {
    const emailService = EmailService.fromAccount(account);
    await emailService.send({
      from: account.email,
      to: body.to,
      subject: body.subject,
      html: body.html ?? body.body,
      text: body.text ?? body.body,
    });

    // Log the activity
    if (body.leadId) {
      await prisma.activity.create({
        data: {
          userId: user.id,
          leadId: body.leadId,
          type: 'email_sent',
          channel: 'email',
          description: `Email sent to ${body.to}`,
          metadata: { subject: body.subject, accountId: account.id },
        },
      });

      await prisma.lead.update({
        where: { id: body.leadId },
        data: { lastContactedAt: new Date() },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
