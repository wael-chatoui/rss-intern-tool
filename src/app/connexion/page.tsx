import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/Auth/LoginForm';
import { getCurrentOwner } from '@/lib/auth';
import { getOwner } from '@/lib/auth-store';

export const metadata: Metadata = { title: 'Connexion | La Rédaction', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function Login({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  if (await getCurrentOwner()) redirect('/espace');
  return <LoginForm configured={!!await getOwner() || process.env.PUBLIC_SIGNUP_ENABLED === '1'} expired={(await searchParams).expired === '1'} signupEnabled={process.env.PUBLIC_SIGNUP_ENABLED === '1'} />;
}
