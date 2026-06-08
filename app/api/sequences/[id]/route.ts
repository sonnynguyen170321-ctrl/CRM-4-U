import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;

  const { id } = await params;

  const sequence = await prisma.sequence.findUnique({
    where: { id },
    include: {
      steps: {
        orderBy: { order: 'asc' },
        include: { template: { select: { id: true, name: true, channel: true } } },
      },
      _count: { select: { leads: true } },
    },
  });

  if (!sequence) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(sequence);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireRole('team_lead');
  if (userOrRes instanceof NextResponse) return userOrRes;

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.sequence.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Rebuild steps and update sequence atomically
  const sequence = await prisma.$transaction(async (tx) => {
    if (body.steps !== undefined) {
      await tx.sequenceStep.deleteMany({ where: { sequenceId: id } });
      await tx.sequenceStep.createMany({
        data: body.steps.map((step: any, idx: number) => ({
          sequenceId: id,
          order: step.order ?? idx + 1,
          channel: step.channel,
          delayDays: step.delayDays ?? 1,
          delayHours: step.delayHours ?? 0,
          templateId: step.templateId ?? null,
          instructions: step.instructions,
          autoComplete: step.autoComplete ?? false,
        })),
      });
    }

    return tx.sequence.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
  });

  return NextResponse.json(sequence);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireRole('team_lead');
  if (userOrRes instanceof NextResponse) return userOrRes;

  const { id } = await params;

  const existing = await prisma.sequence.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.sequence.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
