import { prisma } from '@/lib/prisma';

export interface SequenceAnalytics {
  totalEnrolled: number;
  activeEnrolled: number;
  completedCount: number;
  totalSends: number;
  uniqueReplies: number;
  bounceCount: number;
  replyRate: number;
  bounceRate: number;
  sendsByDay: { date: string; count: number }[];
  topTemplates: { id: string; name: string; sent: number; replies: number; rate: number }[];
  stepBreakdown: { step: number; channel: string; sent: number; replies: number }[];
}

export interface TemplateAnalytics {
  id: string;
  name: string;
  channel: string;
  totalSent: number;
  totalReplies: number;
  replyRate: number;
  variants: { version: string; sent: number; replies: number; rate: number }[];
}

export async function getSequenceAnalytics(sequenceId: string): Promise<SequenceAnalytics> {
  const sequence = await prisma.sequence.findUnique({
    where: { id: sequenceId },
    include: { steps: true, _count: { select: { leads: true } } },
  });
  if (!sequence) throw new Error('Sequence not found');

  const activeEnrolled = await prisma.lead.count({
    where: { sequenceId, sequenceStatus: 'active' },
  });

  const completedActivities = await prisma.activity.count({
    where: { sequenceId, type: 'sequence_completed' },
  });

  const sends = await prisma.activity.findMany({
    where: { sequenceId: null, type: 'email_sent', metadata: { path: ['sequenceId'], equals: sequenceId } },
    select: { createdAt: true },
  });

  const totalSends = sends.length;

  const activities = await prisma.activity.findMany({
    where: {
      leadId: { not: null },
      type: { in: ['email_sent', 'stage_changed', 'sequence_unenrolled'] },
      metadata: { path: ['sequenceId'], equals: sequenceId },
    },
    select: { type: true, metadata: true, createdAt: true },
  });

  const replies = activities.filter(a => a.type === 'stage_changed' && (a.metadata as any)?.to === 'replied').length;
  const bounces = activities.filter(a => a.type === 'sequence_unenrolled' && (a.metadata as any)?.reason === 'bounced').length;

  const sendsByDayMap = new Map<string, number>();
  sends.forEach(s => {
    const day = s.createdAt.toISOString().slice(0, 10);
    sendsByDayMap.set(day, (sendsByDayMap.get(day) || 0) + 1);
  });
  const sendsByDay = Array.from(sendsByDayMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const templateSends = await prisma.activity.groupBy({
    by: ['description'],
    where: { type: 'email_sent', metadata: { path: ['templateId'], not: null } },
    _count: { id: true },
  });

  const topTemplates: SequenceAnalytics['topTemplates'] = [];
  const stepBreakdown: SequenceAnalytics['stepBreakdown'] = [];

  for (const step of sequence.steps) {
    const stepKey = `Step ${step.order}`;
    const sentCount = await prisma.activity.count({
      where: {
        type: 'email_sent',
        AND: [
          { metadata: { path: ['sequenceStep'], equals: step.order } },
        ],
      },
    });
    stepBreakdown.push({
      step: step.order,
      channel: step.channel,
      sent: sentCount,
      replies: 0,
    });
  }

  return {
    totalEnrolled: sequence._count.leads,
    activeEnrolled,
    completedCount: completedActivities,
    totalSends,
    uniqueReplies: replies,
    bounceCount: bounces,
    replyRate: totalSends > 0 ? Math.round((replies / totalSends) * 10000) / 100 : 0,
    bounceRate: totalSends > 0 ? Math.round((bounces / totalSends) * 10000) / 100 : 0,
    sendsByDay,
    topTemplates,
    stepBreakdown,
  };
}

export async function getTemplateAnalytics(templateId: string): Promise<TemplateAnalytics | null> {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: { abVariants: true },
  });
  if (!template) return null;

  const totalSent = template.abVariants.reduce((sum, v) => sum + v.sentCount, 0);
  const totalReplies = template.abVariants.reduce((sum, v) => sum + v.replyCount, 0);

  return {
    id: template.id,
    name: template.name,
    channel: template.channel,
    totalSent,
    totalReplies,
    replyRate: totalSent > 0 ? Math.round((totalReplies / totalSent) * 10000) / 100 : 0,
    variants: template.abVariants.map(v => ({
      version: v.version,
      sent: v.sentCount,
      replies: v.replyCount,
      rate: v.sentCount > 0 ? Math.round((v.replyCount / v.sentCount) * 10000) / 100 : 0,
    })),
  };
}

export async function getDashboardStats(userId: string) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(todayStart.getTime() - 7 * 86400000);
  const monthAgo = new Date(todayStart.getTime() - 30 * 86400000);

  const [
    totalLeads,
    activeEnrollments,
    todaySends,
    weekSends,
    monthSends,
    todayReplies,
    weekReplies,
    totalBounces,
    topSequences,
  ] = await Promise.all([
    prisma.lead.count({ where: { assignedToId: userId } }),
    prisma.lead.count({ where: { assignedToId: userId, sequenceStatus: 'active' } }),
    prisma.activity.count({ where: { userId, type: 'email_sent', createdAt: { gte: todayStart } } }),
    prisma.activity.count({ where: { userId, type: 'email_sent', createdAt: { gte: weekAgo } } }),
    prisma.activity.count({ where: { userId, type: 'email_sent', createdAt: { gte: monthAgo } } }),
    prisma.activity.count({
      where: { userId: { not: userId }, type: 'stage_changed', metadata: { path: ['to'], equals: 'replied' }, createdAt: { gte: todayStart } },
    }),
    prisma.activity.count({
      where: { userId: { not: userId }, type: 'stage_changed', metadata: { path: ['to'], equals: 'replied' }, createdAt: { gte: weekAgo } },
    }),
    prisma.lead.count({ where: { assignedToId: userId, emailInvalid: true } }),
    prisma.sequence.findMany({
      where: { createdById: userId, isArchived: false },
      select: { id: true, name: true, _count: { select: { leads: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  return {
    totalLeads,
    activeEnrollments,
    todaySends,
    weekSends,
    monthSends,
    todayReplies,
    weekReplies,
    totalBounces,
    sequences: topSequences,
  };
}
