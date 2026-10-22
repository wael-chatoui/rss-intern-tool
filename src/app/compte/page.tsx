import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentOwner } from '@/lib/auth';
import { getAccountBilling, hasWorkspaceAccess } from '@/lib/billing-store';
import { AccountActions } from '@/components/Auth/AccountActions';
import { AccountExport } from '@/components/Auth/AccountExport';
import '@/components/Auth/auth.css';

export const metadata: Metadata = { title: 'Mon compte | La Rédaction', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function Account({ searchParams }: { searchParams: Promise<{ retour?: string }> }) {
  const owner = await getCurrentOwner();
  if (!owner) redirect('/connexion');
  const billing = owner.id ? await getAccountBilling(owner.id) : null;
  const active = await hasWorkspaceAccess(owner);
  const previouslySubscribed = !!billing && billing.status !== 'none';
  const returned = (await searchParams).retour;
  return <main className="auth-main auth-activation">
    <Link className="auth-back" href="/">La Rédaction</Link>
    <div className="auth-form-wrap account-overview">
      <h1>Mon compte</h1><p>{owner.name}<br /><span className="auth-session-note">{owner.email}</span></p>
      {returned === 'succes' && !active && <p className="auth-notice" role="status">Le paiement est en cours de confirmation. Actualisez cette page dans quelques instants pour ouvrir votre espace.</p>}
      {returned === 'annulation' && <p className="auth-notice" role="status">Le paiement a été interrompu. Vous pouvez reprendre quand vous le souhaitez.</p>}
      <h2>{!owner.id ? 'Compte propriétaire' : active ? 'Abonnement actif' : billing?.status === 'canceled' ? 'Abonnement terminé' : previouslySubscribed ? 'Accès en lecture seule' : 'Votre espace attend son activation'}</h2>
      <p>{active ? 'Retrouvez vos sources, vos notes et votre planning.' : previouslySubscribed ? 'Votre abonnement ne permet plus d’écrire. Vos notes et articles restent consultables et téléchargeables.' : 'Choisissez votre abonnement pour commencer à travailler dans votre espace privé.'}</p>
      {active && billing?.cancelAtPeriodEnd && billing.currentPeriodEnd && <p>Votre abonnement prendra fin le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(new Date(billing.currentPeriodEnd * 1000))}.</p>}
      {active && <Link href="/espace" className="btn btn-primary">Ouvrir mon espace</Link>}
      {!active && <Link href="/espace" className="btn btn-secondary">Consulter mes données</Link>}
      <AccountActions active={active} hasCustomer={!!billing?.customerId} billingEnabled={process.env.BILLING_ENABLED === '1'} />
      <div className="account-data"><h2>Vos données</h2><p>Votre contenu reste privé. Vous pouvez le télécharger, y compris après la fin de votre abonnement. Les copies locales non enregistrées restent disponibles dans <Link href="/espace">votre espace</Link>.</p><AccountExport /></div>
    </div>
  </main>;
}
