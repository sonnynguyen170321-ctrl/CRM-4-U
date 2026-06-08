import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;
  const body = await req.json();
  const { leadId } = body;

  if (!leadId) {
    return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
  }

  const sequence = await prisma.sequence.findUnique({ where: { id } });
  if (!sequence) {
    return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  // If already enrolled in a different sequence, log unenroll activity first
  if ((lead as any).sequenceId && (lead as any).sequenceId !== id) {
    const prevSeq = await prisma.sequence.findUnique({ where: { id: (lead as any).sequenceId } });
    await prisma.activity.create({
      data: {
        userId: user.id,
        leadId,
        type: 'sequence_unenrolled',
        description: `Unenrolled from ${(prevSeq as any)?.name ?? (lead as any).sequenceId} (switched to ${(sequence as any).name})`,
        metadata: { sequenceId: (lead as any).sequenceId },
      },
    });
  }

  const updatedLead = await prisma.lead.update({
    where: { id: leadId },
    data: {
      sequenceId: id,
      sequenceStep: 1,
      stage: 'sequence_active',
    },
  });

  await prisma.activity.create({
    data: {
      userId: user.id,
      leadId,
      type: 'sequence_enrolled',
      description: `Enrolled in ${sequence.name}`,
      metadata: { sequenceId: id, sequenceName: sequence.name },
    },
  });

  return NextResponse.json({ success: true, lead: updatedLead });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;
  const body = await req.json();
  const { leadId } = body;

  if (!leadId) {
    return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      sequenceId: null,
      sequenceStep: null,
    },
  });

  const sequence = await prisma.sequence.findUnique({ where: { id } });
  await prisma.activity.create({
    data: {
      userId: user.id,
      leadId,
      type: 'sequence_unenrolled',
      description: `Unenrolled from ${sequence?.name ?? id}`,
      metadata: { sequenceId: id },
    },
  });

  return NextResponse.json({ success: true });
}
