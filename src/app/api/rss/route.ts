import { NextResponse } from 'next/server';
import { protectApi } from '@/lib/auth';
import { getDb, updateDb } from '@/lib/db';
import { createArticleId, fetchAllActiveFeeds } from '@/lib/rss';
import { DatabaseSchema, RSSArticle, FeedHealth } from '@/types';

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
  health: FeedHealth[];
}
const cacheGlobal = globalThis as typeof globalThis & { __rssRuntimeCache?: RuntimeCache };
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

function sourceHealth(db: DatabaseSchema): FeedHealth[] {
  const previous = new Map((db.feedHealth || []).map(item => [item.feedId, item]));
  return db.feeds.map(feed => previous.get(feed.id) || { feedId: feed.id, status: 'never' as const });
}
function healthWarnings(db: DatabaseSchema): string[] {
  const health = new Map(sourceHealth(db).map(item => [item.feedId, item]));
  return db.feeds.filter(feed => feed.enabled && health.get(feed.id)?.status === 'error').map(feed =>
    `${feed.name} : ${health.get(feed.id)?.error || 'collecte impossible'}. Les derniers articles disponibles sont conservés.`);
}

function needsCollection(db: DatabaseSchema): boolean {
  const active = db.feeds.filter(feed => feed.enabled);
  if (!active.length) return false;
  const lastFetched = db.lastFetchedAt ? new Date(db.lastFetchedAt).getTime() : 0;
  if (!(db.cachedArticles || []).length || !lastFetched || Date.now() - lastFetched > CACHE_TTL_MS) return true;
  const health = new Map(sourceHealth(db).map(item => [item.feedId, item]));
  return active.some(feed => {
    const attempted = health.get(feed.id)?.lastAttemptAt;
    if (attempted) return !Number.isFinite(Date.parse(attempted)) || Date.now() - Date.parse(attempted) > CACHE_TTL_MS;
    return !(db.cachedArticles || []).some(article => article.feedId === feed.id);
  });
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
  const denied = await protectApi(req);
  if (denied) return denied;
  try {
    const { searchParams } = new URL(req.url);
    const feedId = searchParams.get('feedId');
    const category = searchParams.get('category');
    const language = searchParams.get('language');
    const query = searchParams.get('q')?.trim().toLowerCase();
    const cacheOnly = searchParams.get('cacheOnly') === 'true';
    const forceRefresh = !cacheOnly && searchParams.get('refresh') === 'true';
    const targetedRefresh = forceRefresh && feedId && feedId !== 'all' ? feedId : null;

    let db = await getDb();
    const runtimeCache = cacheGlobal.__rssRuntimeCache;
    const useRuntimeCache = runtimeCache?.feeds === feedSignature(db.feeds);
    let cacheIsTemporary = Boolean(useRuntimeCache);
    if (useRuntimeCache && runtimeCache) {
      db.cachedArticles = runtimeCache.articles;
      db.lastFetchedAt = runtimeCache.lastFetchedAt;
      db.feedHealth = runtimeCache.health;
    }
    let needsSave = normalizeStoredArticles(db);
    let targetFeeds = db.feeds.filter(feed => feed.enabled);
    if (targetedRefresh && !targetFeeds.some(feed => feed.id === targetedRefresh)) return NextResponse.json({ error: 'Cette source n’existe plus ou est en pause.' }, { status: 404 });
    const activeFeedIds = new Set(targetFeeds.map(feed => feed.id));
    const previousCache = (db.cachedArticles || []).filter(article => activeFeedIds.has(article.feedId));
    if (previousCache.length !== db.cachedArticles?.length) needsSave = true;
    db.cachedArticles = previousCache;

    const isCacheExpired = needsCollection(db);
    let allRawArticles = previousCache;
    let warnings: string[] = healthWarnings(db);
    let isFromCache = cacheOnly || (!forceRefresh && !isCacheExpired);

    if (!cacheOnly && (forceRefresh || isCacheExpired)) {
      const collectionFeeds = targetedRefresh ? targetFeeds.filter(feed => feed.id === targetedRefresh) : targetFeeds;
      const result = await fetchAllActiveFeeds(collectionFeeds);
      const fetchedFeedIds = new Set(collectionFeeds.map(feed => feed.id));

      // The network runs outside the lock; merge into the latest persisted state
      // inside one transaction so concurrent note and bookmark saves are retained.
      const saved = await saveRssCache(latest => {
        if (useRuntimeCache && runtimeCache) {
          latest.cachedArticles = runtimeCache.articles;
          latest.lastFetchedAt = runtimeCache.lastFetchedAt;
          latest.feedHealth = runtimeCache.health;
        }
        normalizeStoredArticles(latest);
        targetFeeds = latest.feeds.filter(feed => feed.enabled);
        const currentActiveFeedIds = new Set(targetFeeds.map(feed => feed.id));
        const latestCache = (latest.cachedArticles || []).filter(article => currentActiveFeedIds.has(article.feedId));
        const latestHealth = new Map((latest.feedHealth || []).map(item => [item.feedId, item]));
        const acceptedFeedIds = new Set<string>();
        for (const item of result.health) {
          if (!currentActiveFeedIds.has(item.feedId)) continue;
          const previous = latestHealth.get(item.feedId);
          if (previous?.lastAttemptAt && item.lastAttemptAt && Date.parse(item.lastAttemptAt) < Date.parse(previous.lastAttemptAt)) continue;
          acceptedFeedIds.add(item.feedId);
          latestHealth.set(item.feedId, { ...item, lastSuccessAt: item.lastSuccessAt || previous?.lastSuccessAt });
        }
        latest.feedHealth = latest.feeds.map(feed => latestHealth.get(feed.id) || { feedId: feed.id, status: 'never' });
        warnings = healthWarnings(latest);
        const failedFeedIds = new Set(result.failedFeedIds);
        const identityIds = new Map(
          [...latestCache, ...latest.savedArticles].map(article => [articleIdentity(article), article.id])
        );
        const refreshedArticles = result.articles.filter(article => currentActiveFeedIds.has(article.feedId) && acceptedFeedIds.has(article.feedId)).map(article => ({
          ...article,
          id: identityIds.get(articleIdentity(article)) || article.id,
        }));
        const retainedArticles = latestCache.filter(article => failedFeedIds.has(article.feedId) || !fetchedFeedIds.has(article.feedId) || !acceptedFeedIds.has(article.feedId));
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
      cacheIsTemporary = saved.temporary;
      if (saved.temporary) {
        cacheGlobal.__rssRuntimeCache = {
          feeds: feedSignature(db.feeds), articles: db.cachedArticles || [],
          lastFetchedAt: db.lastFetchedAt, warnings: [...warnings], health: db.feedHealth || [],
        };
      } else {
        delete cacheGlobal.__rssRuntimeCache;
      }
      needsSave = false;
    }

    if (needsSave && !cacheOnly) {
      const saved = await saveRssCache(latest => {
        if (useRuntimeCache && runtimeCache) {
          latest.cachedArticles = runtimeCache.articles;
          latest.lastFetchedAt = runtimeCache.lastFetchedAt;
          latest.feedHealth = runtimeCache.health;
        }
        normalizeStoredArticles(latest);
        const activeIds = new Set(latest.feeds.filter(feed => feed.enabled).map(feed => feed.id));
        latest.cachedArticles = (latest.cachedArticles || []).filter(article => activeIds.has(article.feedId));
        return latest;
      });
      db = saved.database;
      cacheIsTemporary = saved.temporary;
      if (saved.temporary) {
        cacheGlobal.__rssRuntimeCache = {
          feeds: feedSignature(db.feeds), articles: db.cachedArticles || [],
          lastFetchedAt: db.lastFetchedAt, warnings: [...warnings], health: db.feedHealth || [],
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
      if (!targetedRefresh && feedId && feedId !== 'all' && article.feedId !== feedId) return false;
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
      cacheIsTemporary,
      warnings,
      health: sourceHealth(db),
      needsRefresh: needsCollection(db),
    });
  } catch (error) {
    console.error('Error fetching RSS articles:', error);
    return NextResponse.json({ error: 'Erreur lors de la récupération des flux RSS.' }, { status: 500 });
  }
}
