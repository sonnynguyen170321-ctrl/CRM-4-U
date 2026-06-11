import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const body = await req.json();
  const { subjectB, bodyB } = body;

  if (!subjectB && !bodyB) {
    return NextResponse.json({ error: 'Provide at least subjectB or bodyB' }, { status: 400 });
  }

  const existingB = await prisma.aBTestVariant.findFirst({
    where: { templateId: id, version: 'B' },
  });

  if (existingB) {
    const updated = await prisma.aBTestVariant.update({
      where: { id: existingB.id },
      data: {
        subject: subjectB ?? undefined,
        body: bodyB ?? undefined,
      },
    });
    return NextResponse.json(updated);
  }

  const variant = await prisma.aBTestVariant.create({
    data: {
      templateId: id,
      version: 'B',
      subject: subjectB ?? null,
      body: bodyB ?? null,
    },
  });

  return NextResponse.json(variant, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await prisma.aBTestVariant.deleteMany({
    where: { templateId: id, version: 'B' },
  });

  return NextResponse.json({ deleted: true });
}
