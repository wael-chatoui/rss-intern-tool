import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { DatabaseSchema, FeedSource } from '@/types';
import { FEED_URL_REPLACEMENTS } from '@/lib/feed-catalog';
import { inDurableTransaction, readDurableDocument, usesDurableStorage, writeDurableDocument } from '@/lib/durable-store';
import { currentWorkspaceId, editorialDocumentId, inWorkspace } from '@/lib/workspace-context';

export const DATA_DIR = process.env.RSS_DATA_DIR ? path.resolve(process.env.RSS_DATA_DIR) : path.join(process.cwd(), 'data');
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
    url: 'https://fr.fashionnetwork.com/rss/feed/fr,0.xml',
    category: 'business',
    language: 'fr',
    website: 'https://fr.fashionnetwork.com',
    enabled: true,
  },
  {
    id: 'elle-fr',
    name: 'ELLE Mode',
    url: 'https://www.elle.fr/var/plain_site/storage/flux_rss/fluxMode.xml',
    category: 'trends',
    language: 'fr',
    website: 'https://www.elle.fr',
    enabled: true,
  },
  {
    id: 'madame-figaro',
    name: 'Madame Figaro Mode',
    url: 'https://www.lefigaro.fr/rss/madame_style.xml',
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
    name: 'Dazed (mode & culture)',
    url: 'https://www.dazeddigital.com/rss',
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

// Share the queue across route bundles and development hot reloads in this process.
const databaseGlobal = globalThis as typeof globalThis & {
  __rssPressDatabaseQueue?: Promise<void>;
};

function serializeDatabaseOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = (databaseGlobal.__rssPressDatabaseQueue || Promise.resolve()).then(operation);
  databaseGlobal.__rssPressDatabaseQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function writeDatabaseFile(data: DatabaseSchema): Promise<void> {
  if (usesDurableStorage()) return writeDurableDocument(await editorialDocumentId(), JSON.stringify(data));
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temporaryFile = path.join(DATA_DIR, `.db-${process.pid}-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporaryFile, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
    await fs.rename(temporaryFile, DB_FILE);
  } finally {
    await fs.rm(temporaryFile, { force: true });
  }
}

async function readDatabaseFile(): Promise<DatabaseSchema> {
  try {
    const durable = usesDurableStorage();
    const documentId = durable ? await editorialDocumentId() : '';
    const raw = durable ? await readDurableDocument(documentId) : await fs.readFile(DB_FILE, 'utf-8');
    if (raw === null) {
      if (documentId.startsWith('editorial:member_')) return { feeds: [], posts: [], savedArticles: [] };
      // The remote store is initialized deliberately by the migration command.
      // Never replace a missing or misconfigured production DB with demo data.
      throw new Error('L’espace éditorial doit être initialisé avant utilisation.');
    }
    const data = JSON.parse(raw) as DatabaseSchema;
    // An empty source list is an intentional user choice.
    if (!Array.isArray(data.feeds)) data.feeds = structuredClone(DEFAULT_FEEDS);
    // Migrate only obsolete built-in addresses, without writing during reads.
    // Custom URLs, disabled sources and user metadata remain intact.
    data.feeds = data.feeds.map(feed => {
      const replacement = FEED_URL_REPLACEMENTS.find(item => item.feedId === feed.id && item.oldUrl === feed.url);
      if (!replacement) return feed;
      return {
        ...feed, url: replacement.url,
        name: feed.id === 'dazed-fashion' && feed.name === 'Dazed Fashion' ? 'Dazed (mode & culture)' : feed.name,
      };
    });
    if (!Array.isArray(data.savedArticles)) data.savedArticles = [];
    if (!Array.isArray(data.posts)) data.posts = [];
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const data = structuredClone(INITIAL_DB);
    await writeDatabaseFile(data);
    return data;
  }
}

export function getDb(): Promise<DatabaseSchema> {
  return serializeDatabaseOperation(readDatabaseFile);
}

/** Apply a mutation to the latest database under the shared process lock. */
export async function updateDb<T>(mutate: (database: DatabaseSchema) => T | Promise<T>): Promise<T> {
  // Resolve the session before entering the editorial write transaction. Session
  // lookup has its own auth transaction and must never nest behind another lock.
  const workspace = usesDurableStorage() ? await currentWorkspaceId() : 'owner';
  const operation = async () => {
    const database = await readDatabaseFile();
    const result = await mutate(database);
    await writeDatabaseFile(database);
    return result;
  };
  return serializeDatabaseOperation(() => inWorkspace(workspace, () => usesDurableStorage() ? inDurableTransaction(operation) : operation()));
}
