import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';
import { fetchAllActiveFeeds } from '@/lib/rss';
import { RSSArticle } from '@/types';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const feedId = searchParams.get('feedId');
    const category = searchParams.get('category');
    const language = searchParams.get('language');
    const query = searchParams.get('q')?.toLowerCase();
    const forceRefresh = searchParams.get('refresh') === 'true';

    const db = await getDb();
    let targetFeeds = db.feeds.filter(f => f.enabled);

    const now = Date.now();
    const lastFetched = db.lastFetchedAt ? new Date(db.lastFetchedAt).getTime() : 0;
    const isCacheExpired = !db.cachedArticles || db.cachedArticles.length === 0 || (now - lastFetched > CACHE_TTL_MS);

    let allRawArticles: RSSArticle[] = [];

    if (forceRefresh || isCacheExpired) {
      // Fetch fresh articles from all enabled feeds
      allRawArticles = await fetchAllActiveFeeds(targetFeeds);
      db.cachedArticles = allRawArticles;
      db.lastFetchedAt = new Date().toISOString();
      await saveDb(db);
    } else {
      // Use cached articles
      allRawArticles = db.cachedArticles || [];
    }

    // Apply feed, category, and language filters
    let articles = allRawArticles;

    if (feedId && feedId !== 'all') {
      articles = articles.filter(a => a.feedId === feedId);
    }
    if (category && category !== 'all') {
      articles = articles.filter(a => a.category === category);
    }
    if (language && language !== 'all') {
      articles = articles.filter(a => a.feedLanguage === language);
    }

    const savedMap = new Set((db.savedArticles || []).map(a => a.id));
    const readMap = new Set(db.readArticleIds || []);

    // Annotate saved & read status
    articles = articles.map(a => ({
      ...a,
      saved: savedMap.has(a.id),
      read: readMap.has(a.id),
    }));

    // Filter by search query if provided
    if (query) {
      articles = articles.filter(a => 
        a.title.toLowerCase().includes(query) ||
        a.snippet.toLowerCase().includes(query) ||
        a.author?.toLowerCase().includes(query)
      );
    }

    return NextResponse.json({
      articles,
      totalCount: articles.length,
      activeFeedsCount: targetFeeds.length,
      lastFetchedAt: db.lastFetchedAt,
      isFromCache: !forceRefresh && !isCacheExpired,
    });
  } catch (error) {
    console.error('Error fetching RSS articles:', error);
    return NextResponse.json({ error: 'Erreur lors de la récupération des flux RSS.' }, { status: 500 });
  }
}
