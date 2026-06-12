import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canAccessUser } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { hash } from 'bcryptjs';
import { parseBody } from '@/lib/validation/core';
import { updateUserSchema } from '@/lib/validation/schemas';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const currentUser = userOrRes as SessionUser;

  const { id } = await params;
  if (!(await canAccessUser(currentUser, id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      managerId: true,
      avatarUrl: true,
      timezone: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(user);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const currentUser = userOrRes as SessionUser;

  const { id } = await params;
  const parsed = await parseBody(req, updateUserSchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  // Users can update themselves; directors can update anyone
  if (currentUser.id !== id && currentUser.role !== 'director') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updateData: any = {};
  if (body.firstName !== undefined) updateData.firstName = body.firstName;
  if (body.lastName !== undefined) updateData.lastName = body.lastName;
  if (body.timezone !== undefined) updateData.timezone = body.timezone;
  if (body.avatarUrl !== undefined) updateData.avatarUrl = body.avatarUrl;

  // Director-only fields
  if (currentUser.role === 'director') {
    if (body.role !== undefined) updateData.role = body.role;
    if (body.managerId !== undefined) updateData.managerId = body.managerId;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
  }

  // Password reset — directors only; regular users must use /api/settings/password
  if (body.newPassword && currentUser.role === 'director') {
    updateData.password = await hash(body.newPassword, 12);
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true, email: true, firstName: true, lastName: true,
      role: true, managerId: true, timezone: true, isActive: true,
    },
  });

  return NextResponse.json(user);
}
