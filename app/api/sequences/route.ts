import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

export async function GET(_req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;

  const sequences = await prisma.sequence.findMany({
    include: {
      steps: { orderBy: { order: 'asc' } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { leads: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(sequences);
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const body = await req.json();

  const sequence = await prisma.sequence.create({
    data: {
      name: body.name,
      description: body.description,
      isActive: body.isActive ?? true,
      createdById: user.id,
      steps: {
        create: (body.steps ?? []).map((step: any, idx: number) => ({
          order: step.order ?? idx + 1,
          channel: step.channel,
          delayDays: step.delayDays ?? 1,
          delayHours: step.delayHours ?? 0,
          templateId: step.templateId ?? null,
          instructions: step.instructions,
          autoComplete: step.autoComplete ?? false,
        })),
      },
    },
    include: { steps: { orderBy: { order: 'asc' } } },
  });

  return NextResponse.json(sequence, { status: 201 });
}
