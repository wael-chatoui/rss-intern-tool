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
  const checkoutByKey = new Map(); const calls = { customers: [], checkouts: [], portals: [], expired: [] };
  const monthlyPrice = { id: 'price_fixture', active: true, livemode: false, currency: 'eur', unit_amount: 590, type: 'recurring', billing_scheme: 'per_unit', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' }, tax_behavior: 'inclusive', product: { id: 'prod_fixture', active: true, metadata: { application: 'la-redaction' } } };
  let configuredPrice = structuredClone(monthlyPrice);
  let subscriptions = []; let currentSubscription;
  const stripe = {
    webhooks: actualSdk.webhooks,
    prices: { retrieve: async id => { assert.equal(id, process.env.STRIPE_PRICE_MONTHLY); return structuredClone(configuredPrice); } },
    customers: { create: async (params, options) => { calls.customers.push({ params, options }); return { id: 'cus_fixtureA' }; } },
    subscriptions: { list: async () => ({ data: subscriptions }), retrieve: async id => { assert.equal(id, currentSubscription.id); return structuredClone(currentSubscription); } },
    checkout: { sessions: {
      create: async (params, options) => {
        calls.checkouts.push({ params, options });
        if (!checkoutByKey.has(options.idempotencyKey)) checkoutByKey.set(options.idempotencyKey, { ...structuredClone(params), id: `cs_test_${checkoutByKey.size}`, url: `https://checkout.stripe.com/c/pay/fixture${checkoutByKey.size}`, status: 'open', livemode: false, line_items: { data: params.line_items.map(item => ({ price: { id: item.price }, quantity: item.quantity })), has_more: false } });
        return checkoutByKey.get(options.idempotencyKey);
      },
      retrieve: async id => [...checkoutByKey.values()].find(session => session.id === id),
      expire: async id => { calls.expired.push(id); const session = [...checkoutByKey.values()].find(session => session.id === id); session.status = 'expired'; return session; },
    } },
    billingPortal: { sessions: { create: async params => { calls.portals.push(params); return { url: 'https://billing.stripe.com/p/session/fixture' }; } } },
  };
  try {
    const first = await auth.registerMember({ email: 'a@example.test', name: 'Test A', password: 'une phrase de test exclusivement locale' });
    const second = await auth.registerMember({ email: 'b@example.test', name: 'Test B', password: 'une seconde phrase de test locale' });
    for (const wrong of [{ active: false }, { livemode: true }, { currency: 'usd' }, { unit_amount: 1900 }, { billing_scheme: 'tiered' }, { recurring: { ...monthlyPrice.recurring, interval: 'year' } }, { recurring: { ...monthlyPrice.recurring, interval_count: 2 } }, { recurring: { ...monthlyPrice.recurring, usage_type: 'metered' } }, { tax_behavior: 'exclusive' }, { tax_behavior: 'unspecified' }, { product: { ...monthlyPrice.product, active: false } }, { product: { ...monthlyPrice.product, metadata: { application: 'other-app' } } }]) {
      configuredPrice = { ...structuredClone(monthlyPrice), ...wrong };
      await assert.rejects(service.createSubscriptionCheckout(first, stripe), /tarif/);
    }
    assert.equal(calls.customers.length, 0, 'invalid price must fail before creating a customer');
    configuredPrice = structuredClone(monthlyPrice);
    const [urlA, urlB] = await Promise.all([service.createSubscriptionCheckout(first, stripe), service.createSubscriptionCheckout(first, stripe)]);
    assert.equal(urlA, urlB); assert.equal(checkoutByKey.size, 1);
    assert.equal(calls.checkouts[0].params.line_items[0].price, 'price_fixture');
    assert.equal(calls.checkouts[0].params.line_items[0].quantity, 1);
    assert.equal(calls.checkouts[0].params.subscription_data.metadata.memberId, first.id);
    assert.equal(calls.checkouts[0].params.allow_promotion_codes, true);
    assert.equal(calls.checkouts[0].params.automatic_tax.enabled, false);
    assert.equal(calls.checkouts[0].params.success_url, 'http://localhost:3206/compte?retour=succes');
    assert.equal(await billing.memberIdForCustomer('cus_fixtureA'), first.id);
    assert.equal(await billing.hasWorkspaceAccess(first), false, 'return URL and checkout creation cannot grant access');
    await assert.rejects(service.createBillingPortal(second, stripe), /Aucun abonnement/);
    assert.match(await service.createBillingPortal(first, stripe), /^https:\/\/billing.stripe.com/);
    assert.equal(calls.portals[0].customer, 'cus_fixtureA');
    for (const alter of [session => { session.line_items.data[0].price.id = 'price_old1900'; }, session => { session.allow_promotion_codes = false; }, session => { session.line_items.data[0].quantity = 2; }, session => { session.livemode = true; }, session => { session.automatic_tax.enabled = true; }]) {
      const previous = [...checkoutByKey.values()].find(session => session.status === 'open');
      alter(previous);
      const replacement = await service.createSubscriptionCheckout(first, stripe);
      assert.notEqual(replacement, previous.url);
      assert.equal(previous.status, 'expired');
    }
    assert.equal(calls.expired.length, 5, 'obsolete checkout sessions are expired, never reused');
    const ownSession = [...checkoutByKey.values()].find(session => session.status === 'open');
    ownSession.metadata.memberId = second.id;
    await assert.rejects(service.createSubscriptionCheckout(first, stripe), /correspond pas/);
    assert.equal(calls.expired.length, 5, 'foreign checkout must never be expired');
    ownSession.metadata.memberId = first.id;

    currentSubscription = { id: 'sub_fixtureA', object: 'subscription', metadata: { application: 'la-redaction', memberId: first.id }, customer: 'cus_fixtureA', status: 'active', livemode: false, automatic_tax: { enabled: false }, cancel_at_period_end: false, items: { has_more: false, data: [{ price: structuredClone(monthlyPrice), quantity: 1, current_period_end: Math.floor(Date.now() / 1000) + 3600 }] } };
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
    assert.equal(await service.synchronizeStripeEvent({ ...event, id: 'evt_price_other', created: 101 }, stripe), 'processed');
    assert.equal(await billing.hasWorkspaceAccess(first), false, 'wrong price removes paid access');
    currentSubscription.items.data[0].price.id = 'price_fixture';
    await service.synchronizeStripeEvent({ ...event, id: 'evt_price_restored', created: 102 }, stripe);
    assert.equal(await billing.hasWorkspaceAccess(first), true);
    currentSubscription.items.data[0].quantity = 2;
    await service.synchronizeStripeEvent({ ...event, id: 'evt_quantity', created: 103 }, stripe);
    assert.equal(await billing.hasWorkspaceAccess(first), false);
    currentSubscription.items.data[0].quantity = 1;
    currentSubscription.status = 'canceled';
    await service.synchronizeStripeEvent({ ...event, id: 'evt_canceled', created: 104 }, stripe);
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
    console.log('Stripe: strict EUR590 monthly inclusive price/product/mode validation, obsolete checkout expiration, quantity and entitlement checks, duplicate checkout idempotency, inactive-before-webhook, per-account portal, signatures/raw body/timestamp, replay, mode, cross-account and cancellation passed (isolated SQLite and Stripe SDK HMAC; zero network/payment calls).');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
