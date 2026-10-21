import { NextResponse } from 'next/server';
import { registerMember, createSession, AUTH_COOKIE, SESSION_TTL_SECONDS, AuthValidationError } from '@/lib/auth-store';
import { checkRequestOrigin, PRIVATE_HEADERS, sessionCookieOptions } from '@/lib/auth';
import { boundedJson, RequestBodyError } from '@/lib/request-json';
import { limitRegistration } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const denied = checkRequestOrigin(request);
  if (denied) return denied;
  if (process.env.PUBLIC_SIGNUP_ENABLED !== '1') return NextResponse.json({ error: 'Les inscriptions ouvriront prochainement.' }, { status: 503, headers: PRIVATE_HEADERS });
  try {
    const body = await boundedJson(request);
    if (typeof body.email !== 'string' || typeof body.name !== 'string' || typeof body.password !== 'string' || body.acceptTerms !== true) return NextResponse.json({ error: 'Renseignez tous les champs et acceptez les conditions d’utilisation.' }, { status: 400, headers: PRIVATE_HEADERS });
    if (!await limitRegistration(request)) return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans une heure.' }, { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': '3600' } });
    const user = await registerMember({ email: body.email, name: body.name, password: body.password });
    const session = await createSession(user);
    const response = NextResponse.json({ user }, { status: 201, headers: PRIVATE_HEADERS });
    response.cookies.set(AUTH_COOKIE, session.token, { ...sessionCookieOptions(), maxAge: SESSION_TTL_SECONDS, expires: new Date(session.expiresAt) });
    return response;
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status, headers: PRIVATE_HEADERS });
    if (error instanceof AuthValidationError) return NextResponse.json({ error: error.message }, { status: 400, headers: PRIVATE_HEADERS });
    return NextResponse.json({ error: 'L’inscription est temporairement indisponible. Réessayez.' }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
