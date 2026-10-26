import { LandingPage } from '@/components/Marketing/LandingPage';
import { getCurrentOwner } from '@/lib/auth';
import type { Metadata } from 'next';

export const metadata: Metadata = { alternates: { canonical: '/' } };

export const dynamic = 'force-dynamic';

export default async function Home() {
  return <LandingPage signedIn={!!await getCurrentOwner()} signupEnabled={process.env.PUBLIC_SIGNUP_ENABLED === '1'} billingEnabled={process.env.BILLING_ENABLED === '1'} />;
}
