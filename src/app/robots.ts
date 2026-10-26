import type { MetadataRoute } from 'next';
import { isPublicProduction, publicSiteUrl } from '@/lib/public-site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: isPublicProduction
      ? { userAgent: '*', allow: '/', disallow: ['/api/'] }
      : { userAgent: '*', disallow: '/' },
    sitemap: `${publicSiteUrl}/sitemap.xml`,
  };
}
