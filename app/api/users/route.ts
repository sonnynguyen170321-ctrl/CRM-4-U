import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { hash } from 'bcryptjs';

export async function GET() {
  const userOrRes = await requireRole('leadgen');
  if (userOrRes instanceof NextResponse) return userOrRes;

  const users = await prisma.user.findMany({
    where: { isActive: true },
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
    orderBy: [{ role: 'asc' }, { lastName: 'asc' }],
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireRole('director');
  if (userOrRes instanceof NextResponse) return userOrRes;

  const body = await req.json();

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
  }

  const hashedPassword = await hash(body.password, 12);

  const user = await prisma.user.create({
    data: {
      email: body.email,
      password: hashedPassword,
      firstName: body.firstName,
      lastName: body.lastName,
      role: body.role,
      managerId: body.managerId ?? null,
      timezone: body.timezone ?? 'UTC',
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      managerId: true,
      createdAt: true,
    },
  });

  return NextResponse.json(user, { status: 201 });
}
