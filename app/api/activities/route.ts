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
  const userId = searchParams.get('userId');
  const type = searchParams.get('type');
  const limit = parseInt(searchParams.get('limit') ?? '50', 10) || 50;

  const scopeUserId =
    user.role === 'sdr' ? user.id : userId && userId !== 'all' ? userId : undefined;

  const activities = await prisma.activity.findMany({
    where: {
      ...(scopeUserId ? { userId: scopeUserId } : {}),
      ...(leadId ? { leadId } : {}),
      ...(type ? { type: type as any } : {}),
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
      lead: { select: { id: true, firstName: true, lastName: true, company: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json(activities);
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const body = await req.json();

  const activity = await prisma.activity.create({
    data: {
      userId: user.id,
      leadId: body.leadId,
      sequenceId: body.sequenceId,
      type: body.type,
      channel: body.channel,
      description: body.description,
      metadata: body.metadata,
    },
  });

  return NextResponse.json(activity, { status: 201 });
}
