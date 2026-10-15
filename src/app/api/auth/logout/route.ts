import { NextResponse } from 'next/server';
import { AUTH_COOKIE, revokeSession } from '@/lib/auth-store';
import { checkRequestOrigin, PRIVATE_HEADERS, requestSessionToken, sessionCookieOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const denied = checkRequestOrigin(request);
  if (denied) return denied;
  try {
    await revokeSession(requestSessionToken(request));
    const response = NextResponse.json({ success: true }, { headers: PRIVATE_HEADERS });
    response.cookies.set(AUTH_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
    return response;
  } catch {
    return NextResponse.json({ error: 'Impossible de fermer la session. Réessayez.' }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
