import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, getSession } from '@/lib/auth-store';
import { hasWorkspaceAccess } from '@/lib/billing-store';

export const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export function requestSessionToken(request: Request): string | undefined {
  const cookie = (request.headers.get('cookie') || '').split(';')
    .map(part => part.trim()).find(part => part.startsWith(`${AUTH_COOKIE}=`));
  return cookie?.slice(AUTH_COOKIE.length + 1);
}

export async function getCurrentOwner() {
  return getSession((await cookies()).get(AUTH_COOKIE)?.value);
}

/** Reject cross-site writes, including login CSRF. AUTH_ORIGIN pins a deployed origin. */
export function checkRequestOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  try {
    const url = new URL(request.url);
    const host = request.headers.get('host') || url.host;
    if (!host || /[\\/?#@,\s]/.test(host)) throw new Error('Invalid host');
    const forwardedProtocol = request.headers.get('x-forwarded-proto');
    const protocol = forwardedProtocol === 'http' || forwardedProtocol === 'https'
      ? `${forwardedProtocol}:` : url.protocol;
    const expected = process.env.AUTH_ORIGIN ? new URL(process.env.AUTH_ORIGIN).origin : new URL(`${protocol}//${host}`).origin;
    if (!origin || new URL(origin).origin !== expected || origin !== new URL(origin).origin || fetchSite === 'cross-site') throw new Error('Invalid origin');
    return null;
  } catch {
    return NextResponse.json({ error: 'Cette opération doit être effectuée depuis l’application.' }, { status: 403, headers: PRIVATE_HEADERS });
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true, sameSite: 'lax' as const, path: '/',
    secure: process.env.NODE_ENV === 'production',
  };
}

/** Called inside every private route handler before any editorial data is accessed. */
export async function protectApi(request: Request): Promise<NextResponse | null> {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const denied = checkRequestOrigin(request);
    if (denied) return denied;
  }
  try {
    const user = await getSession(requestSessionToken(request));
    if (user) {
      const url = new URL(request.url);
      const needsSubscription = !['GET', 'HEAD'].includes(request.method) || (url.pathname === '/api/rss' && url.searchParams.get('cacheOnly') !== 'true');
      if (needsSubscription && !await hasWorkspaceAccess(user)) return NextResponse.json({ error: 'Activez votre abonnement pour modifier votre espace et actualiser vos sources. Vos données restent consultables et exportables.', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402, headers: PRIVATE_HEADERS });
      return null;
    }
    return NextResponse.json({ error: 'Votre session a expiré. Reconnectez-vous.', code: 'UNAUTHENTICATED' }, { status: 401, headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: 'L’accès à votre espace est temporairement indisponible. Réessayez.' }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
