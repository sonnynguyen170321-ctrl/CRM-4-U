import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { scoreLead } from '@/lib/ai/scoring';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;

  const { id } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, firstName: true, lastName: true, role: true } },
      campaign: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
      sequence: { select: { id: true, name: true, steps: { orderBy: { order: 'asc' } } } },
      tasks: { orderBy: { dueDate: 'asc' } },
      notes: {
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
      },
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
      reminders: {
        where: { isDismissed: false },
        orderBy: { dueAt: 'asc' },
      },
    },
  });

  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const aiScore = scoreLead({
    ...lead,
    lastContactedAt: lead.lastContactedAt?.toISOString() ?? null,
    nextTaskDue: lead.nextTaskDue?.toISOString() ?? null,
    createdAt: lead.createdAt.toISOString(),
    activities: (lead.activities ?? []).map((a) => ({ type: a.type, createdAt: a.createdAt.toISOString() })),
    tasks: (lead.tasks ?? []).map((t) => ({ status: t.status, dueDate: t.dueDate.toISOString() })),
  });

  return NextResponse.json({ ...lead, aiScore: aiScore.score, aiLabel: aiScore.label, aiInsights: aiScore.insights, aiRecommendation: aiScore.recommendation });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.lead.update({
    where: { id },
    data: {
      ...(body.firstName !== undefined && { firstName: body.firstName }),
      ...(body.lastName !== undefined && { lastName: body.lastName }),
      ...(body.company !== undefined && { company: body.company }),
      ...(body.title !== undefined && { title: body.title }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.linkedIn !== undefined && { linkedIn: body.linkedIn }),
      ...(body.whatsApp !== undefined && { whatsApp: body.whatsApp }),
      ...(body.stage !== undefined && { stage: body.stage }),
      ...(body.assignedToId !== undefined && { assignedToId: body.assignedToId }),
      ...(body.sequenceId !== undefined && { sequenceId: body.sequenceId }),
      ...(body.sequenceStep !== undefined && { sequenceStep: body.sequenceStep }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.tags !== undefined && { tags: body.tags }),
      ...(body.lastContactedAt !== undefined && { lastContactedAt: body.lastContactedAt }),
    },
  });

  // Auto-log stage changes
  if (body.stage && body.stage !== existing.stage) {
    await prisma.activity.create({
      data: {
        userId: user.id,
        leadId: id,
        type: 'stage_changed',
        description: `Stage changed from ${existing.stage} to ${body.stage}`,
        metadata: { from: existing.stage, to: body.stage },
      },
    });

    // Auto-create meeting_booked activity
    if (body.stage === 'meeting_booked') {
      await prisma.activity.create({
        data: {
          userId: user.id,
          leadId: id,
          type: 'meeting_booked',
          description: `Meeting booked with ${existing.firstName} ${existing.lastName}`,
        },
      });
      // Notify the actor (SDR who booked) and the lead's assigned SDR if different
      const meetingNotifyIds = new Set<string>([user.id]);
      if (existing.assignedToId) meetingNotifyIds.add(existing.assignedToId);
      await Promise.all([...meetingNotifyIds].map((uid) =>
        prisma.notification.create({
          data: {
            userId: uid,
            type: 'meeting_booked',
            title: 'Meeting Booked',
            text: `Meeting booked with ${existing.firstName} ${existing.lastName}! 🎉`,
            linkTo: `/leads/${id}`,
          },
        })
      ));
    }

    // Notify the assigned SDR when stage is changed by someone else
    if (existing.assignedToId && existing.assignedToId !== user.id && body.stage !== 'meeting_booked') {
      const stageLabel = body.stage.replace(/_/g, ' ');
      await prisma.notification.create({
        data: {
          userId: existing.assignedToId,
          type: 'stage_changed',
          title: 'Lead Stage Updated',
          text: `${existing.firstName} ${existing.lastName} was moved to "${stageLabel}" by ${user.firstName ?? ''} ${user.lastName ?? ''}.`.trim(),
          linkTo: `/leads/${id}`,
        },
      });
    }

    // Auto-unenroll from sequence on terminal/milestone stage changes
    const unenrollStages = ['meeting_booked', 'won', 'lost'];
    if (unenrollStages.includes(body.stage) && existing.sequenceId) {
      await prisma.lead.update({
        where: { id },
        data: { sequenceId: null, sequenceStep: null },
      });
      const reason = body.stage === 'meeting_booked' ? 'paused — meeting booked' : 'ended — deal closed';
      await prisma.activity.create({
        data: {
          userId: user.id,
          leadId: id,
          type: 'sequence_completed',
          description: `Sequence ${reason} for ${existing.firstName} ${existing.lastName}`,
          metadata: { reason: body.stage },
        },
      });
      // Reflect unenrollment in the response so the client doesn't get stale sequenceId
      updated.sequenceId = null;
      updated.sequenceStep = null;
    }
  }

  // Notify new assignee when lead is reassigned
  if (body.assignedToId !== undefined && body.assignedToId !== existing.assignedToId && body.assignedToId && body.assignedToId !== user.id) {
    await prisma.notification.create({
      data: {
        userId: body.assignedToId,
        type: 'lead_assigned',
        title: 'Lead Assigned to You',
        text: `${existing.firstName} ${existing.lastName} (${existing.company}) was assigned to you by ${user.firstName} ${user.lastName}`.trim(),
        linkTo: `/leads/${id}`,
      },
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;

  const lead = await prisma.lead.findUnique({ where: { id }, select: { assignedToId: true } });
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isManager = user.role === 'director' || user.role === 'floor_manager';
  if (!isManager && lead.assignedToId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.lead.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
