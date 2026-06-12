import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { encrypt } from '@/lib/crypto';
import { verifyImapCredentials } from '@/lib/email/adapters/ImapAdapter';

export async function GET(_req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const accounts = await prisma.emailAccount.findMany({
    where: { userId: user.id, isActive: true },
    select: {
      id: true,
      email: true,
      provider: true,
      isActive: true,
      lastSyncAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const body = await req.json();

  // Accept both imapHost and imapServer field names for compatibility
  const imapHost = body.imapHost ?? body.imapServer;
  const smtpHost = body.smtpHost ?? body.smtpServer;

  // For IMAP/SMTP: validate server details are present, then verify credentials
  if (body.provider === 'imap_smtp') {
    if (!imapHost || !smtpHost || !body.password || !body.email) {
      return NextResponse.json(
        { error: 'Email address, IMAP server, SMTP server, and password are required' },
        { status: 400 }
      );
    }

    const valid = await verifyImapCredentials({
      email: body.email,
      password: body.password,
      smtpServer: smtpHost,
      smtpPort: parseInt(body.smtpPort, 10) || 465,
      imapServer: imapHost,
      imapPort: parseInt(body.imapPort, 10) || 993,
    });

    if (!valid) {
      return NextResponse.json(
        { error: 'Could not connect to SMTP server — check your credentials and server settings' },
        { status: 422 }
      );
    }
  }

  const account = await prisma.emailAccount.create({
    data: {
      userId: user.id,
      email: body.email,
      provider: body.provider,
      accessToken: body.accessToken ?? null,
      refreshToken: body.refreshToken ?? null,
      tokenExpiry: body.tokenExpiry ? new Date(body.tokenExpiry) : null,
      imapServer: imapHost ?? null,
      imapPort: body.imapPort ? (parseInt(body.imapPort, 10) || null) : null,
      smtpServer: smtpHost ?? null,
      smtpPort: body.smtpPort ? (parseInt(body.smtpPort, 10) || null) : null,
      encPassword: body.password ? await encrypt(body.password) : null,
    },
    select: {
      id: true,
      email: true,
      provider: true,
      isActive: true,
      createdAt: true,
    },
  });

  return NextResponse.json(account, { status: 201 });
}
