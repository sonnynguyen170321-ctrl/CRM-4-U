import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { computeVisibleUserIds } from '@/lib/podScoping';

export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'director' | 'floor_manager' | 'team_lead' | 'sdr' | 'leadgen';
  isManager?: boolean;
};

/** Get the authenticated session user from a Server Component or API route. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  return session.user as SessionUser;
}

/** Require authentication in an API route handler. Returns user or 401 response. */
export async function requireAuth(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return user;
}

/** Require a specific role (or above) in an API route handler. */
export async function requireRole(
  minRole: SessionUser['role']
): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const hierarchy: SessionUser['role'][] = ['sdr', 'leadgen', 'team_lead', 'floor_manager', 'director'];
  const userLevel = hierarchy.indexOf(user.role);
  const requiredLevel = hierarchy.indexOf(minRole);

  if (userLevel < requiredLevel) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return user;
}

/** Require a manager role (director, floor_manager, team_lead, or any user with isManager=true) in an API route. */
export async function requireManager(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (user.role !== 'director' && user.role !== 'floor_manager' && user.role !== 'team_lead' && !user.isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return user;
}

export { computeVisibleUserIds };

/**
 * The user IDs this viewer may see, or `null` for unrestricted.
 * Use in queries as: `userId: { in: ids }` / `assignedToId: { in: ids }`.
 */
export async function getVisibleUserIds(user: SessionUser): Promise<string[] | null> {
  if (user.role === 'director') return null;
  if (user.role === 'sdr') return [user.id];
  const allUsers = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, role: true, managerId: true },
  });
  return computeVisibleUserIds(allUsers, user);
}

/** True when the viewer is allowed to see/modify data owned by `ownerId`. */
export async function canAccessUser(viewer: SessionUser, ownerId: string): Promise<boolean> {
  if (viewer.id === ownerId) return true;
  const visible = await getVisibleUserIds(viewer);
  return visible === null || visible.includes(ownerId);
}

/** Build a Prisma `where` clause that scopes leads/tasks to the user's role. */
export function buildRoleScope(user: SessionUser) {
  switch (user.role) {
    case 'director':
    case 'floor_manager':
      return {}; // sees all
    case 'team_lead':
    case 'leadgen':
      return {}; // pod scoping (managerId) applied in each query — not handled here
    case 'sdr':
    default:
      return { assignedToId: user.id };
  }
}
