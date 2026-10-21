import type { FashionCategory, Language } from '@/types';

export type WorkspaceView = 'veille' | 'saved' | 'notes' | 'planning' | 'sources' | 'transfer';
export type FeedTab = 'all' | 'unread' | 'saved';
export type FeedView = 'veille' | 'saved';
export interface FeedContext {
  query: string;
  category: FashionCategory;
  language: Language;
  feedId: string;
  tab: FeedTab;
  compact: boolean;
  visibleCount: number;
  scrollY: number;
}
export interface WorkspaceState {
  view: WorkspaceView;
  selectedPostId: string | null;
  activeArticleId: string | null;
  returnTo: FeedView | null;
  feeds: Record<FeedView, FeedContext>;
  scroll: Partial<Record<WorkspaceView, number>>;
}
const views = ['veille', 'saved', 'notes', 'planning', 'sources', 'transfer'];
const categories = ['all', 'general', 'haute-couture', 'business', 'streetwear', 'trends', 'sustainability'];
export const freshFeedContext = (): FeedContext => ({ query: '', category: 'all', language: 'all', feedId: 'all', tab: 'all', compact: false, visibleCount: 15, scrollY: 0 });
export const freshWorkspaceState = (): WorkspaceState => ({ view: 'veille', selectedPostId: null, activeArticleId: null, returnTo: null, feeds: { veille: freshFeedContext(), saved: freshFeedContext() }, scroll: {} });
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value.slice(0, 2000) : fallback;
const position = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;

/** Storage and URLs are untrusted; keep only the navigation fields we understand. */
export function normalizeWorkspaceState(value: unknown): WorkspaceState {
  const state = freshWorkspaceState();
  if (!value || typeof value !== 'object') return state;
  const input = value as Partial<WorkspaceState>;
  if (views.includes(input.view || '')) state.view = input.view!;
  state.selectedPostId = text(input.selectedPostId) || null;
  state.activeArticleId = text(input.activeArticleId) || null;
  if (input.returnTo === 'veille' || input.returnTo === 'saved') state.returnTo = input.returnTo;
  for (const view of ['veille', 'saved'] as const) {
    const feed = input.feeds?.[view];
    if (!feed || typeof feed !== 'object') continue;
    state.feeds[view] = {
      query: text(feed.query), category: categories.includes(feed.category) ? feed.category : 'all',
      language: ['all', 'fr', 'en'].includes(feed.language) ? feed.language : 'all',
      feedId: text(feed.feedId, 'all'), tab: ['all', 'unread', 'saved'].includes(feed.tab) ? feed.tab : 'all',
      compact: feed.compact === true, visibleCount: Math.max(15, Math.min(10000, Math.floor(position(feed.visibleCount)))),
      scrollY: position(feed.scrollY),
    };
  }
  for (const view of views as WorkspaceView[]) state.scroll[view] = position(input.scroll?.[view]);
  return state;
}

export function readWorkspaceUrl(search: string, fallback?: WorkspaceState): WorkspaceState {
  const state = normalizeWorkspaceState(fallback);
  const params = new URLSearchParams(search);
  if (views.includes(params.get('view') || '')) state.view = params.get('view') as WorkspaceView;
  state.selectedPostId = params.get('note') || (params.has('view') ? null : state.selectedPostId);
  state.activeArticleId = params.get('article');
  if (state.view === 'veille' || state.view === 'saved') {
    const feed = state.feeds[state.view];
    if (params.has('q')) feed.query = params.get('q') || '';
    if (params.has('category')) feed.category = params.get('category') as FashionCategory;
    if (params.has('language')) feed.language = params.get('language') as Language;
    if (params.has('feed')) feed.feedId = params.get('feed') || 'all';
    if (params.has('tab')) feed.tab = params.get('tab') as FeedTab;
    if (params.has('layout')) feed.compact = params.get('layout') === 'list';
    if (params.has('limit')) feed.visibleCount = Number(params.get('limit'));
  }
  if (params.get('from') === 'veille' || params.get('from') === 'saved') state.returnTo = params.get('from') as FeedView;
  return normalizeWorkspaceState(state);
}

export function workspaceUrl(state: WorkspaceState): string {
  const params = new URLSearchParams({ view: state.view });
  if (state.selectedPostId && (state.view === 'notes' || state.view === 'planning')) params.set('note', state.selectedPostId);
  if (state.activeArticleId) params.set('article', state.activeArticleId);
  if (state.returnTo && (state.view === 'notes' || state.view === 'planning')) params.set('from', state.returnTo);
  if (state.view === 'veille' || state.view === 'saved') {
    const feed = state.feeds[state.view];
    // Explicit defaults make a shared URL independent of another tab's preferences.
    params.set('q', feed.query); params.set('category', feed.category); params.set('language', feed.language);
    params.set('feed', feed.feedId); params.set('tab', feed.tab); params.set('layout', feed.compact ? 'list' : 'magazine');
    params.set('limit', String(feed.visibleCount));
  }
  return `/espace?${params}`;
}
