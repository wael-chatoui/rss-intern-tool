import { redirect } from 'next/navigation';
import NewsroomApp from '@/components/Newsroom/NewsroomApp';
import { getCurrentOwner } from '@/lib/auth';
import { hasWorkspaceAccess } from '@/lib/billing-store';
import { getDb } from '@/lib/db';
import { ReadOnlyWorkspace } from '@/components/Newsroom/ReadOnlyWorkspace';

export default async function Workspace() {
  const owner = await getCurrentOwner();
  if (!owner) redirect('/connexion');
  if (!await hasWorkspaceAccess(owner)) return <ReadOnlyWorkspace database={await getDb()} draftStorageKey={`redaction:note-drafts:${owner.email}`} />;
  return <NewsroomApp owner={owner} />;
}
