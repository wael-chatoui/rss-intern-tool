import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentOwner } from '@/lib/auth';

export const metadata: Metadata = { title: 'Mon espace | La Rédaction', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentOwner();
  if (!user) redirect('/connexion');
  return children;
}
