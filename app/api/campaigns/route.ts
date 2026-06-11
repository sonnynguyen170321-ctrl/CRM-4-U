import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody } from '@/lib/validation/core';
import { createCampaignSchema } from '@/lib/validation/schemas';
import { handleApiError } from '@/lib/api/errors';

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');

  // Return clients list for the campaign modal dropdown
  if (type === 'clients') {
    const clients = await prisma.client.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, industry: true },
    });
    return NextResponse.json({ clients }, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' },
    });
  }

  const campaigns = await prisma.campaign.findMany({
    include: { client: true },
    orderBy: { startDate: 'desc' },
  });

  return NextResponse.json(campaigns, {
    headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' },
  });
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireRole('floor_manager');
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const parsed = await parseBody(req, createCampaignSchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  let clientId = body.clientId;

  // Create new client if needed
  if (!clientId && body.newClientName) {
    const newClient = await prisma.client.create({
      data: {
        name: body.newClientName,
        industry: body.targetVertical || '',
        contactName: user.firstName + ' ' + user.lastName,
        contactEmail: user.email,
        status: 'active',
      },
    });
    clientId = newClient.id;
  }

  if (!clientId) {
    return NextResponse.json({ error: 'Client is required' }, { status: 400 });
  }

  try {
    const campaign = await prisma.campaign.create({
      data: {
        name: body.name,
        clientId,
        targetVertical: body.targetVertical ?? null,
        targetGeo: body.targetGeo ?? null,
        status: body.status ?? 'active',
        startDate: body.startDate ?? new Date(),
        endDate: null,
      },
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    return handleApiError('api/campaigns POST', err);
  }
}
