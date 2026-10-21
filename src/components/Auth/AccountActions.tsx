'use client';

import { useState } from 'react';
import { ArrowUpRight, LoaderCircle, LogOut } from 'lucide-react';

export function AccountActions({ active, hasCustomer, billingEnabled }: { active: boolean; hasCustomer: boolean; billingEnabled: boolean }) {
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  async function billing(action: 'checkout' | 'portal') {
    if (pending) return;
    setPending(action); setError('');
    try {
      const response = await fetch(`/api/billing/${action}`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Le paiement est indisponible. Réessayez.');
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)) throw new Error('Le lien de paiement est invalide. Réessayez.');
      window.location.assign(url.href);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible de joindre le service de paiement.'); setPending(''); }
  }
  async function logout() {
    if (pending) return;
    setPending('logout');setError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('La déconnexion a échoué. Réessayez.');
      window.location.replace('/connexion');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'La déconnexion a échoué.');setPending(''); }
  }
  return <div className="account-actions">
    {!active && billingEnabled && <button className="btn btn-primary" onClick={() => void billing('checkout')} disabled={!!pending}>{pending === 'checkout' ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <ArrowUpRight aria-hidden="true" />}Choisir mon abonnement</button>}
    {hasCustomer && billingEnabled && <button className="btn btn-secondary" onClick={() => void billing('portal')} disabled={!!pending}>Gérer mon abonnement et mes factures</button>}
    {!billingEnabled && <p className="auth-notice">Les abonnements ouvriront après la vérification du paiement. Votre compte est créé.</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    <button className="btn btn-ghost" onClick={() => void logout()} disabled={!!pending}><LogOut aria-hidden="true" />Se déconnecter</button>
  </div>;
}
