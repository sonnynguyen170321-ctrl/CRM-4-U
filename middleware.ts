import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  // NextAuth v5 sets one of these two cookie names depending on HTTPS
  const hasSession =
    req.cookies.has('__Secure-authjs.session-token') ||
    req.cookies.has('authjs.session-token');

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|login).*)',
  ],
};
