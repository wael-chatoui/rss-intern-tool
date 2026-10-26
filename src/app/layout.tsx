import type { Metadata } from 'next';
import './globals.css';
import { isPublicProduction, publicDescription, publicSiteUrl } from '@/lib/public-site';

export const metadata: Metadata = {
  title: 'La Rédaction | Veille, notes et presse indépendante',
  description: publicDescription,
  metadataBase: new URL(publicSiteUrl),
  robots: { index: isPublicProduction, follow: isPublicProduction },
  openGraph: {
    type: 'website', siteName: 'La Rédaction', locale: 'fr_FR',
    title: 'La Rédaction | De la veille à la rédaction', description: publicDescription,
    images: [{ url: '/images/newsroom-preview.jpg', width: 1440, height: 1000, alt: 'La Rédaction, aperçu de la veille RSS avec des données de démonstration' }],
  },
  twitter: { card: 'summary_large_image', title: 'La Rédaction | De la veille à la rédaction', description: publicDescription, images: ['/images/newsroom-preview.jpg'] },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
