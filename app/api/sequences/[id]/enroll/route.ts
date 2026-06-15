import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { createTaskForStep, unenrollLead } from '@/lib/sequences/engine';
import { parseBody } from '@/lib/validation/core';
import { enrollSchema } from '@/lib/validation/schemas';
import { handleApiError } from '@/lib/api/errors';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;
  const parsed = await parseBody(req, enrollSchema);
  if (parsed.error) return parsed.error;
  const { leadId } = parsed.data;

  try {
    const sequence = await prisma.sequence.findUnique({
      where: { id },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    if (!sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }
    if (!sequence.isActive) {
      return NextResponse.json({ error: 'Sequence is inactive' }, { status: 400 });
    }
    if (sequence.steps.length === 0) {
      return NextResponse.json({ error: 'Sequence has no steps' }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (lead.sequenceId && lead.sequenceId !== id) {
      const prevSeq = await prisma.sequence.findUnique({ where: { id: lead.sequenceId } });
      await unenrollLead(leadId, lead.sequenceId);
      await prisma.activity.create({
        data: {
          userId: user.id,
          leadId,
          type: 'sequence_unenrolled',
          description: `Unenrolled from ${prevSeq?.name ?? lead.sequenceId} (switched to ${sequence.name})`,
          metadata: { sequenceId: lead.sequenceId },
        },
      });
    }

    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        sequenceId: id,
        sequenceStep: 1,
        sequenceStatus: 'active',
        ...(lead.stage === 'new' ? { stage: 'sequence_active' } : {}),
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

    const stepOne = sequence.steps[0];
    await createTaskForStep(updatedLead, sequence, stepOne, new Date());

    return NextResponse.json({ success: true, lead: updatedLead });
  } catch (err) {
    return handleApiError('api/sequences/[id]/enroll POST', err);
  }
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

  try {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    await unenrollLead(leadId, id);

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
  } catch (err) {
    return handleApiError('api/sequences/[id]/enroll DELETE', err);
  }
}
