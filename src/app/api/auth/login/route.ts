import { NextResponse } from 'next/server';
import { authenticateOwner, createSession, AUTH_COOKIE, SESSION_TTL_SECONDS } from '@/lib/auth-store';
import { checkRequestOrigin, PRIVATE_HEADERS, sessionCookieOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const denied = checkRequestOrigin(request);
  if (denied) return denied;
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'La requête doit être au format JSON.' }, { status: 415, headers: PRIVATE_HEADERS });
  }
  try {
    // Bound the actual body as well as Content-Length before parsing or hashing.
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: 'Renseignez votre e-mail et votre mot de passe.' }, { status: 400, headers: PRIVATE_HEADERS });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return NextResponse.json({ error: 'La requête est trop volumineuse.' }, { status: 413, headers: PRIVATE_HEADERS });
      }
      chunks.push(value);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return NextResponse.json({ error: 'La requête est invalide.' }, { status: 400, headers: PRIVATE_HEADERS }); }
    if (!body || typeof body.email !== 'string' || typeof body.password !== 'string' || body.email.length > 254 || body.password.length > 512) {
      return NextResponse.json({ error: 'Renseignez votre e-mail et votre mot de passe.' }, { status: 400, headers: PRIVATE_HEADERS });
    }
    const owner = await authenticateOwner(body.email, body.password);
    if (!owner) return NextResponse.json({ error: 'L’e-mail ou le mot de passe est incorrect.' }, { status: 401, headers: PRIVATE_HEADERS });
    const session = await createSession(owner);
    const response = NextResponse.json({ user: owner }, { headers: PRIVATE_HEADERS });
    response.cookies.set(AUTH_COOKIE, session.token, { ...sessionCookieOptions(), maxAge: SESSION_TTL_SECONDS, expires: new Date(session.expiresAt) });
    return response;
  } catch (error) {
    const retryAfter = (error as { retryAfter?: number })?.retryAfter;
    if (typeof retryAfter === 'number' && retryAfter > 0) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' }, { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': String(Math.ceil(retryAfter)) } });
    }
    return NextResponse.json({ error: 'La connexion est temporairement indisponible. Réessayez.' }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
