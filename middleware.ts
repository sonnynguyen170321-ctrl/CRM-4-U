import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    /*
     * Match all routes EXCEPT:
     * - /api (API routes handle their own auth via requireAuth())
     * - /_next (Next.js internals)
     * - /favicon.ico, /public assets
     * - /login (the sign-in page itself)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|login).*)',
  ],
};
