import { redirect } from 'next/navigation';
import NewsroomApp from '@/components/Newsroom/NewsroomApp';
import { getCurrentOwner } from '@/lib/auth';

export default async function Workspace() {
  const owner = await getCurrentOwner();
  if (!owner) redirect('/connexion');
  return <NewsroomApp owner={owner} />;
}
