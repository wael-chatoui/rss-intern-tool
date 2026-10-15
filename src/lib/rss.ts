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

const FEED_TIMEOUT_MS = 8000;
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const FEED_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 FashionPressHub/1.0',
  'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
};

// Download through fetch so compressed RSS/Atom responses are decoded correctly.
// Only XML parsing is delegated to rss-parser, for both validation and collection.
const parser = new Parser({
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

export class FeedFetchError extends Error {}

export function feedErrorMessage(error: unknown): string {
  return error instanceof FeedFetchError ? error.message : 'connexion impossible avec la source';
}

export async function parseFeedUrl(url: string, timeoutMs = FEED_TIMEOUT_MS) {
  let address: URL;
  try {
    address = new URL(url.trim());
    if (!['http:', 'https:'].includes(address.protocol)) throw new Error('Invalid protocol');
  } catch {
    throw new FeedFetchError('adresse de flux invalide (HTTP ou HTTPS requis)');
  }

  const signal = AbortSignal.timeout(timeoutMs);
  try {
    // BoF's public RSS endpoint accepts an identified RSS reader, while rejecting
    // the legacy browser header required by some other publishers such as ELLE.
    const headers = address.hostname === 'www.businessoffashion.com'
      ? { ...FEED_HEADERS, 'User-Agent': 'FashionPressHub/1.0 RSS reader' }
      : FEED_HEADERS;
    const response = await fetch(address, { headers, signal, cache: 'no-store' });
    if (!response.ok) {
      await response.body?.cancel();
      const reason = response.status === 403 ? 'accès refusé par la source'
        : response.status === 404 || response.status === 410 ? 'flux introuvable'
        : 'la source ne répond pas correctement';
      throw new FeedFetchError(`HTTP ${response.status} (${reason})`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new FeedFetchError('réponse vide reçue de la source');
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_FEED_BYTES) {
          await reader.cancel();
          throw new FeedFetchError('flux trop volumineux (limite de 5 Mo)');
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }

    const bytes = Buffer.concat(chunks);
    const declaredEncoding = response.headers.get('content-type')?.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1]
      || bytes.subarray(0, 200).toString('ascii').match(/<\?xml[^>]+encoding\s*=\s*["']([^"']+)/i)?.[1]
      || 'utf-8';
    let xml: string;
    try { xml = new TextDecoder(declaredEncoding).decode(bytes); }
    catch { throw new FeedFetchError('encodage du flux non pris en charge'); }
    if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(xml)) {
      throw new FeedFetchError('la source renvoie une page HTML au lieu d’un flux RSS ou Atom');
    }
    try { return await parser.parseString(xml); }
    catch { throw new FeedFetchError('flux XML/RSS ou Atom invalide'); }
  } catch (error) {
    if (signal.aborted) throw new FeedFetchError(`délai dépassé (${timeoutMs / 1000} s)`);
    if (error instanceof FeedFetchError) throw error;
    const code = (error as { cause?: { code?: string }; code?: string } | null)?.cause?.code
      || (error as { code?: string } | null)?.code;
    throw new FeedFetchError(`connexion impossible avec la source${code ? ` (${code})` : ''}`);
  }
}

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
  const parsed = await parseFeedUrl(feed.url);
  if (!parsed.items) return [];

  return parsed.items.map((item, index) => {
    const rawContent = item.contentEncoded || item['content:encoded'] || item.content || item.summary || '';
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
      warnings.push(`${feed.name} : ${res.status === 'rejected' ? feedErrorMessage(res.reason) : 'aucun article reçu'}. Les derniers articles disponibles sont conservés.`);
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
