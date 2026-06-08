import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;

  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id }, include: { lead: true } });
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(task);
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

  const task = await prisma.task.findUnique({
    where: { id },
    include: { lead: true },
  });
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.task.update({
    where: { id },
    data: {
      ...(body.status !== undefined && { status: body.status }),
      ...(body.dueDate !== undefined && { dueDate: new Date(body.dueDate) }),
      ...(body.status === 'completed' && { completedAt: new Date() }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.outcome !== undefined && { outcome: body.outcome }),
    },
  });

  // Auto-log activity when task is completed or skipped
  if (body.status === 'completed' || body.status === 'skipped') {
    const activityTypeMap: Record<string, string> = {
      email: 'email_sent',
      phone: 'call_logged',
      linkedin: 'linkedin_touch',
      whatsapp: 'whatsapp_message',
      manual: 'task_completed',
    };

    await prisma.activity.create({
      data: {
        userId: user.id,
        leadId: task.leadId,
        type:
          body.status === 'skipped'
            ? ('task_skipped' as any)
            : (activityTypeMap[task.type] as any),
        channel: task.type !== 'manual' ? (task.type as any) : null,
        description:
          body.status === 'skipped'
            ? `Skipped task: "${task.title}"`
            : `Completed ${task.type} task: "${task.title}"`,
        metadata: {
          outcome: body.outcome,
          notes: body.notes,
          taskTitle: task.title,
        },
      },
    });

    // Update lead lastContactedAt for outreach tasks
    if (['email', 'phone', 'linkedin', 'whatsapp'].includes(task.type)) {
      await prisma.lead.update({
        where: { id: task.leadId },
        data: { lastContactedAt: new Date() },
      });
    }

    // Advance sequence step when a sequence task is completed
    if (body.status === 'completed' && task.sequenceId && task.sequenceStep !== null && task.sequenceStep !== undefined) {
      const lead = await prisma.lead.findUnique({
        where: { id: task.leadId },
        select: { sequenceId: true, sequenceStep: true, assignedToId: true, firstName: true, lastName: true },
      });

      if (lead && lead.sequenceId === task.sequenceId) {
        const sequence = await prisma.sequence.findUnique({
          where: { id: task.sequenceId },
          include: { _count: { select: { steps: true } } },
        });

        if (sequence) {
          const totalSteps = (sequence as any)._count.steps;
          const nextStep = (lead.sequenceStep ?? task.sequenceStep) + 1;

          if (nextStep > totalSteps) {
            // All steps done — unenroll and notify
            await prisma.lead.update({
              where: { id: task.leadId },
              data: { sequenceId: null, sequenceStep: null },
            });
            await prisma.activity.create({
              data: {
                userId: user.id,
                leadId: task.leadId,
                type: 'sequence_completed',
                description: `Completed all ${totalSteps} steps of "${sequence.name}"`,
                metadata: { sequenceName: sequence.name, totalSteps },
              },
            });
            if (lead.assignedToId) {
              await prisma.notification.create({
                data: {
                  userId: lead.assignedToId,
                  type: 'sequence_completed',
                  title: 'Sequence Completed',
                  text: `${lead.firstName} ${lead.lastName} completed all ${totalSteps} steps in "${sequence.name}".`,
                  linkTo: `/leads/${task.leadId}`,
                },
              });
            }
          } else {
            await prisma.lead.update({
              where: { id: task.leadId },
              data: { sequenceStep: nextStep },
            });
          }
        }
      }
    }
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

  const existing = await prisma.task.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isManager = user.role === 'director' || user.role === 'floor_manager' || user.role === 'team_lead';
  if (!isManager && existing.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
