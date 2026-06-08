import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const userOrRes = await requireRole('team_lead');
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { searchParams } = new URL(req.url);
  const dateRange = searchParams.get('dateRange') ?? 'week'; // today | week | month
  const sdrId = searchParams.get('sdrId') ?? '';
  const managerId = searchParams.get('managerId') ?? '';

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rangeStart =
    dateRange === 'today' ? todayStart :
    dateRange === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) :
    new Date(todayStart.getTime() - 7 * 86400000); // week default

  type UserRow = { id: string; firstName: string; lastName: string; role: string; managerId: string | null };

  // Fetch all active users first (needed for scoping logic below)
  const allUsers: UserRow[] = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, firstName: true, lastName: true, role: true, managerId: true },
  });

  // Determine which user IDs this viewer is allowed to see based on their role
  function getVisibleUserIds(viewerRole: string, viewerId: string): string[] | null {
    if (viewerRole === 'director' || viewerRole === 'floor_manager') {
      // Floor managers in a real system would be scoped to their floor.
      // For MVP, directors and FMs see everyone.
      return null; // null = no restriction
    }
    if (viewerRole === 'team_lead') {
      // Team lead sees only their direct reports
      return allUsers
        .filter((u) => u.managerId === viewerId)
        .map((u) => u.id);
    }
    // SDRs cannot reach this endpoint (requireRole('team_lead') blocks them)
    return [viewerId];
  }

  const visibleIds = getVisibleUserIds(user.role, user.id);

  // Merge explicit sdrId/managerId filter with role-based scope
  let activityUserScope: Record<string, any> = {};
  let userScope: Record<string, any> = {};

  if (sdrId) {
    // Explicit SDR filter — still respect role scope
    const canSee = !visibleIds || visibleIds.includes(sdrId);
    if (!canSee) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    activityUserScope = { userId: sdrId };
    userScope = { assignedToId: sdrId };
  } else if (managerId) {
    const podIds = allUsers.filter((u) => u.managerId === managerId).map((u) => u.id);
    const effectiveIds = visibleIds ? podIds.filter((id) => visibleIds.includes(id)) : podIds;
    activityUserScope = effectiveIds.length > 0 ? { userId: { in: effectiveIds } } : {};
    userScope = effectiveIds.length > 0 ? { assignedToId: { in: effectiveIds } } : {};
  } else if (visibleIds) {
    activityUserScope = { userId: { in: visibleIds } };
    userScope = { assignedToId: { in: visibleIds } };
  }

  // Stage counts — scoped to visible leads
  const stageCounts = await prisma.lead.groupBy({
    by: ['stage'],
    _count: { id: true },
    ...(Object.keys(userScope).length > 0 ? { where: userScope } : {}),
  });

  // Leaderboard: activities per user in selected range
  const activityCounts = await prisma.activity.groupBy({
    by: ['userId', 'type'],
    _count: { id: true },
    where: {
      createdAt: { gte: rangeStart },
      ...activityUserScope,
    },
  });

  // Return only users in scope for the leaderboard
  const scopedUsers = visibleIds
    ? allUsers.filter((u) => visibleIds.includes(u.id))
    : allUsers.filter((u) => ['sdr', 'team_lead', 'floor_manager'].includes(u.role));

  // Overdue task counts per user — scoped
  const overdueWhere: Record<string, any> = {
    status: 'pending',
    dueDate: { lt: todayStart },
  };
  if (Object.keys(activityUserScope).length > 0) {
    if (activityUserScope.userId) overdueWhere.userId = activityUserScope.userId;
  }
  const overdueByUser = await prisma.task.groupBy({
    by: ['userId'],
    _count: { id: true },
    where: overdueWhere,
  });

  // Sequence performance — active sequences with enrolled count + reply rate
  const rawSequences = await prisma.sequence.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      _count: { select: { leads: true } },
    },
  });

  const repliedLeads = await prisma.lead.groupBy({
    by: ['sequenceId'],
    where: {
      sequenceId: { in: rawSequences.map((s: { id: string }) => s.id) },
      stage: { in: ['replied', 'meeting_booked', 'won', 'lost'] },
    },
    _count: { id: true },
  });
  const repliedMap = Object.fromEntries(repliedLeads.map((r: { sequenceId: string | null; _count: { id: number } }) => [r.sequenceId, r._count.id]));

  const sequenceStats = rawSequences.map((s: { id: string; name: string; _count: { leads: number } }) => ({
    ...s,
    repliedCount: repliedMap[s.id] ?? 0,
    replyRate: s._count.leads > 0
      ? Math.round(((repliedMap[s.id] ?? 0) / s._count.leads) * 100)
      : 0,
  }));

  return NextResponse.json({
    stageCounts: Object.fromEntries(
      stageCounts.map((s: { stage: string; _count: { id: number } }) => [s.stage, s._count.id])
    ),
    activityCounts,
    users: scopedUsers,
    overdueByUser: Object.fromEntries(
      overdueByUser.map((o: { userId: string; _count: { id: number } }) => [o.userId, o._count.id])
    ),
    sequenceStats,
  });
}
