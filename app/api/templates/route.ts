import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody } from '@/lib/validation/core';
import { createTemplateSchema } from '@/lib/validation/schemas';
import { handleApiError } from '@/lib/api/errors';

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;

  const { searchParams } = new URL(req.url);
  const channel = searchParams.get('channel');
  const search = searchParams.get('search') || '';

  const templates = await prisma.template.findMany({
    where: {
      ...(channel ? { channel: channel as any } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { body: { contains: search, mode: 'insensitive' } },
              { subject: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const parsed = await parseBody(req, createTemplateSchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  try {
    const template = await prisma.template.create({
      data: {
        name: body.name,
        channel: body.channel,
        subject: body.subject ?? null,
        body: body.body,
        category: body.category,
        createdById: user.id,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    return handleApiError('api/templates POST', err);
  }
}
