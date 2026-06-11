import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody } from '@/lib/validation/core';
import { createNoteSchema } from '@/lib/validation/schemas';

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;

  const leadId = new URL(req.url).searchParams.get('leadId');
  if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

  const notes = await prisma.note.findMany({
    where: { leadId },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const parsed = await parseBody(req, createNoteSchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const note = await prisma.note.create({
    data: {
      leadId: body.leadId,
      content: body.content,
      createdById: user.id,
      isPinned: body.isPinned ?? false,
    },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  // Auto-log note_added activity
  await prisma.activity.create({
    data: {
      userId: user.id,
      leadId: body.leadId,
      type: 'note_added',
      description: 'Note added to lead',
      metadata: { excerpt: body.content.slice(0, 100) },
    },
  });

  return NextResponse.json(note, { status: 201 });
}
