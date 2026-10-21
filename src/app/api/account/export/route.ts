import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-store';
import { PRIVATE_HEADERS, requestSessionToken } from '@/lib/auth';
import { getTransferSnapshot } from '@/lib/transfer-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const user = await getSession(requestSessionToken(request));
    if (!user) return NextResponse.json({ error: 'Reconnectez-vous pour télécharger vos données.' }, { status: 401, headers: PRIVATE_HEADERS });
    const snapshot = await getTransferSnapshot();
    return new NextResponse(JSON.stringify(snapshot.data, null, 2), { headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="la-redaction-sauvegarde.json"' } });
  } catch { return NextResponse.json({ error: 'Le téléchargement est temporairement indisponible. Réessayez.' }, { status: 503, headers: PRIVATE_HEADERS }); }
}
