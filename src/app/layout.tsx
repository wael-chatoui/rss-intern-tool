import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'La rédaction | Veille, notes et presse indépendante',
  description: 'Votre espace de veille RSS, de notes sourcées et de rédaction pour une presse indépendante.',
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
