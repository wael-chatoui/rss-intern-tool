import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fashion Press & Social Cockpit | Veille RSS & Studio',
  description: 'Cockpit éditorial pour la veille fashion et la rédaction de contenus TikTok, Instagram & LinkedIn.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
