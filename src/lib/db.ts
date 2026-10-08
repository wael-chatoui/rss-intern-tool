import fs from 'fs/promises';
import path from 'path';
import { DatabaseSchema, FeedSource, SocialPost, RSSArticle } from '@/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export const DEFAULT_FEEDS: FeedSource[] = [
  {
    id: 'vogue-fr',
    name: 'Vogue France',
    url: 'https://www.vogue.fr/feed/rss',
    category: 'haute-couture',
    language: 'fr',
    website: 'https://www.vogue.fr',
    enabled: true,
  },
  {
    id: 'fashionnetwork-fr',
    name: 'FashionNetwork (France)',
    url: 'https://fr.fashionnetwork.com/rss/news/',
    category: 'business',
    language: 'fr',
    website: 'https://fr.fashionnetwork.com',
    enabled: true,
  },
  {
    id: 'elle-fr',
    name: 'ELLE Mode',
    url: 'https://www.elle.fr/Mode/rss',
    category: 'trends',
    language: 'fr',
    website: 'https://www.elle.fr',
    enabled: true,
  },
  {
    id: 'madame-figaro',
    name: 'Madame Figaro Mode',
    url: 'https://madame.lefigaro.fr/mode/feed',
    category: 'haute-couture',
    language: 'fr',
    website: 'https://madame.lefigaro.fr',
    enabled: true,
  },
  {
    id: 'bof',
    name: 'The Business of Fashion',
    url: 'https://www.businessoffashion.com/arc/outboundfeeds/rss/',
    category: 'business',
    language: 'en',
    website: 'https://www.businessoffashion.com',
    enabled: true,
  },
  {
    id: 'hypebeast',
    name: 'Hypebeast',
    url: 'https://hypebeast.com/feed',
    category: 'streetwear',
    language: 'en',
    website: 'https://hypebeast.com',
    enabled: true,
  },
  {
    id: 'highsnobiety',
    name: 'Highsnobiety',
    url: 'https://www.highsnobiety.com/feed/',
    category: 'streetwear',
    language: 'en',
    website: 'https://www.highsnobiety.com',
    enabled: true,
  },
  {
    id: 'fashionista',
    name: 'Fashionista',
    url: 'https://fashionista.com/.rss/full/',
    category: 'trends',
    language: 'en',
    website: 'https://fashionista.com',
    enabled: true,
  },
  {
    id: 'vogue-us',
    name: 'Vogue US',
    url: 'https://www.vogue.com/feed/rss',
    category: 'haute-couture',
    language: 'en',
    website: 'https://www.vogue.com',
    enabled: true,
  },
  {
    id: 'dazed-fashion',
    name: 'Dazed Fashion',
    url: 'https://www.dazeddigital.com/rss/fashion',
    category: 'trends',
    language: 'en',
    website: 'https://www.dazeddigital.com',
    enabled: true,
  },
];

const INITIAL_DB: DatabaseSchema = {
  feeds: DEFAULT_FEEDS,
  savedArticles: [],
  posts: [
    {
      id: 'demo-post-1',
      angle: 'Analyse de la dernière Fashion Week Paris : le retour au tailoring minimaliste',
      tags: ['ParisFashionWeek', 'Tailoring', 'LuxuryTrends'],
      status: 'ready',
      scheduledDate: new Date().toISOString().split('T')[0],
      scheduledTime: '18:30',
      platforms: ['tiktok', 'instagram', 'linkedin'],
      sourceArticleTitle: 'Paris Fashion Week: The Power of Understated Luxury',
      sourceArticleFeed: 'Vogue France',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      content: {
        tiktok: {
          hook: 'Pourquoi toutes les maisons de luxe abandonnent la logomania en 2026 ? 👀👗',
          script: `[0:00 - 0:03] Hook visuel sur défilé Saint Laurent : "Le logo géant, c'est officiellement fini."
[0:03 - 0:15] Explication : Au lieu des monogrammes tape-à-l'œil, les directeurs artistiques misent tout sur la coupe et les lainages d'exception.
[0:15 - 0:30] Exemple : Balenciaga et The Row redéfinissent la silhouette avec des épaules franches et des coupes intemporelles.
[0:30 - 0:45] Question CTA : Vous préférez le retour au chic discret ou l'ère extravagante vous manque ? Dites-le en commentaire !`,
          visualNotes: 'B-rolls rapides de défilés, fond sonore discret Lo-Fi Fashion.',
          durationEstimate: '45s',
        },
        instagram: {
          caption: `La fin annoncée de la logomania : décryptage d'un tournant majeur sur les podiums parisiens. ✨

Après des années dominées par les monogrammes omniprésents, les collections récentes confirment une tendance de fond : l'ultra-sobriété architecturale.

1️⃣ Des coupes tailleur impeccables
2️⃣ Une palette axée sur les terres cuites, gris perle et noir d'encre
3️⃣ La valorisation du savoir-faire textile plutôt que du branding ostentatoire

Glissez pour découvrir les silhouettes clés qui marqueront la saison ➡️

#FashionWeek #ParisFashionWeek #QuietLuxury #FashionTrends #Mode2026 #HauteCouture`,
          carouselSlides: [
            'Slide 1 : Titre "Pourquoi le logo s\'efface en 2026"',
            'Slide 2 : Zoom sur les coupes tailleur structurées',
            'Slide 3 : Les 3 matières nobles reines des défilés',
            'Slide 4 : Synthèse et question pour votre garde-robe',
          ],
          hashtags: ['#FashionWeek', '#ParisFashionWeek', '#QuietLuxury', '#FashionAnalysis', '#Mode2026'],
        },
        linkedin: {
          title: 'Stratégie de marque : Pourquoi le luxe mise sur la discrétion',
          body: `À l'heure où les consommateurs de produits de luxe recherchent authenticité et pérennité, la stratégie des grandes maisons s'adapte radicalement.

La transition vers ce que certains appellent le "quiet luxury" ne relève pas d'une simple esthétique passagère, mais d'une réponse économique réfléchie :
- Préservation de la valeur perçue à long terme
- Résilience face aux cycles éphémères de la fast-fashion
- Réalignement avec les valeurs d'héritage et d'artisanat d'art

Les départements presse et communication doivent désormais pivoter : valoriser la genèse des pièces, l'histoire des ateliers et la traçabilité plutôt que le simple buzz viral.`,
          keyTakeaways: [
            'Pérennité du vêtement contre obsolescence des micro-tendances',
            'Storytelling axé sur l\'atelier et la traçabilité',
            'Stratégie de communication moins bruyante, plus affinitaire',
          ],
        },
      },
    },
  ],
};

async function ensureDataFile(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      await fs.access(DB_FILE);
    } catch {
      await fs.writeFile(DB_FILE, JSON.stringify(INITIAL_DB, null, 2), 'utf-8');
    }
  } catch (error) {
    console.error('Error ensuring data file:', error);
  }
}

export async function getDb(): Promise<DatabaseSchema> {
  await ensureDataFile();
  try {
    const raw = await fs.readFile(DB_FILE, 'utf-8');
    const data = JSON.parse(raw) as DatabaseSchema;
    if (!data.feeds || data.feeds.length === 0) {
      data.feeds = DEFAULT_FEEDS;
    }
    return data;
  } catch {
    return INITIAL_DB;
  }
}

export async function saveDb(data: DatabaseSchema): Promise<void> {
  await ensureDataFile();
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}
