import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentOwner } from '@/lib/auth';

export const metadata: Metadata = { title: 'Mon espace | La rédaction', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  if (!await getCurrentOwner()) redirect('/connexion');
  return children;
}
