import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canAccessUser, canAccessLead } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { scoreLead } from '@/lib/ai/scoring';
import { unenrollLead, pauseSequence } from '@/lib/sequences/engine';
import { parseBody } from '@/lib/validation/core';
import { updateLeadSchema } from '@/lib/validation/schemas';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

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
  if (!(await canAccessLead(user, lead))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
  const parsed = await parseBody(req, updateLeadSchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canAccessLead(user, existing))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (body.assignedToId !== undefined && body.assignedToId !== null && body.assignedToId !== user.id && !(await canAccessUser(user, body.assignedToId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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

    // Auto-unenroll / pause sequence on stage change
    if (body.stage && body.stage !== existing.stage && existing.sequenceId) {
      const isCurrentlyPaused = existing.sequenceStatus === 'paused';

      if (body.stage === 'replied') {
        if (!isCurrentlyPaused) {
          await pauseSequence(id, 'replied', user.id);
          // Notify assigned SDR
          if (existing.assignedToId) {
            await prisma.notification.create({
              data: {
                userId: existing.assignedToId,
                type: 'lead_reply',
                title: 'Lead Replied',
                text: `${existing.firstName} ${existing.lastName} has replied. Sequence paused.`,
                linkTo: `/leads/${id}`,
              },
            });
          }
        }
      } else if (body.stage === 'meeting_booked') {
        if (!isCurrentlyPaused) {
          await pauseSequence(id, 'meeting_booked', user.id);
        }
      } else if (body.stage === 'won' || body.stage === 'lost') {
        await unenrollLead(id, existing.sequenceId);
        await prisma.activity.create({
          data: {
            userId: user.id,
            leadId: id,
            type: 'sequence_completed',
            description: `Sequence ended — deal ${body.stage} for ${existing.firstName} ${existing.lastName}`,
            metadata: { reason: body.stage },
          },
        });
      }

      // Reflect the updated sequence status in the returned lead object
      const refetched = await prisma.lead.findUnique({ where: { id } });
      if (refetched) {
        updated.sequenceId = refetched.sequenceId;
        updated.sequenceStep = refetched.sequenceStep;
        updated.sequenceStatus = refetched.sequenceStatus;
      }
    }
  }

  // Move pending tasks + log activity + notify both assignees when lead is reassigned
  if (body.assignedToId !== undefined && body.assignedToId !== existing.assignedToId && body.assignedToId) {
    // 1. Move all pending tasks to the new assignee
    await prisma.task.updateMany({
      where: { leadId: id, status: 'pending' },
      data: { userId: body.assignedToId },
    });

    // 2. Log lead_reassigned activity
    await prisma.activity.create({
      data: {
        userId: user.id,
        leadId: id,
        type: 'lead_reassigned',
        description: `Lead reassigned from SDR to another SDR`,
        metadata: { fromUserId: existing.assignedToId, toUserId: body.assignedToId },
      },
    });

    // 3. Notify new assignee (if not the performing user)
    if (body.assignedToId !== user.id) {
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

    // 4. Notify old assignee (if existed and not the performing user)
    if (existing.assignedToId && existing.assignedToId !== user.id) {
      await prisma.notification.create({
        data: {
          userId: existing.assignedToId,
          type: 'lead_reassigned',
          title: 'Lead Reassigned',
          text: `${existing.firstName} ${existing.lastName} (${existing.company}) has been reassigned to another user by ${user.firstName} ${user.lastName}`.trim(),
          linkTo: `/leads/${id}`,
        },
      });
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { assignedToId: true, campaignId: true, sequenceId: true },
  });
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!(await canAccessLead(user, lead))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let reason = 'Archived by user';
  try {
    const body = await req.json();
    if (body?.archiveReason) {
      reason = body.archiveReason;
    }
  } catch (_) {
    // Request has no JSON body, ignore
  }

  if (lead.sequenceId) {
    await unenrollLead(id, lead.sequenceId);
  }

  await prisma.lead.update({
    where: { id },
    data: {
      archivedAt: new Date(),
      archivedById: user.id,
      archiveReason: reason,
    },
  });

  return NextResponse.json({ success: true });
}
