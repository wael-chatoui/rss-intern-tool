import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-store';
import { PRIVATE_HEADERS, requestSessionToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const user = await getSession(requestSessionToken(request));
    return NextResponse.json({ user }, { status: user ? 200 : 401, headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: 'La session est temporairement indisponible.' }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
