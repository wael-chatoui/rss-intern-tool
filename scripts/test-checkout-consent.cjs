const assert = require('node:assert/strict');
const createLoader = require('./load-typescript.cjs');

// Real route/configuration/Checkout handlers; in-memory storage and fake Stripe.
// No account, network request, secret, payment or historical consent is created.
async function main() {
  const origin = 'https://redaction.example.test';
  const environment = { STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'sk_test_isolated_consent_fixture', STRIPE_PRICE_MONTHLY: 'price_fixture', APP_BASE_URL: origin, AUTH_ORIGIN: origin, BILLING_ENABLED: '1', PUBLIC_SIGNUP_ENABLED: '0', BILLING_TERMS_URL: `${origin}/conditions`, BILLING_PRIVACY_URL: `${origin}/confidentialite` };
  Object.assign(process.env, environment);
  const restoreEnvironment = () => Object.assign(process.env, environment);
  const account = { id: 'member_00000000-0000-4000-8000-000000000001', name: 'Fictional member', email: 'member@example.test' };
  const token = 'a'.repeat(43);
  const documents = new Map(); const sessions = new Map();
  const calls = { price: 0, customer: 0, checkout: [], expired: [] };
  const stripeModule = createLoader()('src/lib/stripe.ts');
  const imports = {
    '@/lib/stripe': stripeModule,
    '@/lib/auth-store': { AUTH_COOKIE: 'redaction_session', getSession: async supplied => supplied === token ? account : null },
    '@/lib/billing-store': { billingMode: () => 'test', getAccountBilling: async () => ({ customerId: 'cus_fixtureConsent' }), hasWorkspaceAccess: async () => false },
    '@/lib/durable-store': { inDurableTransaction: callback => callback(), readDurableDocument: async id => documents.get(id) ?? null, writeDurableDocument: async (id, body) => documents.set(id, body) },
  };
  const stripe = {
    prices: { retrieve: async () => { calls.price++; return { active: true, livemode: false, currency: 'eur', unit_amount: 590, type: 'recurring', billing_scheme: 'per_unit', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' }, tax_behavior: 'inclusive', product: { active: true, metadata: { application: 'la-redaction' } } }; } },
    customers: { create: async () => { calls.customer++; throw new Error('Unexpected customer creation'); } },
    subscriptions: { list: async () => ({ data: [] }) },
    checkout: { sessions: {
      create: async (params, options) => {
        calls.checkout.push({ params, options });
        const session = { ...structuredClone(params), id: `cs_fixture_${calls.checkout.length}`, url: `https://checkout.stripe.com/c/pay/fixture${calls.checkout.length}`, status: 'open', livemode: false, line_items: { data: params.line_items.map(item => ({ quantity: item.quantity, price: { id: item.price } })), has_more: false } };
        sessions.set(session.id, session); return session;
      },
      retrieve: async id => sessions.get(id),
      expire: async id => { calls.expired.push(id); sessions.get(id).status = 'expired'; },
    } },
  };
  const service = createLoader(undefined, imports)('src/lib/stripe-billing.ts');
  const route = createLoader(undefined, { ...imports, '@/lib/stripe-billing': { createSubscriptionCheckout: user => service.createSubscriptionCheckout(user, stripe) } })('src/app/api/billing/checkout/route.ts');
  const request = (options = {}) => new Request(`${origin}/api/billing/checkout`, {
    method: 'POST', headers: { origin: options.origin || origin, ...(options.signedOut ? {} : { cookie: `redaction_session=${token}` }), 'Content-Type': 'application/json' }, body: JSON.stringify(options.body || {}),
  });

  assert.equal((await route.POST(request({ signedOut: true }))).status, 401);
  assert.equal((await route.POST(request({ origin: 'https://other.example.test' }))).status, 403);
  assert.equal(calls.price, 0);

  for (const variable of ['BILLING_TERMS_URL', 'BILLING_PRIVACY_URL']) {
    for (const invalid of ['', '/conditions', 'http://redaction.example.test/conditions', 'https://other.example.test/conditions', `${origin}/`, `https://name:password@redaction.example.test/conditions`, `${origin}/conditions?next=elsewhere`, `${origin}/conditions#section`, `${origin}/conditions)texte`, `${origin}/conditions avec espace`, `javascript:alert(1)`]) {
      restoreEnvironment(); process.env[variable] = invalid;
      assert.throws(() => stripeModule.checkoutConsentConfiguration(origin), /conditions de vente/);
      const response = await route.POST(request({ body: { [variable]: `${origin}/valid-from-client`, consent_collection: { terms_of_service: 'none' } } }));
      assert.equal(response.status, 503, `${variable}=${invalid}`);
      assert.match((await response.json()).error, /conditions de vente/);
    }
  }
  restoreEnvironment(); process.env.BILLING_TERMS_URL = `${origin}/${'a'.repeat(700)}`; process.env.BILLING_PRIVACY_URL = `${origin}/${'b'.repeat(700)}`;
  assert.equal((await route.POST(request())).status, 503, 'a legal message exceeding the documented Stripe limit fails locally');
  assert.equal(calls.price, 0, 'invalid legal configuration fails before the first provider call');
  assert.equal(calls.checkout.length, 0); assert.equal(calls.customer, 0); assert.equal(documents.size, 0);

  restoreEnvironment();
  const response = await route.POST(request({ body: { price: 'price_untrusted', consent_collection: { terms_of_service: 'none' }, terms_url: 'https://other.example.test' } }));
  assert.equal(response.status, 200); assert.match((await response.json()).url, /^https:\/\/checkout.stripe.com\//);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  const params = calls.checkout[0].params;
  assert.deepEqual(params.consent_collection, { terms_of_service: 'required' });
  assert.equal(params.line_items[0].price, 'price_fixture', 'browser parameters never choose the offer or consent policy');
  assert.equal(params.custom_text.terms_of_service_acceptance.message, stripeModule.checkoutConsentConfiguration(origin).message);
  assert.match(params.custom_text.terms_of_service_acceptance.message, /\[conditions de vente\]\(https:\/\/redaction\.example\.test\/conditions\)/);
  assert.match(params.custom_text.terms_of_service_acceptance.message, /\[politique de confidentialité\]\(https:\/\/redaction\.example\.test\/confidentialite\)/);
  assert.match(params.custom_text.terms_of_service_acceptance.message, /et j’ai pris connaissance de la \[politique de confidentialité\]/);
  assert.equal(params.terms_url, undefined); assert.equal(params.privacy_policy_url, undefined); assert.equal(params.consent, undefined, 'requesting consent must never invent an acceptance');
  assert.equal((await route.POST(request())).status, 200); assert.equal(calls.checkout.length, 1, 'a current session is reused');
  process.env.BILLING_TERMS_URL = `${origin}/conditions-v2`;
  assert.equal((await route.POST(request())).status, 200);
  assert.equal(calls.expired.length, 1, 'changing the legal URL expires the previous session');
  assert.notEqual(calls.checkout[0].options.idempotencyKey, calls.checkout[1].options.idempotencyKey);
  assert.match(calls.checkout[1].params.custom_text.terms_of_service_acceptance.message, /conditions-v2/);
  process.env.BILLING_PRIVACY_URL = `${origin}/confidentialite-v2`;
  assert.equal((await route.POST(request())).status, 200); assert.equal(calls.expired.length, 2);

  // Legal setup gates new purchases only. It cannot break an existing webhook or portal.
  delete process.env.BILLING_TERMS_URL; delete process.env.BILLING_PRIVACY_URL;
  assert.equal(stripeModule.billingConfiguration().origin, origin);
  assert.equal(stripeModule.billingConfiguration().enabled, true);
  restoreEnvironment(); process.env.BILLING_ENABLED = '0';
  const before = calls.price;
  assert.equal((await route.POST(request())).status, 503); assert.equal(calls.price, before);
  assert.equal(process.env.PUBLIC_SIGNUP_ENABLED, '0');
  console.log('Checkout consent: missing/unsafe/cross-origin legal URLs fail before provider calls, real route401/403/503/200, server-only required terms, supported Markdown links, obsolete-session expiry, idempotency and closed billing passed (in-memory fixtures, zero network/payment).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
