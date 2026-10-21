import Parser from 'rss-parser';
import { createHash } from 'crypto';
import { lookup } from 'node:dns';
import { isIP } from 'node:net';
import { Agent, fetch as networkFetch } from 'undici';
import ipaddr from 'ipaddr.js';
import { FeedSource, RSSArticle, FeedHealth } from '@/types';
export type { FeedHealth } from '@/types';

export function createArticleId(feedId: string, uniqueId: string): string {
  return `rss_${createHash('sha256').update(`${feedId}:${uniqueId}`).digest('hex').slice(0, 24)}`;
}

export interface FeedFetchResult {
  articles: RSSArticle[];
  failedFeedIds: string[];
  warnings: string[];
  health: FeedHealth[];
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

export function isPublicFeedAddress(address: string): boolean {
  try { return ipaddr.process(address.replace(/^\[|\]$/g, '')).range() === 'unicast'; }
  catch { return false; }
}

const publisherAgent = new Agent({ connect: {
  lookup(hostname, options, callback) {
    lookup(hostname, { all: true }, (error, addresses) => {
      if (error) { callback(error, '', 4); return; }
      if (!addresses.length || addresses.some(item => !isPublicFeedAddress(item.address))) {
        callback(Object.assign(new Error('Private feed address denied'), { code: 'ERR_RSS_PRIVATE_ADDRESS' }), '', 4); return;
      }
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    });
  },
} });

function validatePublisherAddress(address: URL) {
  const hostname = address.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password) throw new FeedFetchError('adresse de flux invalide (HTTP ou HTTPS sans identifiants requis)');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || (isIP(hostname) && !isPublicFeedAddress(hostname))) throw new FeedFetchError('les sources doivent utiliser une adresse Internet publique');
}

export function feedErrorMessage(error: unknown): string {
  return error instanceof FeedFetchError ? error.message : 'connexion impossible avec la source';
}

async function downloadFeedDocument(url: string, timeoutMs = FEED_TIMEOUT_MS) {
  let address: URL;
  try {
    address = new URL(url.trim());
    if (!['http:', 'https:'].includes(address.protocol)) throw new Error('Invalid protocol');
  } catch {
    throw new FeedFetchError('adresse de flux invalide (HTTP ou HTTPS requis)');
  }

  const signal = AbortSignal.timeout(timeoutMs);
  try {
    // Only isolated local publisher fixtures may opt out. Vercel always pins DNS
    // to validated public addresses, including every redirect and discovery URL.
    const localFixture = process.env.NODE_ENV === 'test' && process.env.RSS_ALLOW_PRIVATE_NETWORK === '1' && process.env.VERCEL !== '1';
    // BoF's public RSS endpoint accepts an identified RSS reader, while rejecting
    // the legacy browser header required by some other publishers such as ELLE.
    const headers = address.hostname === 'www.businessoffashion.com'
      ? { ...FEED_HEADERS, 'User-Agent': 'FashionPressHub/1.0 RSS reader' }
      : FEED_HEADERS;
    let response;
    for (let redirects = 0; ; redirects++) {
      if (!localFixture) validatePublisherAddress(address);
      response = await networkFetch(address, { headers, signal, redirect: 'manual', ...(localFixture ? {} : { dispatcher: publisherAgent }) });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const destination = response.headers.get('location');
      await response.body?.cancel();
      if (!destination || redirects >= 5) throw new FeedFetchError('trop de redirections pour cette source');
      address = new URL(destination, address);
    }
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
    return { text: xml, url: response.url || address.href, html: /text\/html/i.test(response.headers.get('content-type') || '') };
  } catch (error) {
    if (signal.aborted) throw new FeedFetchError(`délai dépassé (${timeoutMs / 1000} s)`);
    if (error instanceof FeedFetchError) throw error;
    const code = (error as { cause?: { code?: string }; code?: string } | null)?.cause?.code
      || (error as { code?: string } | null)?.code;
    throw new FeedFetchError(`connexion impossible avec la source${code ? ` (${code})` : ''}`);
  }
}

