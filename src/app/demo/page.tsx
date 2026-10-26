import type { Metadata } from 'next';
import { DemoWorkspace } from '@/components/Marketing/DemoWorkspace';

export const metadata: Metadata = { title: 'Essayer sans compte | La Rédaction', description: 'Essayez une source, une note et le planning de La Rédaction. Démonstration interactive fictive sans inscription.', alternates: { canonical: '/demo' } };
export const dynamic = 'force-dynamic';
export default function Demo() { return <DemoWorkspace signupEnabled={process.env.PUBLIC_SIGNUP_ENABLED === '1'} />; }
