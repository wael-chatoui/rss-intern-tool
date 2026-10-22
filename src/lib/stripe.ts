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

/** New Checkout sessions require reviewed public documents, never a guessed URL. */
export function checkoutConsentConfiguration(origin: string) {
  const unavailable = () => new BillingError('Les conditions de vente et la politique de confidentialité doivent être configurées avant tout paiement.');
  const legalUrl = (value: string | undefined) => {
    if (!value || value.length > 2000 || /[\s\u0000-\u001f\u007f]/u.test(value) || ['\\', '(', ')', '[', ']', '<', '>'].some(character => value.includes(character))) throw unavailable();
    let url: URL;
    try { url = new URL(value); } catch { throw unavailable(); }
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password || url.pathname === '/' || url.search || url.hash) throw unavailable();
    return url.href;
  };
  const termsUrl = legalUrl(process.env.BILLING_TERMS_URL);
  const privacyUrl = legalUrl(process.env.BILLING_PRIVACY_URL);
  const message = `J’accepte les [conditions de vente](${termsUrl}) et j’ai pris connaissance de la [politique de confidentialité](${privacyUrl}).`;
  if (message.length > 1200) throw unavailable();
  return { termsUrl, privacyUrl, message };
}

export function stripeClient() {
  const config = billingConfiguration();
  return new Stripe(config.secret, { maxNetworkRetries: 2, timeout: 15_000 });
}
