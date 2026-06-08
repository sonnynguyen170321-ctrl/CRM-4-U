import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { exchangeGoogleCode } from '@/lib/email/adapters/GmailAdapter';

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code) {
    return NextResponse.redirect(new URL('/settings?error=google_auth_failed', req.url));
  }

  // CSRF validation: compare state against the nonce stored in the HttpOnly cookie
  const nonce = req.cookies.get('oauth_nonce_google')?.value;
  if (!nonce || state !== nonce) {
    return NextResponse.redirect(new URL('/settings?error=google_invalid_state', req.url));
  }

  try {
    const { email, accessToken, refreshToken, tokenExpiry } = await exchangeGoogleCode(code);

    // Check if user already connected this Gmail account
    const existing = await prisma.emailAccount.findFirst({
      where: { userId: user.id, email, provider: 'gmail' },
    });

    if (existing) {
      await prisma.emailAccount.update({
        where: { id: existing.id },
        data: {
          accessToken,
          refreshToken,
          tokenExpiry,
          isActive: true,
          lastSyncAt: new Date(),
        },
      });
    } else {
      await prisma.emailAccount.create({
        data: {
          userId: user.id,
          email,
          provider: 'gmail',
          accessToken,
          refreshToken,
          tokenExpiry,
          isActive: true,
          lastSyncAt: new Date(),
        },
      });
    }

    const res = NextResponse.redirect(new URL('/settings?success=gmail_connected', req.url));
    res.cookies.delete('oauth_nonce_google');
    return res;
  } catch (error) {
    console.error('Error exchanging Google OAuth code:', error);
    return NextResponse.redirect(new URL('/settings?error=google_token_exchange_failed', req.url));
  }
}
