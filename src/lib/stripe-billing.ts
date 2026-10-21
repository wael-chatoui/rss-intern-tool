import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import type { Owner } from '@/lib/auth-store';
import { billingMode, getAccountBilling, setAccountBilling, setMemberCustomer, memberIdForCustomer } from '@/lib/billing-store';
import { inDurableTransaction, readDurableDocument, writeDurableDocument } from '@/lib/durable-store';
import { BillingError, billingConfiguration, stripeClient } from '@/lib/stripe';

const APPLICATION = 'la-redaction';
type CheckoutAttempt = { key: string; expiresAt: number; sessionId?: string; url?: string };

export async function createSubscriptionCheckout(account: Owner, stripe = stripeClient()): Promise<string> {
  const config = billingConfiguration();
  if (!config.enabled || !account.id) throw new BillingError('Les abonnements ne sont pas encore ouverts.');
  const billing = await getAccountBilling(account.id);
  let customerId = billing?.customerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: account.email, name: account.name, metadata: { application: APPLICATION, memberId: account.id } }, { idempotencyKey: `${APPLICATION}:customer:${account.id}` });
    customerId = customer.id;
    await setMemberCustomer(account.id, customerId);
  }
  // Query Stripe too: a delayed webhook must never permit a duplicate subscription.
  const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
  if (subscriptions.data.some(subscription => subscription.metadata.application === APPLICATION && !['canceled', 'incomplete_expired'].includes(subscription.status))) throw new BillingError('Un abonnement existe déjà. Gérez-le depuis « Mon abonnement et mes factures ».', 409);
  const checkoutId = `checkout:${billingMode()}:${account.id}`;
  const previousRaw = await readDurableDocument(checkoutId);
  if (previousRaw) {
    const previous = JSON.parse(previousRaw) as CheckoutAttempt;
    if (previous.sessionId) {
      const session = await stripe.checkout.sessions.retrieve(previous.sessionId);
      if (session.status === 'complete') throw new BillingError('Votre paiement a déjà été reçu. La confirmation de votre abonnement est en cours.', 409);
      if (session.status === 'open' && session.url) return session.url;
    }
  }
  const attempt = await inDurableTransaction(async () => {
    const raw = await readDurableDocument(checkoutId);
    const previous = raw ? JSON.parse(raw) as CheckoutAttempt : null;
    if (previous && previous.expiresAt > Date.now() && !previous.sessionId) return previous;
    const pending: CheckoutAttempt = { key: randomUUID(), expiresAt: Date.now() + 60 * 60 * 1000 };
    await writeDurableDocument(checkoutId, JSON.stringify(pending));
    return pending;
  });
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription', customer: customerId,
    line_items: [{ price: config.price, quantity: 1 }],
    client_reference_id: account.id,
    metadata: { application: APPLICATION, memberId: account.id },
    subscription_data: { metadata: { application: APPLICATION, memberId: account.id } },
    allow_promotion_codes: true,
    success_url: `${config.origin}/compte?retour=succes`,
    cancel_url: `${config.origin}/compte?retour=annulation`,
    expires_at: Math.floor(attempt.expiresAt / 1000),
    locale: 'fr',
  }, { idempotencyKey: `${APPLICATION}:checkout:${attempt.key}` });
  if (!session.url) throw new BillingError('Le lien de paiement n’a pas pu être créé. Réessayez.');
  await inDurableTransaction(async () => {
    const raw = await readDurableDocument(checkoutId);
    if (raw && (JSON.parse(raw) as CheckoutAttempt).key === attempt.key) await writeDurableDocument(checkoutId, JSON.stringify({ ...attempt, sessionId: session.id, url: session.url }));
  });
  return session.url;
}

export async function createBillingPortal(account: Owner, stripe = stripeClient()): Promise<string> {
  const config = billingConfiguration();
  if (!account.id) throw new BillingError('Le compte propriétaire ne nécessite pas d’abonnement.', 400);
  const billing = await getAccountBilling(account.id);
  if (!billing?.customerId) throw new BillingError('Aucun abonnement n’est encore associé à ce compte.', 404);
  const session = await stripe.billingPortal.sessions.create({ customer: billing.customerId, return_url: `${config.origin}/compte` });
  return session.url;
}

export async function synchronizeStripeEvent(event: Stripe.Event, stripe = stripeClient()): Promise<'processed' | 'ignored'> {
  const config = billingConfiguration();
  if (event.livemode !== (config.mode === 'live')) throw new BillingError('Le mode de l’événement ne correspond pas à cet environnement.', 400);
  const eventId = `stripe-event:${billingMode()}:${event.id}`;
  if (await readDurableDocument(eventId)) return 'processed';
  let subscriptionId: string | undefined;
  if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) subscriptionId = (event.data.object as Stripe.Subscription).id;
  else if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.application !== APPLICATION || session.mode !== 'subscription') return 'ignored';
    subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  } else return 'ignored';
  if (!subscriptionId) return 'ignored';
  // Use Stripe's current state for out-of-order deliveries, rather than granting
  // access from a stale checkout success or an old subscription snapshot.
  const observedAt = Date.now();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.metadata.application !== APPLICATION) return 'ignored';
  const memberId = subscription.metadata.memberId;
  if (!/^member_[a-f0-9-]{36}$/.test(memberId || '')) return 'ignored';
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  if (await memberIdForCustomer(customerId) !== memberId) throw new BillingError('Le compte de l’abonnement ne correspond pas au client.', 400);
  const allowedPrices = new Set([config.price, ...(process.env.STRIPE_ALLOWED_PRICE_IDS || '').split(',').filter(Boolean)]);
  if (!subscription.items.data.some(item => allowedPrices.has(item.price.id))) return 'ignored';
  const periodEnd = Math.max(0, ...subscription.items.data.map(item => item.current_period_end || 0));
  await inDurableTransaction(async () => {
    if (await readDurableDocument(eventId)) return;
    await setAccountBilling({ memberId, customerId, subscriptionId: subscription.id, status: subscription.status, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: subscription.cancel_at_period_end, lastEventCreated: event.created, lastEventId: event.id, lastObservedAt: observedAt });
    await writeDurableDocument(eventId, JSON.stringify({ type: event.type, created: event.created, processedAt: new Date().toISOString() }));
  });
  return 'processed';
}
