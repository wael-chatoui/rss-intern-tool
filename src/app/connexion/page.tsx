import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/Auth/LoginForm';
import { getCurrentOwner } from '@/lib/auth';
import { getOwner } from '@/lib/auth-store';

export const metadata: Metadata = { title: 'Connexion | La rédaction', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function Login({ searchParams }: { searchParams: { expired?: string } }) {
  if (await getCurrentOwner()) redirect('/espace');
  return <LoginForm configured={!!await getOwner()} expired={searchParams.expired === '1'} />;
}
