// Public publisher endpoints verified on 2026-10-15. Only the exact obsolete
// default addresses are replaced; custom URLs and source preferences are retained.
export const FEED_URL_REPLACEMENTS = [
  {
    feedId: 'fashionnetwork-fr',
    oldUrl: 'https://fr.fashionnetwork.com/rss/news/',
    url: 'https://fr.fashionnetwork.com/rss/feed/fr,0.xml',
  },
  {
    feedId: 'elle-fr',
    oldUrl: 'https://www.elle.fr/Mode/rss',
    url: 'https://www.elle.fr/var/plain_site/storage/flux_rss/fluxMode.xml',
  },
  {
    feedId: 'madame-figaro',
    oldUrl: 'https://madame.lefigaro.fr/mode/feed',
    url: 'https://www.lefigaro.fr/rss/madame_style.xml',
  },
  {
    feedId: 'dazed-fashion',
    oldUrl: 'https://www.dazeddigital.com/rss/fashion',
    url: 'https://www.dazeddigital.com/rss',
  },
] as const;

export function resolveFeedUrl(url: string): string {
  const trimmed = url.trim();
  return FEED_URL_REPLACEMENTS.find(replacement => replacement.oldUrl === trimmed)?.url || trimmed;
}
