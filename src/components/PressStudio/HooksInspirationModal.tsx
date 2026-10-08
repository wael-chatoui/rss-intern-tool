'use client';

import React, { useState } from 'react';
import { X, Copy, Check, Plus, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface FashionHookItem {
  id: string;
  category: 'runway' | 'business' | 'streetwear' | 'archives';
  categoryLabel: string;
  title: string;
  template: string;
  example: string;
  triggerType: string;
  suggestedPlatforms: ('tiktok' | 'instagram' | 'linkedin')[];
}

export const FASHION_HOOKS_LIBRARY: FashionHookItem[] = [
  // 1. DÉFILÉS & RUNWAY
  {
    id: 'runway-hidden-detail',
    category: 'runway',
    categoryLabel: 'Défilés & Runway',
    title: 'Le détail invisible',
    template: 'Vous avez raté le détail le plus important du défilé [Marque/Créateur], et pourtant il change absolument tout.',
    example: 'Vous avez raté le détail le plus important du défilé Maison Margiela Artisanal, et pourtant il change absolument tout au maquillage moderne.',
    triggerType: 'Curiosité & Insider',
    suggestedPlatforms: ['tiktok', 'instagram'],
  },
  {
    id: 'runway-contrarian-review',
    category: 'runway',
    categoryLabel: 'Défilés & Runway',
    title: 'Le contre-pied de la critique',
    template: 'Tout le monde encense le dernier défilé de [Marque], mais personne ne parle de ce problème majeur.',
    example: 'Tout le monde encense le défilé Croisière de Gucci, mais personne ne parle de ce problème majeur de cohérence avec l\'héritage de la maison.',
    triggerType: 'Controverse & Nuance critique',
    suggestedPlatforms: ['tiktok', 'linkedin'],
  },
  {
    id: 'runway-trend-forecast',
    category: 'runway',
    categoryLabel: 'Défilés & Runway',
    title: 'La prédiction de silhouette',
    template: 'Cette silhouette vue sur le podium de [Créateur] va remplacer [Tendance actuelle] d\'ici 6 mois.',
    example: 'Cette silhouette taille ultra-basse vue chez Miu Miu va remplacer le pantalon cargo oversized d\'ici cet automne.',
    triggerType: 'Avant-garde & Tendance',
    suggestedPlatforms: ['tiktok', 'instagram'],
  },
  {
    id: 'runway-archive-parallel',
    category: 'runway',
    categoryLabel: 'Défilés & Runway',
    title: 'L\'archive secrète',
    template: 'Ce look qui a enflammé les réseaux chez [Marque] n\'a rien de nouveau : voici le défilé de [Année] d\'où il provient réellement.',
    example: 'Ce look bustier chez Balmain n\'a rien de nouveau : voici le défilé Mugler de 1995 d\'où il provient réellement.',
    triggerType: 'Érudition & Histoire de la mode',
    suggestedPlatforms: ['tiktok', 'instagram'],
  },
  {
    id: 'runway-creative-direction',
    category: 'runway',
    categoryLabel: 'Défilés & Runway',
    title: 'Le baptême du nouveau DA',
    template: 'Première collection de [Nouveau DA] chez [Maison] : coup de génie ou début de la crise créative ?',
    example: 'Première collection de Chemena Kamali chez Chloé : coup de génie bohème ou simple nostalgie des années 2000 ?',
    triggerType: 'Tension & Jugement de style',
    suggestedPlatforms: ['tiktok', 'linkedin', 'instagram'],
  },

  // 2. BUSINESS DU LUXE & ÉCONOMIE
  {
    id: 'business-price-breakdown',
    category: 'business',
    categoryLabel: 'Business du Luxe',
    title: 'Déconstruction du prix boutique',
    template: 'Ce sac [Marque] coûte [Prix]€ en boutique. Mais voici combien il coûte réellement à produire.',
    example: 'Ce sac cabas en toile coûte 1 850€ en boutique. Mais voici le coût réel des matières et de la confection en Italie.',
    triggerType: 'Révélation financière',
    suggestedPlatforms: ['tiktok', 'linkedin'],
  },
  {
    id: 'business-da-turnover',
    category: 'business',
    categoryLabel: 'Business du Luxe',
    title: 'La valse des DA',
    template: 'Pourquoi les Maisons de luxe virent leurs Directeurs Artistiques tous les 2 ans ? La réponse n\'est pas créative, elle est financière.',
    example: 'Pourquoi les Maisons de luxe changent de DA après seulement 4 saisons ? Voici ce que les chiffres de vente du Q3 exigent en coulisses.',
    triggerType: 'Analyse stratégique B2B',
    suggestedPlatforms: ['linkedin', 'tiktok'],
  },
  {
    id: 'business-luxury-inflation',
    category: 'business',
    categoryLabel: 'Business du Luxe',
    title: 'La fin de l\'accessibilité',
    template: '[Maison de luxe] vient d\'augmenter ses prix de [Pourcentage]% pour une seule raison : faire fuir la classe moyenne.',
    example: 'Chanel vient d\'augmenter son sac Classique à plus de 10 000€ pour une seule raison : cibler exclusivement le sommet de la pyramide.',
    triggerType: 'Sociologie & Rareté',
    suggestedPlatforms: ['linkedin', 'tiktok', 'instagram'],
  },
  {
    id: 'business-collab-flop',
    category: 'business',
    categoryLabel: 'Business du Luxe',
    title: 'Le flop commercial silencieux',
    template: 'Le buzz était monumental, mais en boutique, cette collab [Marque A x Marque B] est un désastre commercial. Voici les chiffres.',
    example: 'Tout le monde en parlait sur TikTok, mais en boutique, cette collection capsule est bradée en privé. Décryptage.',
    triggerType: 'Réalité économique vs Hype',
    suggestedPlatforms: ['linkedin', 'tiktok'],
  },
  {
    id: 'business-resale-value',
    category: 'business',
    categoryLabel: 'Business du Luxe',
    title: 'La décote à la revente',
    template: 'Si vous achetez cette pièce de luxe aujourd\'hui, vous perdez [Pourcentage]% de sa valeur dès la sortie du magasin.',
    example: 'Pourquoi les sacs de cette maison perdent 40% sur le marché de la seconde main dès le premier mois.',
    triggerType: 'Conseil investissement',
    suggestedPlatforms: ['tiktok', 'instagram', 'linkedin'],
  },

  // 3. TENDANCES, STREETWEAR & POP CULTURE
  {
    id: 'trends-styling-mistake',
    category: 'streetwear',
    categoryLabel: 'Tendances & Streetwear',
    title: 'L\'erreur de proportion',
    template: 'Arrêtez d\'associer [Pièce A] avec [Pièce B] : voici la règle de proportion que la mode a changée cette saison.',
    example: 'Arrêtez d\'associer vos sneakers massives avec des pantalons skinny : voici comment rééquilibrer votre silhouette en 2026.',
    triggerType: 'Conseil stylistique pragmatique',
    suggestedPlatforms: ['tiktok', 'instagram'],
  },
  {
    id: 'trends-microtrend-anatomy',
    category: 'streetwear',
    categoryLabel: 'Tendances & Streetwear',
    title: 'L\'anatomie d\'une micro-tendance',
    template: 'D\'où sort vraiment l\'esthétique [Nom de la tendance] et pourquoi elle va disparaître dans 3 semaines ?',
    example: 'D\'où sort vraiment l\'esthétique "Mob Wife" et pourquoi le cycle de vie des micro-trends TikTok est devenu insoutenable ?',
    triggerType: 'Vulgarisation sociologique',
    suggestedPlatforms: ['tiktok', 'instagram'],
  },
  {
    id: 'trends-ugly-fashion-comeback',
    category: 'streetwear',
    categoryLabel: 'Tendances & Streetwear',
    title: 'Le retour de la pièce bannie',
    template: 'Cette pièce que tout le monde trouvait ridicule il y a 5 ans est en train de devenir la pièce la plus désirable de l\'année.',
    example: 'Cette chaussure de randonnée que tout le monde détestait est désormais sur tous les moodboards de la Fashion Week.',
    triggerType: 'Ironie du cycle de style',
    suggestedPlatforms: ['tiktok', 'instagram'],
  },
  {
    id: 'trends-runway-to-real-life',
    category: 'streetwear',
    categoryLabel: 'Tendances & Streetwear',
    title: 'Runway to Real Life',
    template: 'Comment porter la tendance [Nom de la tendance] sans avoir l\'air déguisé ni dépenser un smic ?',
    example: 'Comment adopter le tailoring oversize des défilés sans flotter dans son costume au bureau ?',
    triggerType: 'Prêt-à-porter & Accessibilité',
    suggestedPlatforms: ['tiktok', 'instagram'],
  },
  {
    id: 'trends-pop-culture-boost',
    category: 'streetwear',
    categoryLabel: 'Tendances & Streetwear',
    title: 'L\'effet Pop-Culture & Red Carpet',
    template: 'Comment [Célébrité/Série] a réussi à relancer à elle seule les ventes de [Pièce/Marque oubliée].',
    example: 'Comment Zendaya et son styliste Law Roach ont transformé une simple tournée promo en musée de la mode vivante.',
    triggerType: 'Hype & Storytelling',
    suggestedPlatforms: ['tiktok', 'instagram'],
  },

  // 4. CONTROVERSES & ARCHIVES
  {
    id: 'archives-backstage-drama',
    category: 'archives',
    categoryLabel: 'Controverses & Archives',
    title: 'Le drame backstage méconnu',
    template: 'Ce que vous avez vu sur le podium n\'était rien comparé au chaos qui s\'est déroulé 10 minutes avant en coulisses chez [Marque].',
    example: 'Le mannequin qui refuse de défiler, le vêtement cousu à même la peau : les 10 minutes de panique avant le show Galliano 1994.',
    triggerType: 'Coulisses & Suspense historique',
    suggestedPlatforms: ['tiktok', 'instagram'],
  },
  {
    id: 'archives-plagiarism-or-tribute',
    category: 'archives',
    categoryLabel: 'Controverses & Archives',
    title: 'Inspiration ou plagiat pur ?',
    template: 'Hommage inspiré ou copie conforme ? L\'histoire trouble derrière cette pièce culte de [Marque].',
    example: 'Pourquoi ce jeune designer indépendant accuse cette maison de l\'avenue Montaigne d\'avoir copié son portfolio d\'école.',
    triggerType: 'Éthique & Enquête',
    suggestedPlatforms: ['tiktok', 'instagram', 'linkedin'],
  },
  {
    id: 'archives-censored-runway',
    category: 'archives',
    categoryLabel: 'Controverses & Archives',
    title: 'Le défilé qui a failli être censuré',
    template: 'En [Année], ce défilé a failli détruire la carrière de [Créateur/Marque]. Retour sur le show le plus choquant de l\'histoire.',
    example: 'En 1995, le défilé "Highland Rape" d\'Alexander McQueen a failli être censuré : voici pourquoi il est aujourd\'hui classé au rang de chef-d\'œuvre.',
    triggerType: 'Histoire & Mythologie mode',
    suggestedPlatforms: ['tiktok', 'instagram'],
  },
  {
    id: 'archives-greenwashing-check',
    category: 'archives',
    categoryLabel: 'Controverses & Archives',
    title: 'Le test du Greenwashing',
    template: '[Marque] affirme que cette collection est 100% éco-responsable. On a épluché les étiquettes, et voici le vrai problème.',
    example: 'Derrière la mention "polyester recyclé", voici ce que l\'industrie du fast-luxury préfère ne pas mentionner sur l\'analyse de cycle de vie.',
    triggerType: 'Investigation & Responsabilité',
    suggestedPlatforms: ['linkedin', 'tiktok'],
  },
  {
    id: 'archives-luxury-waitlist-game',
    category: 'archives',
    categoryLabel: 'Controverses & Archives',
    title: 'La mécanique de la liste d\'attente',
    template: 'Même avec 30 000€ sur votre compte, vous ne pouvez pas acheter ce sac chez [Marque] : voici leur technique psychologique secrète.',
    example: 'Le "jeu" imposé par les vendeurs pour avoir le droit d\'acheter un sac Birkin chez Hermès décrypté par un ancien employé.',
    triggerType: 'Psychologie du luxe & Exclusivité',
    suggestedPlatforms: ['tiktok', 'instagram', 'linkedin'],
  },
];

interface HooksInspirationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyHook?: (hook: string) => void;
  onSelectHook?: (hook: string) => void;
}

