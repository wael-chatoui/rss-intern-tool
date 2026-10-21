import Stripe from 'stripe';

export class BillingError extends Error {
  constructor(message: string, public status = 503) { super(message); this.name = 'BillingError'; }
}

export function billingConfiguration() {
  const mode = process.env.STRIPE_MODE || 'test';
  const secret = process.env.STRIPE_SECRET_KEY || '';
  const price = process.env.STRIPE_PRICE_MONTHLY || '';
  const base = process.env.APP_BASE_URL || process.env.AUTH_ORIGIN || '';
  if (!['test', 'live'].includes(mode) || !secret.startsWith(`sk_${mode}_`) || !/^price_[A-Za-z0-9]+$/.test(price)) throw new BillingError('Les abonnements sont temporairement indisponibles. Réessayez plus tard.');
  let url: URL;
  try { url = new URL(base); } catch { throw new BillingError('Le service de paiement doit être configuré.'); }
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password || (url.protocol !== 'https:' && !(mode === 'test' && url.hostname === 'localhost'))) throw new BillingError('Le service de paiement doit être configuré.');
  return { mode, secret, price, origin: url.origin, enabled: process.env.BILLING_ENABLED === '1' };
}

export function stripeClient() {
  const config = billingConfiguration();
  return new Stripe(config.secret, { maxNetworkRetries: 2, timeout: 15_000 });
}
