import { NextResponse } from 'next/server';
import { getDb, updateDb } from '@/lib/db';
import { createArticleId, fetchAllActiveFeeds } from '@/lib/rss';
import { DatabaseSchema, RSSArticle } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CACHE_TTL_MS = 10 * 60 * 1000;
const STABLE_ID_PATTERN = /^rss_[a-f0-9]{24}$/;

// Vercel's deployment filesystem is read-only. RSS caching must remain optional:
// an unavailable cache write must never discard successfully fetched articles.
interface RuntimeCache {
  feeds: string;
  articles: RSSArticle[];
  lastFetchedAt?: string;
  warnings: string[];
}
const cacheGlobal = globalThis as typeof globalThis & { __rssRuntimeCache?: RuntimeCache };
const TEMPORARY_CACHE_WARNING = 'Le cache RSS est temporaire sur cet hébergement.';
function feedSignature(feeds: DatabaseSchema['feeds']): string {
  return JSON.stringify(feeds.filter(feed => feed.enabled));
}
function isReadOnlyStorage(error: unknown): boolean {
  return ['EROFS', 'EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException)?.code || '');
}

async function saveRssCache(mutate: (latest: DatabaseSchema) => DatabaseSchema): Promise<{ database: DatabaseSchema; temporary: boolean }> {
  let pending: DatabaseSchema | undefined;
  try {
    const database = await updateDb(latest => {
      pending = mutate(latest);
      return pending;
    });
    return { database, temporary: false };
  } catch (error) {
    if (!pending || !isReadOnlyStorage(error)) throw error;
    return { database: pending, temporary: true };
  }
}

function articleIdentity(article: RSSArticle): string {
  return `${article.feedId}:${article.link || `${article.title}:${article.pubDate}`}`;
}

// Older IDs truncated the beginning of URLs, so unrelated articles shared an ID.
// Match saved copies to their cached counterpart by source and link during migration.
function normalizeStoredArticles(db: DatabaseSchema): boolean {
  let changed = false;
  const identityIds = new Map<string, string>();
  const oldIds = new Map<string, Set<string>>();
  const storedArticles = [...(db.cachedArticles || []), ...(db.savedArticles || [])];

  for (const article of storedArticles) {
    if (STABLE_ID_PATTERN.test(article.id)) {
      identityIds.set(articleIdentity(article), article.id);
    }
  }

  const normalize = (articles: RSSArticle[]) => {
    const normalized = articles.map(article => {
      const identity = articleIdentity(article);
      const id = identityIds.get(identity) || createArticleId(article.feedId, article.link || `${article.title}:${article.pubDate}`);
      identityIds.set(identity, id);
      const replacements = oldIds.get(article.id) || new Set<string>();
      replacements.add(id);
      oldIds.set(article.id, replacements);
      if (article.id !== id) changed = true;
      return { ...article, id };
    });
    const unique = Array.from(new Map(normalized.map(article => [article.id, article])).values());
    if (unique.length !== articles.length) changed = true;
    return unique;
  };

  db.cachedArticles = normalize(db.cachedArticles || []);
  db.savedArticles = normalize(db.savedArticles || []);
  const readIds = Array.from(new Set((db.readArticleIds || []).flatMap(id => {
    const replacements = oldIds.get(id);
    return replacements ? Array.from(replacements) : [id];
  })));
  if (JSON.stringify(readIds) !== JSON.stringify(db.readArticleIds || [])) changed = true;
  db.readArticleIds = readIds;

  const articles = [...db.cachedArticles, ...db.savedArticles];
  db.posts = (db.posts || []).map(post => {
    if (!post.sourceArticleLink) return post;
    const candidates = articles.filter(article =>
      article.link === post.sourceArticleLink &&
      (!post.sourceArticleFeed || article.feedName === post.sourceArticleFeed)
    );
    const matchingIds = new Set(candidates.map(article => article.id));
    if (matchingIds.size !== 1) return post;
    const articleId = candidates[0].id;
    if (post.articleId === articleId) return post;
    changed = true;
    return { ...post, articleId };
  });
  return changed;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const feedId = searchParams.get('feedId');
    const category = searchParams.get('category');
    const language = searchParams.get('language');
    const query = searchParams.get('q')?.trim().toLowerCase();
    const forceRefresh = searchParams.get('refresh') === 'true';

    let db = await getDb();
    const runtimeCache = cacheGlobal.__rssRuntimeCache;
    const useRuntimeCache = runtimeCache?.feeds === feedSignature(db.feeds);
    if (useRuntimeCache && runtimeCache) {
      db.cachedArticles = runtimeCache.articles;
      db.lastFetchedAt = runtimeCache.lastFetchedAt;
    }
    let needsSave = normalizeStoredArticles(db);
    let targetFeeds = db.feeds.filter(feed => feed.enabled);
    const activeFeedIds = new Set(targetFeeds.map(feed => feed.id));
    const previousCache = (db.cachedArticles || []).filter(article => activeFeedIds.has(article.feedId));
    if (previousCache.length !== db.cachedArticles?.length) needsSave = true;
    db.cachedArticles = previousCache;

    const lastFetched = db.lastFetchedAt ? new Date(db.lastFetchedAt).getTime() : 0;
    const isCacheExpired = previousCache.length === 0 || !lastFetched || Date.now() - lastFetched > CACHE_TTL_MS;
    let allRawArticles = previousCache;
    let warnings: string[] = useRuntimeCache && runtimeCache ? [...runtimeCache.warnings] : [];
    let isFromCache = !forceRefresh && !isCacheExpired;

    if (forceRefresh || isCacheExpired) {
      const result = await fetchAllActiveFeeds(targetFeeds);
      const fetchedFeedIds = new Set(targetFeeds.map(feed => feed.id));

      // The network runs outside the lock; merge into the latest persisted state
      // inside one transaction so concurrent note and bookmark saves are retained.
      const saved = await saveRssCache(latest => {
        if (useRuntimeCache && runtimeCache) {
          latest.cachedArticles = runtimeCache.articles;
          latest.lastFetchedAt = runtimeCache.lastFetchedAt;
        }
        normalizeStoredArticles(latest);
        targetFeeds = latest.feeds.filter(feed => feed.enabled);
        const currentActiveFeedIds = new Set(targetFeeds.map(feed => feed.id));
        const latestCache = (latest.cachedArticles || []).filter(article => currentActiveFeedIds.has(article.feedId));
        warnings = result.warnings.filter((_, index) => currentActiveFeedIds.has(result.failedFeedIds[index]));
        const failedFeedIds = new Set(result.failedFeedIds);
        const identityIds = new Map(
          [...latestCache, ...latest.savedArticles].map(article => [articleIdentity(article), article.id])
        );
        const refreshedArticles = result.articles.filter(article => currentActiveFeedIds.has(article.feedId)).map(article => ({
          ...article,
          id: identityIds.get(articleIdentity(article)) || article.id,
        }));
        const retainedArticles = latestCache.filter(article => failedFeedIds.has(article.feedId) || !fetchedFeedIds.has(article.feedId));
        latest.cachedArticles = Array.from(new Map(
          [...refreshedArticles, ...retainedArticles].map(article => [article.id, article])
        ).values()).sort((a, b) => (new Date(b.pubDate).getTime() || 0) - (new Date(a.pubDate).getTime() || 0));

        // A complete failure must not make stale data appear freshly synchronized.
        if (refreshedArticles.length > 0 || targetFeeds.length === 0) latest.lastFetchedAt = new Date().toISOString();
        isFromCache = refreshedArticles.length === 0 && retainedArticles.length > 0;
        normalizeStoredArticles(latest);
        return latest;
      });
      db = saved.database;
      if (saved.temporary) {
        warnings.push(TEMPORARY_CACHE_WARNING);
        cacheGlobal.__rssRuntimeCache = {
          feeds: feedSignature(db.feeds), articles: db.cachedArticles || [],
          lastFetchedAt: db.lastFetchedAt, warnings: [...warnings],
        };
      } else {
        delete cacheGlobal.__rssRuntimeCache;
      }
      needsSave = false;
    }

    if (needsSave) {
      const saved = await saveRssCache(latest => {
        if (useRuntimeCache && runtimeCache) {
          latest.cachedArticles = runtimeCache.articles;
          latest.lastFetchedAt = runtimeCache.lastFetchedAt;
        }
        normalizeStoredArticles(latest);
        const activeIds = new Set(latest.feeds.filter(feed => feed.enabled).map(feed => feed.id));
        latest.cachedArticles = (latest.cachedArticles || []).filter(article => activeIds.has(article.feedId));
        return latest;
      });
      db = saved.database;
      if (saved.temporary) {
        if (!warnings.includes(TEMPORARY_CACHE_WARNING)) warnings.push(TEMPORARY_CACHE_WARNING);
        cacheGlobal.__rssRuntimeCache = {
          feeds: feedSignature(db.feeds), articles: db.cachedArticles || [],
          lastFetchedAt: db.lastFetchedAt, warnings: [...warnings],
        };
      }
    }
    targetFeeds = db.feeds.filter(feed => feed.enabled);
    allRawArticles = db.cachedArticles || [];

    const savedMap = new Set(db.savedArticles.map(article => article.id));
    const readMap = new Set(db.readArticleIds || []);
    const annotate = (article: RSSArticle): RSSArticle => ({
      ...article,
      saved: savedMap.has(article.id),
      read: readMap.has(article.id),
    });

    const articles = allRawArticles.filter(article => {
      if (feedId && feedId !== 'all' && article.feedId !== feedId) return false;
      if (category && category !== 'all' && article.category !== category) return false;
      if (language && language !== 'all' && article.feedLanguage !== language) return false;
      if (query && ![article.title, article.snippet, article.author || ''].some(value => value.toLowerCase().includes(query))) return false;
      return true;
    }).map(annotate);

    return NextResponse.json({
      articles,
      // This independent collection includes archived and disabled-source saves.
      savedArticles: db.savedArticles.map(annotate),
      totalCount: articles.length,
      activeFeedsCount: targetFeeds.length,
      lastFetchedAt: db.lastFetchedAt,
      isFromCache,
      warnings,
    });
  } catch (error) {
    console.error('Error fetching RSS articles:', error);
    return NextResponse.json({ error: 'Erreur lors de la récupération des flux RSS.' }, { status: 500 });
  }
}
