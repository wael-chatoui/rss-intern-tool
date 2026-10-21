import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOwner } from '@/lib/auth-store';
import { ActivationForm } from '@/components/Auth/ActivationForm';

export const metadata: Metadata = { title: 'Activer mon espace | La Rédaction', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function Activation() {
  if (await getOwner()) redirect('/connexion');
  return <ActivationForm />;
}