export const HooksInspirationModal: React.FC<HooksInspirationModalProps> = ({
  isOpen,
  onClose,
  onApplyHook,
  onSelectHook,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const applyHook = (hook: string) => {
    if (onSelectHook) onSelectHook(hook);
    if (onApplyHook) onApplyHook(hook);
  };

  if (!isOpen) return null;

  const filteredHooks = selectedCategory === 'all'
    ? FASHION_HOOKS_LIBRARY
    : FASHION_HOOKS_LIBRARY.filter(h => h.category === selectedCategory);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-lg w-full max-w-2xl overflow-hidden shadow-lg flex flex-col max-h-[85vh] animate-modal-pop relative text-card-foreground"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Bibliothèque de Hooks ({FASHION_HOOKS_LIBRARY.length})
              </h2>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Categories Bar */}
        <div className="px-5 py-2 border-b border-border bg-card/60 flex items-center gap-1.5 overflow-x-auto shrink-0">
          {[
            { id: 'all', label: 'Toutes' },
            { id: 'runway', label: 'Défilés & Runway' },
            { id: 'business', label: 'Business Luxe' },
            { id: 'streetwear', label: 'Streetwear' },
            { id: 'archives', label: 'Archives' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-secondary text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Hooks List */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1 divide-y divide-border">
          {filteredHooks.map((h) => (
            <div key={h.id} className="pt-3 first:pt-0 space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">
                      {h.categoryLabel}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {h.title}
                    </span>
                  </div>

                  <h4 className="text-xs font-medium text-foreground leading-snug">
                    "{h.template}"
                  </h4>

                  <p className="text-[11px] text-muted-foreground italic">
                    Exemple: « {h.example} »
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopy(h.template, h.id)}
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    title="Copier"
                  >
                    {copiedId === h.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      applyHook(h.template);
                      onClose();
                    }}
                    className="h-7 px-2 text-xs font-normal gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Appliquer</span>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-border bg-card/60 flex justify-end shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs"
          >
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
};
