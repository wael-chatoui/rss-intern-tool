import { NextResponse } from 'next/server';
import { synchronizeStripeEvent } from '@/lib/stripe-billing';
import { stripeClient, BillingError } from '@/lib/stripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: 'Signature requise.' }, { status: 400 });
  try {
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: 'Événement vide.' }, { status: 400 });
    let length = 0; const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 1024 * 1024) { await reader.cancel(); return NextResponse.json({ error: 'Événement trop volumineux.' }, { status: 413 }); }
      chunks.push(value);
    }
    const stripe = stripeClient();
    let event;
    try { event = stripe.webhooks.constructEvent(Buffer.concat(chunks), signature, secret); }
    catch { return NextResponse.json({ error: 'Signature invalide.' }, { status: 400 }); }
    const result = await synchronizeStripeEvent(event, stripe);
    return NextResponse.json({ received: true, result });
  } catch (error) {
    if (error instanceof BillingError && error.status === 400) return NextResponse.json({ error: error.message }, { status: 400 });
    // Do not acknowledge a transient failure: Stripe must retry the delivery.
    return NextResponse.json({ error: 'Événement temporairement indisponible.' }, { status: 503 });
  }
}
