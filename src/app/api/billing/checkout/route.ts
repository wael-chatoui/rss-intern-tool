import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-store';
import { checkRequestOrigin, PRIVATE_HEADERS, requestSessionToken } from '@/lib/auth';
import { createSubscriptionCheckout } from '@/lib/stripe-billing';
import { BillingError } from '@/lib/stripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const denied = checkRequestOrigin(request);
  if (denied) return denied;
  try {
    const user = await getSession(requestSessionToken(request));
    if (!user) return NextResponse.json({ error: 'Reconnectez-vous pour choisir votre abonnement.' }, { status: 401, headers: PRIVATE_HEADERS });
    return NextResponse.json({ url: await createSubscriptionCheckout(user) }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof BillingError) return NextResponse.json({ error: error.message }, { status: error.status, headers: PRIVATE_HEADERS });
    return NextResponse.json({ error: 'Le paiement est temporairement indisponible. Réessayez.' }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
