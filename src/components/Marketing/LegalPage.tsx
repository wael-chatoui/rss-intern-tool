import Link from 'next/link';
import type { ReactNode } from 'react';
import './legal.css';

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return <main className="legal-page"><Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">r.</span><span className="brand-name">La Rédaction</span></Link><h1>{title}</h1><p className="legal-date">Mise à jour : 22 octobre 2026</p><div className="legal-content">{children}</div><footer><Link href="/">Accueil</Link><Link href="/mentions-legales">Mentions légales</Link><Link href="/conditions">Conditions d’utilisation</Link><Link href="/confidentialite">Confidentialité</Link></footer></main>;
}
