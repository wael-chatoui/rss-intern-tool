import Parser from 'rss-parser';
import { createHash } from 'crypto';
import { FeedSource, RSSArticle } from '@/types';

export function createArticleId(feedId: string, uniqueId: string): string {
  return `rss_${createHash('sha256').update(`${feedId}:${uniqueId}`).digest('hex').slice(0, 24)}`;
}

export interface FeedFetchResult {
  articles: RSSArticle[];
  failedFeedIds: string[];
  warnings: string[];
}

// Custom fields to capture media and author tags
const parser = new Parser({
  timeout: 8000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 FashionPressHub/1.0',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
      ['enclosure', 'enclosure'],
      ['dc:creator', 'dcCreator'],
      ['content:encoded', 'contentEncoded'],
    ],
  },
});

function extractImageUrl(item: any): string | undefined {
  // Check enclosure
  if (item.enclosure?.url && (item.enclosure.type?.includes('image') || /\.(jpg|jpeg|png|webp|gif)/i.test(item.enclosure.url))) {
    return item.enclosure.url;
  }

  // Check media:content array or object
  if (item.mediaContent) {
    if (Array.isArray(item.mediaContent)) {
      const img = item.mediaContent.find((m: any) => m?.$?.url || m?.$?.medium === 'image');
      if (img?.$?.url) return img.$.url;
    } else if (item.mediaContent?.$?.url) {
      return item.mediaContent.$.url;
    }
  }

  // Check media:thumbnail
  if (item.mediaThumbnail?.$?.url) {
    return item.mediaThumbnail.$.url;
  }

  // Fallback: extract first <img> from content / contentEncoded / summary
  const htmlContent = item.contentEncoded || item.content || item.summary || item['content:encoded'] || '';
  const imgMatch = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && imgMatch[1]) {
    return imgMatch[1];
  }

  return undefined;
}

function cleanHtmlSnippet(html: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, '') // strip HTML tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

export async function fetchFeedArticles(feed: FeedSource): Promise<RSSArticle[]> {
  try {
    const parsed = await parser.parseURL(feed.url);
    if (!parsed.items) return [];

    return parsed.items.map((item, index) => {
      const rawContent = item['content:encoded'] || item.content || item.summary || '';
      const snippet = cleanHtmlSnippet(item.contentSnippet || item.summary || rawContent);
      const imageUrl = extractImageUrl(item);
      const anyItem = item as any;
      const uniqueId = anyItem.link || anyItem.guid || anyItem.id || `${item.title}-${item.pubDate || item.isoDate || index}`;

      return {
        id: createArticleId(feed.id, String(uniqueId)),
        feedId: feed.id,
        feedName: feed.name,
        feedLanguage: feed.language,
        category: feed.category,
        title: item.title || 'Sans titre',
        link: item.link || feed.website,
        pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
        author: anyItem.dcCreator || anyItem.creator || anyItem.author || feed.name,
        snippet: snippet || 'Aucun aperçu textuel disponible pour cet article.',
        content: rawContent,
        imageUrl: imageUrl,
      };
    });
  } catch (error) {
    // The aggregator returns one concise warning per unavailable source.
    // Avoid printing the same remote-source failures on every refresh.
    throw error;
  }
}

export async function fetchAllActiveFeeds(feeds: FeedSource[]): Promise<FeedFetchResult> {
  const activeFeeds = feeds.filter(f => f.enabled);
  // Fetch concurrently with Promise.allSettled
  const results = await Promise.allSettled(
    activeFeeds.map(feed => fetchFeedArticles(feed))
  );

  const allArticles: RSSArticle[] = [];
  const failedFeedIds: string[] = [];
  const warnings: string[] = [];
  results.forEach((res, index) => {
    if (res.status === 'fulfilled' && res.value.length > 0) {
      allArticles.push(...res.value);
    } else {
      const feed = activeFeeds[index];
      failedFeedIds.push(feed.id);
      warnings.push(`${feed.name} : ${res.status === 'rejected' ? 'source temporairement inaccessible' : 'aucun article reçu'}. Les derniers articles disponibles sont conservés.`);
    }
  });

  // Sort by date desc
  allArticles.sort((a, b) => {
    const timeA = new Date(a.pubDate).getTime() || 0;
    const timeB = new Date(b.pubDate).getTime() || 0;
    return timeB - timeA;
  });

  return {
    articles: Array.from(new Map(allArticles.map(article => [article.id, article])).values()),
    failedFeedIds,
    warnings,
  };
}
