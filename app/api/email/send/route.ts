import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { EmailService } from '@/lib/email/EmailService';
import { renderTemplate } from '@/lib/templates/render';
import { parseBody } from '@/lib/validation/core';
import { sendEmailSchema } from '@/lib/validation/schemas';

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const parsed = await parseBody(req, sendEmailSchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const account = await prisma.emailAccount.findFirst({
    where: { id: body.accountId, userId: user.id },
  });
  if (!account) {
    return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
  }

  let subject: string = body.subject ?? '';
  let text: string = body.text ?? body.body ?? '';
  let html: string | undefined = body.html ?? body.body;

  // When sending from a template, render merge fields server-side with real lead data
  if (body.templateId && body.leadId) {
    const [template, lead] = await Promise.all([
      prisma.template.findUnique({ where: { id: body.templateId } }),
      prisma.lead.findUnique({ where: { id: body.leadId } }),
    ]);
    if (!template || !lead) {
      return NextResponse.json({ error: 'Template or lead not found' }, { status: 404 });
    }
    subject = renderTemplate(body.subject ?? template.subject ?? '', lead, user);
    text = renderTemplate(body.body ?? template.body, lead, user);
    html = text.replace(/\n/g, '<br>');
  } else if (body.leadId) {
    // Freeform compose may still contain merge fields — render against the lead
    const lead = await prisma.lead.findUnique({ where: { id: body.leadId } });
    if (lead) {
      subject = renderTemplate(subject, lead, user);
      text = renderTemplate(text, lead, user);
      html = html ? renderTemplate(html, lead, user) : undefined;
    }
  }

  try {
    const emailService = EmailService.fromAccount(account);
    await emailService.send({
      from: account.email,
      to: body.to,
      subject,
      html: html ?? text,
      text,
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
          metadata: { subject, accountId: account.id },
        },
      });

      await prisma.lead.update({
        where: { id: body.leadId },
        data: { lastContactedAt: new Date() },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[email/send] send failed:', err);
    return NextResponse.json({ error: 'Failed to send email. Check your email connection in Settings.' }, { status: 500 });
  }
}
