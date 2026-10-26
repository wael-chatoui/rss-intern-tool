import type { MetadataRoute } from 'next';
import { publicSiteUrl } from '@/lib/public-site';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/demo'].map(path => ({ url: `${publicSiteUrl}${path === '/' ? '' : path}` }));
}
