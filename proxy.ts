import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const { auth } = NextAuth(authConfig);

// auth() enriches the request with req.auth (the session).
// If there's no session, redirect to /login.
export const proxy = auth(function handler(req: NextRequest & { auth: { user?: unknown } | null }) {
  if (!req.auth?.user) {
    // API routes get 401 JSON; page routes get redirected to /login
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
});

// Exclude NextAuth endpoints, the login page, and static assets
export const config = {
  matcher: ['/((?!api/auth|login|_next/static|_next/image|favicon\\.ico|.*\\.png$).*)'],
};
