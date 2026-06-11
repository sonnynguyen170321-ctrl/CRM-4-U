import { NextResponse } from 'next/server';

/**
 * Standard API error response: log the full error server-side, return a
 * generic message to the client (provider/DB errors can leak account details).
 */
export function handleApiError(context: string, err: unknown): NextResponse {
  console.error(`[${context}]`, err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
