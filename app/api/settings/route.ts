import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

export async function GET() {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const profile = await prisma.user.findFirst({ where: { id: user.id } });
  if (!profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: profile.id,
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    timezone: profile.timezone ?? 'Asia/Ho_Chi_Minh',
    role: profile.role,
  });
}

export async function PUT(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const body = await req.json();
  const { firstName, lastName, timezone } = body as {
    firstName?: string;
    lastName?: string;
    timezone?: string;
  };

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(firstName !== undefined && { firstName }),
      ...(lastName !== undefined && { lastName }),
      ...(timezone !== undefined && { timezone }),
    },
  });

  return NextResponse.json({
    id: updated.id,
    firstName: updated.firstName,
    lastName: updated.lastName,
    email: updated.email,
    timezone: updated.timezone ?? 'Asia/Ho_Chi_Minh',
    role: updated.role,
  });
}
