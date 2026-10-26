import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentOwner } from '@/lib/auth';
import { RegistrationForm } from '@/components/Auth/RegistrationForm';

export const metadata: Metadata = { title: 'Créer mon espace privé | La Rédaction', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function Registration() {
  if (await getCurrentOwner()) redirect('/compte');
  if (process.env.PUBLIC_SIGNUP_ENABLED !== '1') return <main className="auth-main auth-activation"><div className="auth-form-wrap"><h1>Les inscriptions ouvriront prochainement.</h1><p>La Rédaction prépare ses espaces privés.</p><Link href="/">Revenir à l’accueil</Link></div></main>;
  return <RegistrationForm />;
}