function isHtml(text: string) { return /^\s*(?:<!doctype\s+html|<html\b)/i.test(text); }

async function parseFeedDocument(text: string) {
  if (isHtml(text)) throw new FeedFetchError('la source renvoie une page HTML au lieu d’un flux RSS ou Atom');
  try { return await parser.parseString(text); }
  catch { throw new FeedFetchError('flux XML/RSS ou Atom invalide'); }
}

export async function parseFeedUrl(url: string, timeoutMs = FEED_TIMEOUT_MS) {
  return parseFeedDocument((await downloadFeedDocument(url, timeoutMs)).text);
}

/** Compare publisher addresses without fragments, default ports or trailing slashes. */
export function normalizeFeedUrl(value: string): string {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new FeedFetchError('adresse de flux invalide (HTTP ou HTTPS requis)');
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  url.searchParams.sort();
  return url.href;
}

/** Read one website and at most three advertised feeds, within a shared deadline. */
export async function discoverFeed(value: string) {
  const deadline = Date.now() + 12000;
  const remaining = () => Math.max(1, Math.min(FEED_TIMEOUT_MS, deadline - Date.now()));
  const document = await downloadFeedDocument(value, remaining());
  if (!document.html && !isHtml(document.text)) {
    return { parsed: await parseFeedDocument(document.text), url: document.url };
  }
  const candidates: string[] = [];
  for (const tag of document.text.match(/<link\b[^>]*>/gi) || []) {
    const attributes = new Map<string, string>();
    for (const match of Array.from(tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))) {
      attributes.set(match[1].toLowerCase(), (match[2] ?? match[3] ?? match[4]).replace(/&amp;/gi, '&'));
    }
    if (!attributes.get('rel')?.toLowerCase().split(/\s+/).includes('alternate') || !/^(?:application|text)\/(?:rss\+xml|atom\+xml|xml)(?:;|$)/i.test(attributes.get('type') || '')) continue;
    try {
      const candidate = new URL(attributes.get('href') || '', document.url);
      if (['http:', 'https:'].includes(candidate.protocol) && !candidates.includes(candidate.href)) candidates.push(candidate.href);
    } catch { /* An invalid discovery link does not invalidate the publisher website. */ }
    if (candidates.length === 3) break;
  }
  for (const candidate of candidates) {
    if (Date.now() >= deadline) break;
    try {
      const feedDocument = await downloadFeedDocument(candidate, remaining());
      return { parsed: await parseFeedDocument(feedDocument.text), url: feedDocument.url };
    } catch { /* Try the next explicitly advertised feed, never crawl the website. */ }
  }
  throw new FeedFetchError(candidates.length ? 'aucun des flux annoncés par ce site n’est lisible. Collez l’adresse exacte du flux RSS' : 'ce site n’annonce pas de flux RSS. Collez l’adresse exacte de son flux');
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
  const attemptedAt = new Date().toISOString();
  const results = await Promise.allSettled(
    activeFeeds.map(feed => fetchFeedArticles(feed))
  );

  const allArticles: RSSArticle[] = [];
  const failedFeedIds: string[] = [];
  const warnings: string[] = [];
  const health: FeedHealth[] = [];
  results.forEach((res, index) => {
    const feed = activeFeeds[index];
    if (res.status === 'fulfilled' && res.value.length > 0) {
      allArticles.push(...res.value);
      health.push({ feedId: feed.id, status: 'ok', lastAttemptAt: attemptedAt, lastSuccessAt: new Date().toISOString() });
    } else {
      const error = res.status === 'rejected' ? feedErrorMessage(res.reason) : 'aucun article reçu';
      health.push({ feedId: feed.id, status: 'error', lastAttemptAt: attemptedAt, error });
      failedFeedIds.push(feed.id);
      warnings.push(`${feed.name} : ${error}. Les derniers articles disponibles sont conservés.`);
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
    health,
  };
}
