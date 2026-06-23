import { prisma } from '@/lib/prisma';
import { createAppWorker } from '@/lib/bullmq';
import { JobType } from '@/lib/bullmq/types';
import type {
  SequenceEnrollPayload,
  SequenceAdvancePayload,
  SequencePausePayload,
  SequenceUnenrollPayload,
  SequenceRebuildPayload,
} from '@/lib/bullmq/types';
import {
  createTaskForStep,
  advanceSequence,
  pauseSequence,
  unenrollLead,
} from '@/lib/sequences/engine';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

// Exported for testing
export async function handleEnroll(payload: SequenceEnrollPayload) {
  const { leadId, sequenceId, userId } = payload;

  const [lead, sequence] = await Promise.all([
    prisma.lead.findUnique({ where: { id: leadId } }),
    prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: { steps: { orderBy: { order: 'asc' } } },
    }),
  ]);

  if (!lead || !sequence || !sequence.isActive || sequence.steps.length === 0) {
    throw new Error(
      `Cannot enroll: lead=${!!lead} sequence=${!!sequence} ` +
      `active=${sequence?.isActive} steps=${sequence?.steps.length}`
    );
  }

  // Unenroll from previous sequence if switching
  if (lead.sequenceId && lead.sequenceId !== sequenceId) {
    const prevSeq = await prisma.sequence.findUnique({
      where: { id: lead.sequenceId },
      select: { name: true },
    });
    await unenrollLead(leadId, lead.sequenceId);
    await prisma.activity.create({
      data: {
        userId, leadId,
        type: 'sequence_unenrolled',
        description: `Unenrolled from ${prevSeq?.name ?? lead.sequenceId} (switched to ${sequence.name})`,
        metadata: { sequenceId: lead.sequenceId },
      },
    });
  }

  // Close any prior active enrollments
  await prisma.sequenceEnrollment.updateMany({
    where: { leadId, status: 'active' },
    data: { status: 'unenrolled', completedAt: new Date() },
  });

  // Create new enrollment
  await prisma.sequenceEnrollment.create({
    data: {
      leadId, sequenceId,
      status: 'active', currentStep: 1,
      tenantId: lead.tenantId,
    },
  });

  // Re-fetch lead for fresh assignedToId/crmPriorityScore
  const freshLead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { assignedToId: true, crmPriorityScore: true },
  });

  // Create first step task BEFORE updating lead (so task failure doesn't leave lead in "enrolled with no task" state)
  await createTaskForStep(
    { id: leadId, assignedToId: freshLead?.assignedToId ?? lead.assignedToId, crmPriorityScore: freshLead?.crmPriorityScore ?? lead.crmPriorityScore },
    sequence,
    sequence.steps[0],
    new Date()
  );

  // Update lead
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      sequenceId, sequenceStep: 1, sequenceStatus: 'active',
      ...(lead.stage === 'new' ? { stage: 'sequence_active' } : {}),
    },
  });

  // Log enroll activity
  await prisma.activity.create({
    data: {
      userId, leadId,
      type: 'sequence_enrolled',
      description: `Enrolled in ${sequence.name}`,
      metadata: { sequenceId, sequenceName: sequence.name },
    },
  });

  return { success: true, leadId, sequenceId };
}

export async function handleAdvance(payload: SequenceAdvancePayload) {
  const { leadId, sequenceId, currentStep } = payload;

  const enrollment = await prisma.sequenceEnrollment.findFirst({
    where: { leadId, sequenceId, status: 'active' },
  });
  if (!enrollment) {
    return { skipped: true, reason: 'no_active_enrollment' };
  }

  // CAS: skip if lead already advanced past this step
  const leadCheck = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { sequenceStep: true },
  });
  if (leadCheck && leadCheck.sequenceStep !== null && leadCheck.sequenceStep > currentStep) {
    return { skipped: true, reason: 'stale_step' };
  }

  // Delegate to engine for lead advancement and task creation
  await advanceSequence(
    { leadId, sequenceId, sequenceStep: currentStep },
    SYSTEM_USER_ID
  );

  // Sync enrollment state after engine execution
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { sequenceId: true, sequenceStep: true },
  });

  if (!lead?.sequenceId) {
    // Engine completed the sequence (cleared lead fields)
    await prisma.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: { status: 'completed', currentStep, completedAt: new Date() },
    });
    return { status: 'completed', leadId, sequenceId };
  }

  await prisma.sequenceEnrollment.update({
    where: { id: enrollment.id },
    data: { currentStep: lead.sequenceStep ?? currentStep },
  });

  return { status: 'active', currentStep: lead.sequenceStep, leadId, sequenceId };
}

export async function handlePause(payload: SequencePausePayload) {
  const { leadId, reason, userId } = payload;

  const enrollment = await prisma.sequenceEnrollment.findFirst({
    where: { leadId, status: 'active' },
    select: { id: true, sequenceId: true },
  });
  if (!enrollment) {
    return { skipped: true, reason: 'no_active_enrollment' };
  }

  await pauseSequence(leadId, reason, userId);

  await prisma.sequenceEnrollment.update({
    where: { id: enrollment.id },
    data: { status: 'paused' },
  });

  return { success: true, leadId, sequenceId: enrollment.sequenceId, reason };
}

export async function handleUnenroll(payload: SequenceUnenrollPayload) {
  const { leadId, sequenceId } = payload;

  await prisma.sequenceEnrollment.updateMany({
    where: { leadId, sequenceId, status: { in: ['active', 'paused'] } },
    data: { status: 'unenrolled', completedAt: new Date() },
  });

  await unenrollLead(leadId, sequenceId);

  return { success: true, leadId, sequenceId };
}

export async function handleRebuild(payload: SequenceRebuildPayload) {
  const { sequenceId } = payload;

  // Validate the sequence still exists before any rebuild work re-enqueues its jobs.
  const sequence = await prisma.sequence.findUnique({
    where: { id: sequenceId },
    select: { id: true },
  });
  if (!sequence) {
    throw new Error(`Sequence not found: ${sequenceId}`);
  }

  return { success: true, sequenceId };
}

export function createSequenceWorker() {
  return createAppWorker(
    'sequence',
    async (job) => {
      switch (job.name) {
        case JobType.SEQUENCE_ENROLL:
          return handleEnroll(job.data as SequenceEnrollPayload);
        case JobType.SEQUENCE_ADVANCE:
          return handleAdvance(job.data as SequenceAdvancePayload);
        case JobType.SEQUENCE_PAUSE:
          return handlePause(job.data as SequencePausePayload);
        case JobType.SEQUENCE_UNENROLL:
          return handleUnenroll(job.data as SequenceUnenrollPayload);
        case JobType.SEQUENCE_REBUILD:
          return handleRebuild(job.data as SequenceRebuildPayload);
        default:
          console.warn('[worker:sequence] unknown job type:', job.name);
      }
    },
    { concurrency: 5 }
  );
}
