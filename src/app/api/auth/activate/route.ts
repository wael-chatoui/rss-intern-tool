import { NextResponse } from 'next/server';
import { activateOwner, createSession, AUTH_COOKIE, SESSION_TTL_SECONDS, AuthValidationError } from '@/lib/auth-store';
import { checkRequestOrigin, PRIVATE_HEADERS, sessionCookieOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const denied = checkRequestOrigin(request);
  if (denied) return denied;
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'La requête doit être au format JSON.' }, { status: 415, headers: PRIVATE_HEADERS });
  try {
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: 'Renseignez les champs du formulaire.' }, { status: 400, headers: PRIVATE_HEADERS });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); return NextResponse.json({ error: 'La requête est trop volumineuse.' }, { status: 413, headers: PRIVATE_HEADERS }); }
      chunks.push(value);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return NextResponse.json({ error: 'La requête est invalide.' }, { status: 400, headers: PRIVATE_HEADERS }); }
    if (!body || typeof body.token !== 'string' || typeof body.name !== 'string' || typeof body.email !== 'string' || typeof body.password !== 'string') return NextResponse.json({ error: 'Renseignez les champs du formulaire.' }, { status: 400, headers: PRIVATE_HEADERS });
    const owner = await activateOwner(body);
    const session = await createSession();
    const response = NextResponse.json({ user: owner }, { status: 201, headers: PRIVATE_HEADERS });
    response.cookies.set(AUTH_COOKIE, session.token, { ...sessionCookieOptions(), maxAge: SESSION_TTL_SECONDS, expires: new Date(session.expiresAt) });
    return response;
  } catch (error) {
    if (error instanceof AuthValidationError) return NextResponse.json({ error: error.message }, { status: 400, headers: PRIVATE_HEADERS });
    return NextResponse.json({ error: 'L’activation est temporairement indisponible. Réessayez.' }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
