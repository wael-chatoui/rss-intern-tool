export type FashionCategory = 
  | 'all'
  | 'general'
  | 'haute-couture'
  | 'business'
  | 'streetwear'
  | 'trends'
  | 'sustainability';

export type Language = 'all' | 'fr' | 'en';

export interface FeedSource {
  id: string;
  name: string;
  url: string;
  category: FashionCategory;
  language: 'fr' | 'en';
  website: string;
  enabled: boolean;
  favicon?: string;
}

export interface RSSArticle {
  id: string;
  feedId: string;
  feedName: string;
  feedLanguage: 'fr' | 'en';
  category: FashionCategory;
  title: string;
  link: string;
  pubDate: string;
  author?: string;
  snippet: string;
  content?: string;
  imageUrl?: string;
  saved?: boolean;
  read?: boolean;
}

export type LayoutMode = 'split' | 'feed-focused' | 'studio-focused';

export type SocialPlatform = 'tiktok' | 'instagram' | 'linkedin';

export type PostStatus = 'idea' | 'in_progress' | 'ready' | 'published';

export interface SocialContent {
  tiktok: {
    hook: string;
    script: string;
    visualNotes: string;
    durationEstimate: string;
  };
  instagram: {
    caption: string;
    carouselSlides: string[];
    hashtags: string[];
  };
  linkedin: {
    title: string;
    body: string;
    keyTakeaways: string[];
  };
}

export interface SocialPost {
  id: string;
  /** Server revision. Notes created before versioning start at zero. */
  revision?: number;
  notes?: string;
  sources?: NoteSource[];
  articleId?: string;
  sourceArticleTitle?: string;
  sourceArticleLink?: string;
  sourceArticleFeed?: string;
  angle: string;
  tags: string[];
  status: PostStatus;
  scheduledDate?: string; // YYYY-MM-DD
  scheduledTime?: string; // HH:mm
  platforms: SocialPlatform[];
  content: SocialContent;
  createdAt: string;
  updatedAt: string;
}

export interface NoteSource {
  articleId?: string;
  title: string;
  link: string;
  feed: string;
  excerpt?: string;
}

export interface FeedHealth {
  feedId: string;
  status: 'ok' | 'error' | 'never';
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  error?: string;
}

export interface DatabaseSchema {
  feeds: FeedSource[];
  savedArticles: RSSArticle[];
  readArticleIds?: string[];
  posts: SocialPost[];
  cachedArticles?: RSSArticle[];
  lastFetchedAt?: string;
  feedHealth?: FeedHealth[];
  /** Server-only revision history, retained even when a note is deleted or restored. */
  noteRevisions?: Record<string, number>;
}
