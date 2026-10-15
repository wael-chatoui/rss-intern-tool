import { LandingPage } from '@/components/Marketing/LandingPage';
import { getCurrentOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  return <LandingPage signedIn={!!await getCurrentOwner()} />;
}
