import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, getVisibleUserIds } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const dateRange = searchParams.get('dateRange') ?? 'week';

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rangeStart =
    dateRange === 'today' ? todayStart :
    dateRange === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) :
    new Date(todayStart.getTime() - 7 * 86400000); // Default to week

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        client: true,
        campaignSdrs: true
      }
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const visibleUserIds = await getVisibleUserIds(user);

    if (visibleUserIds) {
    const isAssigned = campaign.campaignSdrs.some((cs) => visibleUserIds.includes(cs.userId));
    if (!isAssigned) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Define lead query scope
  const leadWhere: Record<string, any> = { campaignId: id };
  if (user.role === 'sdr') {
    leadWhere.assignedToId = user.id;
  } else if (visibleUserIds) {
    leadWhere.assignedToId = { in: visibleUserIds };
  }

  // 1. Pipeline Funnel (Stage Counts)
  const rawStageCounts = await prisma.lead.groupBy({
    by: ['stage'],
    where: leadWhere,
    _count: { id: true }
  });
  const stageCounts = Object.fromEntries(
    rawStageCounts.map((sc) => [sc.stage, sc._count.id])
  );

  // 2. Fetch Activities in Date Range for KPI Cards
  const activities = await prisma.activity.findMany({
    where: {
      createdAt: { gte: rangeStart },
      lead: leadWhere
    },
    select: {
      type: true,
      leadId: true,
      sequenceId: true,
      metadata: true,
      userId: true
    }
  });

  const meetingsBooked = activities.filter((a) => a.type === 'meeting_booked').length;
  const contactsTouched = new Set(activities.map((a) => a.leadId).filter(Boolean)).size;
  const replies = new Set(
    activities
      .filter((a) => a.type === 'stage_changed' && a.metadata && typeof a.metadata === 'object' && (a.metadata as any).to === 'replied')
      .map((a) => a.leadId)
      .filter(Boolean)
  ).size;
  const replyRate = contactsTouched > 0 ? Math.round((replies / contactsTouched) * 100) : 0;

  const sequencesRunning = await prisma.sequence.count({
    where: {
      isActive: true,
      leads: {
        some: leadWhere
      }
    }
  });

  const tasksDone = await prisma.task.count({
    where: {
      status: 'completed',
      completedAt: { gte: rangeStart },
      lead: leadWhere
    }
  });

  // 3. Sequences Table Data
  const enrolledSequences = await prisma.sequence.findMany({
    where: {
      leads: {
        some: leadWhere
      }
    },
    select: {
      id: true,
      name: true
    }
  });

  const sequenceMetrics = await Promise.all(
    enrolledSequences.map(async (seq) => {
      const enrolled = await prisma.lead.count({
        where: {
          ...leadWhere,
          sequenceId: seq.id
        }
      });

      const completed = await prisma.activity.count({
        where: {
          createdAt: { gte: rangeStart },
          type: 'sequence_completed',
          sequenceId: seq.id,
          lead: leadWhere
        }
      });

      const seqActs = activities.filter((a) => a.sequenceId === seq.id);
      const seqTouched = new Set(seqActs.map((a) => a.leadId).filter(Boolean)).size;
      const seqReplies = new Set(
        seqActs
          .filter((a) => a.type === 'stage_changed' && a.metadata && typeof a.metadata === 'object' && (a.metadata as any).to === 'replied')
          .map((a) => a.leadId)
          .filter(Boolean)
      ).size;
      const seqReplyRate = seqTouched > 0 ? Math.round((seqReplies / seqTouched) * 100) : 0;

      const seqMeetingsBooked = seqActs.filter((a) => a.type === 'meeting_booked').length;

      return {
        id: seq.id,
        name: seq.name,
        enrolled,
        completed,
        replyRate: seqReplyRate,
        meetingsBooked: seqMeetingsBooked
      };
    })
  );

  // 4. Reps Table Data
  const assignedUsers = await prisma.user.findMany({
    where: {
      campaignSdrs: {
        some: { campaignId: id }
      },
      id: user.role === 'sdr' ? user.id : (visibleUserIds ? { in: visibleUserIds } : undefined)
    },
    select: {
      id: true,
      firstName: true,
      lastName: true
    }
  });

  const repMetrics = await Promise.all(
    assignedUsers.map(async (u) => {
      const repActs = activities.filter((a) => a.userId === u.id);

      const emails = repActs.filter((a) => a.type === 'email_sent').length;
      const calls = repActs.filter((a) => a.type === 'call_logged' || a.type === 'call_made').length;
      const linkedin = repActs.filter((a) => a.type === 'linkedin_touch' || a.type === 'linkedin_sent').length;
      const whatsapp = repActs.filter((a) => a.type === 'whatsapp_message' || a.type === 'whatsapp_sent').length;
      const booked = repActs.filter((a) => a.type === 'meeting_booked').length;

      const repTasksDone = await prisma.task.count({
        where: {
          userId: u.id,
          status: 'completed',
          completedAt: { gte: rangeStart },
          lead: leadWhere
        }
      });

      return {
        id: u.id,
        name: `${u.firstName} ${u.lastName.charAt(0)}.`, // client screenshare safe format
        tasksDone: repTasksDone,
        emails,
        calls,
        linkedin,
        whatsapp,
        booked
      };
    })
  );

    return NextResponse.json({
      campaignName: campaign.name,
      clientName: campaign.client.name,
      status: campaign.status,
      kpis: {
        meetingsBooked,
        contactsTouched,
        replies,
        replyRate,
        sequencesRunning,
        tasksDone
      },
      stageCounts,
      sequences: sequenceMetrics,
      reps: repMetrics
    });
  } catch (err) {
    return handleApiError('api/team/campaigns/[id] GET', err);
  }
}
