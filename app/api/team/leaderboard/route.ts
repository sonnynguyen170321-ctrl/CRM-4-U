import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireManager } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { computeVisibleUserIds } from '@/lib/podScoping';
import { handleApiError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userOrRes = await requireManager();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  try {
    const { searchParams } = new URL(req.url);
    const dateRange = searchParams.get('dateRange') ?? 'week';
    const sdrId = searchParams.get('sdrId') ?? '';
    const managerId = searchParams.get('managerId') ?? '';

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const rangeStart =
      dateRange === 'today' ? todayStart :
      dateRange === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) :
      new Date(todayStart.getTime() - 7 * 86400000);

    const allUsers = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true, role: true, managerId: true },
    });

  const visibleIds = computeVisibleUserIds(allUsers, user);

  // Filter scoped users based on query parameters
  let targetIds = visibleIds ? [...visibleIds] : allUsers.map((u) => u.id);

  if (sdrId) {
    if (visibleIds && !visibleIds.includes(sdrId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    targetIds = [sdrId];
  } else if (managerId) {
    const podIds = allUsers.filter((u) => u.managerId === managerId).map((u) => u.id);
    targetIds = visibleIds ? podIds.filter((id) => visibleIds.includes(id)) : podIds;
  }

  // Fetch activities in date range for target users
  const activities = await prisma.activity.findMany({
    where: {
      createdAt: { gte: rangeStart },
      userId: { in: targetIds }
    },
    select: {
      userId: true,
      type: true
    }
  });

  const scopedUsers = allUsers.filter((u) => targetIds.includes(u.id) && ['sdr', 'team_lead', 'floor_manager', 'leadgen'].includes(u.role));

  const leaderboard = scopedUsers.map((u) => {
    const userActs = activities.filter((a) => a.userId === u.id);
    
    const calls = userActs.filter((a) => a.type === 'call_logged' || a.type === 'call_made').length;
    const emails = userActs.filter((a) => a.type === 'email_sent').length;
    const linkedin = userActs.filter((a) => a.type === 'linkedin_touch' || a.type === 'linkedin_sent').length;
    const whatsapp = userActs.filter((a) => a.type === 'whatsapp_message' || a.type === 'whatsapp_sent').length;
    const booked = userActs.filter((a) => a.type === 'meeting_booked').length;
    
    const total = calls + emails + linkedin + whatsapp + booked;

    return {
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      role: u.role,
      calls,
      emails,
      linkedin,
      whatsapp,
      booked,
      total
    };
  }).sort((a, b) => b.booked - a.booked || b.total - a.total);

    return NextResponse.json(leaderboard);
  } catch (err) {
    return handleApiError('api/team/leaderboard GET', err);
  }
}
