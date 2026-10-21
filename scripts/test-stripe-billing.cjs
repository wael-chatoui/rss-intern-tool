const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Stripe = require('stripe');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'redaction-stripe-'));
  Object.assign(process.env, { TURSO_DATABASE_URL: `file:${path.join(directory, 'billing.sqlite')}`, TURSO_AUTH_TOKEN: '', VERCEL: '', STRIPE_SECRET_KEY: 'sk_test_isolated_fixture_only', STRIPE_MODE: 'test', STRIPE_PRICE_MONTHLY: 'price_fixture', APP_BASE_URL: 'http://localhost:3206', AUTH_ORIGIN: 'http://localhost:3206', BILLING_ENABLED: '1', STRIPE_WEBHOOK_SECRET: 'whsec_isolated_fixture_only' });
  const load = require('./load-typescript.cjs')();
  const auth = load('src/lib/auth-store.ts'); const billing = load('src/lib/billing-store.ts');
  const service = load('src/lib/stripe-billing.ts'); const stripeModule = load('src/lib/stripe.ts');
  const actualSdk = new Stripe(process.env.STRIPE_SECRET_KEY);
  const checkoutByKey = new Map(); const calls = { customers: [], checkouts: [], portals: [] };
  let subscriptions = []; let currentSubscription;
  const stripe = {
    webhooks: actualSdk.webhooks,
    customers: { create: async (params, options) => { calls.customers.push({ params, options }); return { id: 'cus_fixtureA' }; } },
    subscriptions: { list: async () => ({ data: subscriptions }), retrieve: async id => { assert.equal(id, currentSubscription.id); return structuredClone(currentSubscription); } },
    checkout: { sessions: {
      create: async (params, options) => {
        calls.checkouts.push({ params, options });
        if (!checkoutByKey.has(options.idempotencyKey)) checkoutByKey.set(options.idempotencyKey, { id: `cs_test_${checkoutByKey.size}`, url: `https://checkout.stripe.com/c/pay/fixture${checkoutByKey.size}`, status: 'open' });
        return checkoutByKey.get(options.idempotencyKey);
      },
      retrieve: async id => [...checkoutByKey.values()].find(session => session.id === id),
    } },
    billingPortal: { sessions: { create: async params => { calls.portals.push(params); return { url: 'https://billing.stripe.com/p/session/fixture' }; } } },
  };
  try {
    const first = await auth.registerMember({ email: 'a@example.test', name: 'Test A', password: 'une phrase de test exclusivement locale' });
    const second = await auth.registerMember({ email: 'b@example.test', name: 'Test B', password: 'une seconde phrase de test locale' });
    const [urlA, urlB] = await Promise.all([service.createSubscriptionCheckout(first, stripe), service.createSubscriptionCheckout(first, stripe)]);
    assert.equal(urlA, urlB); assert.equal(checkoutByKey.size, 1);
    assert.equal(calls.checkouts[0].params.line_items[0].price, 'price_fixture');
    assert.equal(calls.checkouts[0].params.line_items[0].quantity, 1);
    assert.equal(calls.checkouts[0].params.subscription_data.metadata.memberId, first.id);
    assert.equal(calls.checkouts[0].params.allow_promotion_codes, true);
    assert.equal(calls.checkouts[0].params.success_url, 'http://localhost:3206/compte?retour=succes');
    assert.equal(await billing.memberIdForCustomer('cus_fixtureA'), first.id);
    assert.equal(await billing.hasWorkspaceAccess(first), false, 'return URL and checkout creation cannot grant access');
    await assert.rejects(service.createBillingPortal(second, stripe), /Aucun abonnement/);
    assert.match(await service.createBillingPortal(first, stripe), /^https:\/\/billing.stripe.com/);
    assert.equal(calls.portals[0].customer, 'cus_fixtureA');

    currentSubscription = { id: 'sub_fixtureA', object: 'subscription', metadata: { application: 'la-redaction', memberId: first.id }, customer: 'cus_fixtureA', status: 'active', cancel_at_period_end: false, items: { data: [{ price: { id: 'price_fixture' }, current_period_end: Math.floor(Date.now() / 1000) + 3600 }] } };
    const event = { id: 'evt_fixture1', object: 'event', type: 'customer.subscription.updated', created: 100, livemode: false, data: { object: currentSubscription } };
    assert.equal(await service.synchronizeStripeEvent(event, stripe), 'processed');
    assert.equal(await billing.hasWorkspaceAccess(first), true); assert.equal(await billing.hasWorkspaceAccess(second), false);
    process.env.STRIPE_MODE = 'live';assert.equal(await billing.hasWorkspaceAccess(first), false);assert.equal(await billing.getAccountBilling(first.id), null);assert.equal(await billing.memberIdForCustomer('cus_fixtureA'), null);process.env.STRIPE_MODE = 'test';
    assert.equal(await service.synchronizeStripeEvent(event, stripe), 'processed');
    subscriptions = [currentSubscription];
    await assert.rejects(service.createSubscriptionCheckout(first, stripe), /existe déjà/);
    await assert.rejects(service.synchronizeStripeEvent({ ...event, id: 'evt_live', livemode: true }, stripe), /mode/);
    currentSubscription.metadata.memberId = second.id;
    await assert.rejects(service.synchronizeStripeEvent({ ...event, id: 'evt_cross' }, stripe), /correspond pas/);
    currentSubscription.metadata.memberId = first.id;
    currentSubscription.items.data[0].price.id = 'price_other';
    assert.equal(await service.synchronizeStripeEvent({ ...event, id: 'evt_price_other' }, stripe), 'ignored');
    currentSubscription.items.data[0].price.id = 'price_fixture';
    currentSubscription.status = 'canceled';
    await service.synchronizeStripeEvent({ ...event, id: 'evt_canceled', created: 102 }, stripe);
    await service.synchronizeStripeEvent({ ...event, id: 'evt_old', created: 101 }, stripe);
    assert.equal(await billing.hasWorkspaceAccess(first), false);

    const routeLoad = require('./load-typescript.cjs')(undefined, { '@/lib/stripe': { ...stripeModule, stripeClient: () => stripe }, '@/lib/stripe-billing': { ...service, synchronizeStripeEvent: event => service.synchronizeStripeEvent(event, stripe) } });
    const route = routeLoad('src/app/api/billing/webhook/route.ts');
    const payload = JSON.stringify({ ...event, id: 'evt_signed', created: 103 });
    const signature = actualSdk.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
    const request = (body, header) => new Request('http://localhost:3206/api/billing/webhook', { method: 'POST', headers: header ? { 'stripe-signature': header } : {}, body });
    assert.equal((await route.POST(request(payload, signature))).status, 200);
    assert.equal((await route.POST(request(payload + ' ', signature))).status, 400);
    assert.equal((await route.POST(request(payload))).status, 400);
    const oldSignature = actualSdk.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET, timestamp: Math.floor(Date.now() / 1000) - 1000 });
    assert.equal((await route.POST(request(payload, oldSignature))).status, 400);
    assert.equal((await route.POST(request('x'.repeat(1024 * 1024 + 1), signature))).status, 413);
    process.env.STRIPE_MODE = 'live';
    assert.throws(() => stripeModule.billingConfiguration(), /indisponibles/);
    console.log('Stripe: server-only price, duplicate checkout idempotency, inactive-before-webhook, per-account portal, signatures/raw body/timestamp, replay, mode, cross-account, foreign-price and cancellation checks passed (isolated SQLite and Stripe SDK HMAC; zero network/payment calls).');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
