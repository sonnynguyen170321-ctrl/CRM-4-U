import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get('leadId');

  const reminders = await prisma.reminder.findMany({
    where: {
      userId: user.id,
      isDismissed: false,
      ...(leadId ? { leadId } : {}),
    },
    orderBy: { dueAt: 'asc' },
  });

  return NextResponse.json(reminders);
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const body = await req.json();

  const reminder = await prisma.reminder.create({
    data: {
      userId: user.id,
      text: body.text,
      dueAt: new Date(body.dueAt),
      leadId: body.leadId ?? null,
      isDismissed: false,
    },
  });

  return NextResponse.json(reminder, { status: 201 });
}
