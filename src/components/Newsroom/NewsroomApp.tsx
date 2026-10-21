'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowDownUp, ArrowLeft, ArrowRight, Bookmark, BookOpen, CalendarDays, Check, ChevronRight, CircleAlert, LayoutList, Loader2, Menu, Newspaper, NotebookPen, Plus, RefreshCw, Rss, Search, SlidersHorizontal, X } from 'lucide-react';
import { FeedSource, FeedHealth, FashionCategory, Language, RSSArticle, SocialPost } from '@/types';
import { ArticleReader } from './ArticleReader';
import { SourceManager } from './SourceManager';
import { NotesWorkspace, type NotesWorkspaceHandle } from './NotesWorkspace';
import { TransferWorkspace } from './TransferWorkspace';
import { useWorkspaceNavigation } from './useWorkspaceNavigation';
import { freshFeedContext, workspaceUrl, type FeedTab, type WorkspaceView as View } from '@/lib/workspace-state';
import { normalizeSearchText } from '@/lib/search';
import { sourceFromArticle } from '@/lib/note-model';
import type { TransferData, TransferTarget } from '@/lib/transfer-formats';
import { useDialogAccessibility } from './dialog';
import { SessionControls } from '@/components/Auth/SessionControls';
import type { Owner } from '@/lib/auth-store';
import { authenticatedFetch } from '@/lib/auth-client';

const categories: { id: FashionCategory; label: string }[] = [
  { id: 'all', label: 'Toutes les thématiques' }, { id: 'general', label: 'Général' }, { id: 'haute-couture', label: 'Haute couture' }, { id: 'business', label: 'Économie & business' }, { id: 'streetwear', label: 'Streetwear' }, { id: 'trends', label: 'Culture & tendances' }, { id: 'sustainability', label: 'Environnement & RSE' },
];
const statusLabels = { idea: 'À explorer', in_progress: 'En rédaction', ready: 'Prêt à publier', published: 'Publié' };
const viewLabels: Record<View, string> = { veille: 'Veille RSS', saved: 'Articles enregistrés', notes: 'Notes & rédaction', planning: 'Planning éditorial', sources: 'Sources RSS', transfer: 'Import / export' };
interface RssResponse { articles: RSSArticle[]; savedArticles?: RSSArticle[]; lastFetchedAt?: string; warnings?: string[]; health?: FeedHealth[]; needsRefresh?: boolean }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(url, { cache: 'no-store', ...init });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Cette opération n’a pas abouti. Réessayez.'), { status: response.status, code: data.code, post: data.post });
  return data as T;
}
function relativeDate(date: string) {
  const value = new Date(date).getTime();
  if (!Number.isFinite(value)) return '';
  const diff = Date.now() - value;
  if (diff < 60000) return 'À l’instant';
  if (diff < 3600000) return `Il y a ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)} h`;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }).format(new Date(date));
}
function ArticleImage({ article, className }: { article: RSSArticle; className: string }) {
  const [failed, setFailed] = useState(false);
  return <div className={className}>{article.imageUrl && !failed ? <img src={article.imageUrl} alt="" loading="lazy" onError={() => setFailed(true)} /> : <div className="article-image-fallback"><Newspaper aria-hidden="true" /><span>{article.feedName}</span></div>}</div>;
}
function ArticleMeta({ article }: { article: RSSArticle }) {
  return <div className="article-meta"><strong>{article.feedName}</strong><span className="meta-dot" /><span>{relativeDate(article.pubDate)}</span>{article.read && <><span className="meta-dot" /><span>Lu</span></>}</div>;
}
function LoadError({ message, onRetry, label = 'Réessayer' }: { message: string; onRetry: () => void; label?: string }) {
  return <div className="error-banner" role="alert"><CircleAlert aria-hidden="true" /><span>{message}</span><button className="btn btn-ghost" onClick={onRetry}>{label}</button></div>;
}

export default function NewsroomApp({ owner }: { owner: Owner }) {
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [articles, setArticles] = useState<RSSArticle[]>([]);
  const [savedArticles, setSavedArticles] = useState<RSSArticle[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [health, setHealth] = useState<FeedHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);
  const [feedsLoading, setFeedsLoading] = useState(true);
  const [rssError, setRssError] = useState('');
  const [postsError, setPostsError] = useState('');
  const [feedsError, setFeedsError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [addRequestKey, setAddRequestKey] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<TransferTarget>('notes');
  const [transferRequest, setTransferRequest] = useState(0);
  const [transferMutating, setTransferMutating] = useState(false);
  const [savingArticleIds, setSavingArticleIds] = useState<Set<string>>(new Set());
  const [readingOrder, setReadingOrder] = useState<string[]>([]);
  const navigation = useWorkspaceNavigation(`redaction:navigation:${owner.email}`, !loading, !postsLoading, transferMutating);
  const { view, selectedPostId, activeArticleId } = navigation.state;
  const feedContext = navigation.state.feeds[view === 'saved' ? 'saved' : 'veille'];
  const { query, category, language, feedId, compact, visibleCount, tab: feedTab } = feedContext;
  const setQuery = (query: string) => navigation.updateFeed({ query });
  const setCategory = (category: FashionCategory) => navigation.updateFeed({ category });
  const setLanguage = (language: Language) => navigation.updateFeed({ language });
  const setFeedId = (feedId: string) => navigation.updateFeed({ feedId });
  const setFeedTab = (tab: FeedTab) => navigation.updateFeed({ tab });
  const setCompact = (compact: boolean) => navigation.updateFeed({ compact });
  const setVisibleCount = (update: (previous: number) => number) => navigation.updateFeed(feed => ({ ...feed, visibleCount: update(feed.visibleCount) }));
  const transferMutationRef = useRef(false);
  const notesRef = useRef<NotesWorkspaceHandle>(null);
  const postsRef = useRef(posts);
  postsRef.current = posts;
  const searchRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const topbarRef = useRef<HTMLElement>(null);
  const pendingArticles = useRef(new Set<string>());
  const creatingRef = useRef(false);
  const initialLoad = useRef(false);
  const loadSequence = useRef(0);
  const postsSequence = useRef(0);
  const notesHaveLoaded = useRef(false);
  const go = useCallback((next: View) => {
    if (transferMutationRef.current) return;
    navigation.update(previous => ({ ...previous, view: next, activeArticleId: null, returnTo: (previous.view === 'veille' || previous.view === 'saved') && (next === 'notes' || next === 'planning') ? previous.view : previous.returnTo }), true);
    setMobileMenu(false); setOpenAdd(false);
  }, [navigation.update]);
  const handleTransferMutation = useCallback((active: boolean) => {
    transferMutationRef.current = active; setTransferMutating(active);
    if (active) { setMobileMenu(false); navigation.update({ activeArticleId: null }); }
  }, [navigation.update]);
  useEffect(() => {
    if (sidebarRef.current) sidebarRef.current.inert = transferMutating;
    if (topbarRef.current) topbarRef.current.inert = transferMutating;
  }, [transferMutating]);
  const closeMobileMenu = useCallback(() => setMobileMenu(false), []);
  useDialogAccessibility(mobileMenu, sidebarRef, closeMobileMenu);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); }, [toast]);

  const loadArticles = useCallback(async (refresh = false, retryFeedId?: string) => {
    const sequence = ++loadSequence.current;
    const apply = (data: RssResponse) => {
      setArticles(data.articles); setSavedArticles(data.savedArticles || []); setLastFetched(data.lastFetchedAt || null);
      setWarnings(data.warnings || []); setHealth(data.health || []); setRssError(''); setLoading(false);
    };
    try {
      // Always paint the last readable cache before contacting third-party sources.
      const cached = await request<RssResponse>('/api/rss?cacheOnly=true');
      if (sequence !== loadSequence.current || transferMutationRef.current) return;
      apply(cached);
      if (!refresh && !cached.needsRefresh) return;
      setRefreshing(true);
      const data = await request<RssResponse>(`/api/rss?refresh=true${retryFeedId ? `&feedId=${encodeURIComponent(retryFeedId)}` : ''}`);
      if (sequence !== loadSequence.current || transferMutationRef.current) return;
      apply(data);
      if (refresh) notify(data.warnings?.length ? 'Veille actualisée. Certaines sources restent indisponibles.' : 'Veille actualisée.');
    } catch (cause) {
      if (sequence === loadSequence.current) setRssError(cause instanceof Error ? cause.message : 'Impossible de charger la veille. Les derniers articles restent disponibles.');
      if (retryFeedId) throw cause;
    } finally { if (sequence === loadSequence.current) { setLoading(false); setRefreshing(false); } }
  }, [notify]);
  const loadFeeds = useCallback(async () => {
    setFeedsLoading(true);
    try { const data = await request<{ feeds: FeedSource[]; health?: FeedHealth[] }>('/api/feeds'); setFeeds(data.feeds); if (data.health) setHealth(data.health); setFeedsError(''); }
    catch { setFeedsError('Impossible de charger les sources. Réessayez leur chargement.'); }
    finally { setFeedsLoading(false); }
  }, []);
  const loadPosts = useCallback(async (quiet = false) => {
    const sequence = ++postsSequence.current;
    if (!quiet || !notesHaveLoaded.current) setPostsLoading(true);
    try {
      const data = await request<{ posts: SocialPost[] }>('/api/posts');
      if (sequence !== postsSequence.current || transferMutationRef.current) return;
      setPosts(data.posts); setPostsError(''); notesHaveLoaded.current = true;
    } catch { if (sequence === postsSequence.current) setPostsError('Les notes n’ont pas pu être chargées. Vos notes enregistrées n’ont pas été supprimées.'); }
    finally { if (sequence === postsSequence.current) setPostsLoading(false); }
  }, []);
  const handleFeedsChange = useCallback(async (next?: FeedSource[]) => {
    if (next) { setFeeds(next); setFeedsError(''); } else void loadFeeds();
    void loadArticles(true);
  }, [loadFeeds, loadArticles]);
  useEffect(() => {
    if (initialLoad.current) return;
    initialLoad.current = true;
    void loadFeeds(); void loadPosts(); void loadArticles();
  }, [loadArticles, loadFeeds, loadPosts]);
  useEffect(() => {
    const resume = () => { if (document.visibilityState === 'visible' && !transferMutationRef.current) void loadPosts(true); };
    window.addEventListener('focus', resume); document.addEventListener('visibilitychange', resume);
    return () => { window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); };
  }, [loadPosts]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (transferMutationRef.current) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); go('veille'); requestAnimationFrame(() => searchRef.current?.focus()); }
      if (event.key === 'Escape') setMobileMenu(false);
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [go]);

  const articlePool = useMemo(() => {
    const pool = new Map(articles.map(article => [article.id, article]));
    savedArticles.forEach(article => { if (!pool.has(article.id)) pool.set(article.id, article); });
    return Array.from(pool.values());
  }, [articles, savedArticles]);
  const activeArticle = articlePool.find(article => article.id === activeArticleId) || null;
  useEffect(() => {
    if (navigation.ready && !loading && !refreshing && !rssError && activeArticleId && !activeArticle) {
      navigation.update({ activeArticleId: null }); notify('Cet article n’est plus disponible dans la veille.');
    }
  }, [navigation.ready, navigation.update, loading, refreshing, rssError, activeArticleId, activeArticle, notify]);
  const unread = articles.filter(article => !article.read).length;
  const activeFeeds = feeds.filter(feed => feed.enabled);
  const savedView = view === 'saved' || feedTab === 'saved';
  const searchIndex = useMemo(() => new Map(articlePool.map(article => [article.id, normalizeSearchText(`${article.title} ${article.snippet} ${article.content || ''} ${article.feedName} ${article.author || ''}`)])), [articlePool]);
  const filteredArticles = useMemo(() => {
    const needle = normalizeSearchText(query);
    return (savedView ? articlePool.filter(article => article.saved) : articles).filter(article =>
      (feedTab !== 'unread' || savedView || !article.read) && (category === 'all' || article.category === category) &&
      (language === 'all' || article.feedLanguage === language) && (feedId === 'all' || article.feedId === feedId) &&
      (!needle || searchIndex.get(article.id)?.includes(needle))
    );
  }, [articles, articlePool, savedView, feedTab, category, language, feedId, query, searchIndex]);
  const hasFilters = !!query.trim() || category !== 'all' || language !== 'all' || feedId !== 'all' || feedTab === 'unread';
  const resetFilters = () => navigation.updateFeed({ ...freshFeedContext(), compact });
  const selectFeed = (id: string) => {
    navigation.update(previous => ({ ...previous, view: 'veille', activeArticleId: null, feeds: { ...previous.feeds, veille: { ...previous.feeds.veille, ...freshFeedContext(), compact: previous.feeds.veille.compact, feedId: id } } }), true);
    setMobileMenu(false); setOpenAdd(false); setFilterOpen(true);
  };
  const openArticle = (id: string) => {
    setReadingOrder(filteredArticles.map(article => article.id));
    navigation.update({ activeArticleId: id }, true);
  };
  const readingIds = (readingOrder.includes(activeArticleId || '') ? readingOrder : filteredArticles.map(article => article.id)).filter(id => articlePool.some(article => article.id === id));
  const readingIndex = activeArticleId ? readingIds.indexOf(activeArticleId) : -1;
  const closeArticle = navigation.closeReader;
  const moveArticle = (offset: number) => { const id = readingIds[readingIndex + offset]; if (id) navigation.update({ activeArticleId: id }); };

  const toggleSave = async (article: RSSArticle) => {
    if (pendingArticles.current.has(article.id)) return;
    pendingArticles.current.add(article.id); setSavingArticleIds(new Set(pendingArticles.current));
    try {
      const data = await request<{ isSaved: boolean; savedArticles: RSSArticle[] }>('/api/articles/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(article) });
      setArticles(prev => prev.map(item => item.id === article.id ? { ...item, saved: data.isSaved } : item));
      setSavedArticles(data.savedArticles); notify(data.isSaved ? 'Article enregistré.' : 'Article retiré des enregistrements.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible d’enregistrer cet article.'); throw cause; }
    finally { pendingArticles.current.delete(article.id); setSavingArticleIds(new Set(pendingArticles.current)); }
  };
  const toggleRead = async (article: RSSArticle) => {
    const data = await request<{ read: boolean }>('/api/articles/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articleId: article.id, read: !article.read }) });
    setArticles(prev => prev.map(item => item.id === article.id ? { ...item, read: data.read } : item));
    setSavedArticles(prev => prev.map(item => item.id === article.id ? { ...item, read: data.read } : item));
  };
  const readAndNext = async (article: RSSArticle) => {
    const intent = navigation.getIntent();
    if (!article.read) await toggleRead(article);
    if (intent !== navigation.getIntent()) return;
    const nextId = readingIds[readingIndex + 1];
    if (nextId) navigation.update({ activeArticleId: nextId });
    else { closeArticle(); notify('Vous avez terminé cette sélection.'); }
  };
  const selectNote = useCallback((id: string | null) => {
    navigation.update(previous => ({ ...previous, selectedPostId: id, activeArticleId: null, view: id ? 'notes' : previous.view, returnTo: (previous.view === 'veille' || previous.view === 'saved') ? previous.view : previous.returnTo }), !!id);
    setMobileMenu(false);
  }, [navigation.update]);
  const createPost = async (input: Partial<SocialPost>, message: string) => {
    if (creatingRef.current || transferMutationRef.current) throw new Error('Une opération est déjà en cours. Réessayez dans un instant.');
    creatingRef.current = true; setCreating(true);
    const intent = navigation.getIntent();
    try {
      const data = await request<{ post: SocialPost }>('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      postsSequence.current += 1; setPostsLoading(false);
      setPosts(prev => [data.post, ...prev]);
      if (!notesHaveLoaded.current) void loadPosts(true);
      if (intent === navigation.getIntent()) selectNote(data.post.id);
      notify(message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible de créer une note.'); throw cause; }
    finally { creatingRef.current = false; setCreating(false); }
  };
  const createNote = (article?: RSSArticle, scheduledDate?: string) => createPost({
    angle: '', notes: '', sources: article ? [sourceFromArticle(article)] : [], status: 'idea', tags: [], platforms: [],
    scheduledDate, scheduledTime: scheduledDate ? '09:00' : undefined,
  }, 'Note créée.');
  const duplicatePost = async (post: SocialPost) => {
    const { id: _id, revision: _revision, createdAt: _created, updatedAt: _updated, ...input } = post;
    await createPost({ ...input, angle: post.angle ? `${post.angle} (copie)` : 'Note récupérée' }, 'Votre version a été conservée dans une nouvelle note.');
  };
  const savePost = useCallback(async (post: SocialPost) => {
    const data = await request<{ post: SocialPost }>('/api/posts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...post, revision: post.revision ?? 0 }) });
    postsSequence.current += 1; setPostsLoading(false);
    setPosts(prev => prev.map(item => item.id === data.post.id ? data.post : item));
    if (!notesHaveLoaded.current) void loadPosts(true);
    return data.post;
  }, [loadPosts]);
  const deletePost = useCallback(async (id: string, revision?: number) => {
    const expected = revision ?? postsRef.current.find(post => post.id === id)?.revision ?? 0;
    await request(`/api/posts?id=${encodeURIComponent(id)}&revision=${expected}`, { method: 'DELETE' });
    postsSequence.current += 1; setPosts(prev => prev.filter(item => item.id !== id));
    if (!notesHaveLoaded.current) void loadPosts(true);
    navigation.update(previous => ({ ...previous, selectedPostId: previous.selectedPostId === id ? null : previous.selectedPostId }));
    notify('Note supprimée.');
  }, [notify, navigation.update, loadPosts]);
  const attachToNote = async (id: string, article: RSSArticle) => {
    if (!notesRef.current || postsLoading || postsError) throw new Error('Chargez vos notes avant d’ajouter cette référence.');
    const intent = navigation.getIntent();
    await notesRef.current.attachSource(id, sourceFromArticle(article));
    if (intent === navigation.getIntent()) selectNote(id);
    notify('Source ajoutée au sujet.');
  };
  const openNote = (post: SocialPost) => selectNote(post.id);
  const beforeTransfer = useCallback(async () => { await notesRef.current?.flush(); }, []);
  useEffect(() => {
    const expired = () => setSessionExpired(true);
    window.addEventListener('redaction-session-expired', expired);
    return () => window.removeEventListener('redaction-session-expired', expired);
  }, []);
  async function checkSession() {
    try {
      if ((await fetch('/api/auth/session', { cache: 'no-store' })).ok) { setSessionExpired(false); void loadPosts(true); window.dispatchEvent(new Event('redaction-session-restored')); }
    } catch { /* Keep the reconnection notice until the server confirms it. */ }
  }
  const openTransfer = (target: TransferTarget) => { setTransferTarget(target); setTransferRequest(value => value + 1); go('transfer'); };
  const handleTransferChanged = useCallback(async () => {
    loadSequence.current += 1; postsSequence.current += 1; setRefreshing(false); setLoading(false); setPostsLoading(false);
    const { data } = await request<{ data: TransferData }>('/api/transfer');
    notesHaveLoaded.current = true;
    setFeeds(data.feeds || []); setPosts(data.posts || []); setArticles(data.cachedArticles || []); setSavedArticles(data.savedArticles || []);
    setLastFetched(data.lastFetchedAt || null); setPostsError(''); setFeedsError(''); setRssError('');
    navigation.update({ selectedPostId: null, activeArticleId: null });
    const cached = await request<RssResponse>('/api/rss?cacheOnly=true');
    setHealth(cached.health || []); setWarnings(cached.warnings || []);
    void loadFeeds();
  }, [navigation.update, loadFeeds]);
  const addSource = () => { go('sources'); setOpenAdd(true); setAddRequestKey(value => value + 1); };
  const featured = !compact ? filteredArticles[0] : undefined;
  const rows = filteredArticles.slice(featured ? 1 : 0, visibleCount);
  const categoryName = (value: FashionCategory) => categories.find(cat => cat.id === value)?.label || value;
  const failedSources = health.filter(item => item.status === 'error' && activeFeeds.some(feed => feed.id === item.feedId)).length;
  const healthySources = health.filter(item => item.status === 'ok' && activeFeeds.some(feed => feed.id === item.feedId)).length;
  const syncLabel = loading ? 'Chargement de la veille' : rssError ? 'Actualisation à réessayer' : refreshing ? 'Actualisation en cours…' : failedSources ? `${healthySources}/${activeFeeds.length} sources à jour` : lastFetched ? `Collecte ${relativeDate(lastFetched).toLowerCase()}` : 'Aucune collecte récente';
  const saveButton = (article: RSSArticle) => <button className={`icon-btn save-article ${article.saved ? 'saved' : ''}`} disabled={savingArticleIds.has(article.id)} aria-label={article.saved ? `Retirer de la sélection : ${article.title}` : `Enregistrer : ${article.title}`} aria-pressed={!!article.saved} onClick={() => void toggleSave(article).catch(() => {})}>{savingArticleIds.has(article.id) ? <Loader2 className="is-spinning" aria-hidden="true" /> : <Bookmark aria-hidden="true" />}</button>;

  return <div className="newsroom">
    <a className="skip-link" href="#main">Aller au contenu</a>
    {mobileMenu && <button className="sidebar-scrim" aria-label="Fermer la navigation" onClick={() => setMobileMenu(false)} />}
    <aside ref={sidebarRef} className={`sidebar ${mobileMenu ? 'is-open' : ''}`} aria-label="Navigation principale" role={mobileMenu ? 'dialog' : undefined} aria-modal={mobileMenu ? true : undefined} tabIndex={mobileMenu ? -1 : undefined}>
      <a className="brand" href="#main" onClick={event => { event.preventDefault(); go('veille'); }}><span className="brand-mark">r.</span><span className="brand-name">La Rédaction</span></a>
      <span className="nav-label">NAVIGATION</span>
      <nav>{([
        { id: 'veille', label: 'Veille RSS', icon: Newspaper, count: unread },
        { id: 'saved', label: 'Enregistrés', icon: Bookmark, count: savedArticles.length },
        { id: 'notes', label: 'Notes & rédaction', icon: NotebookPen, count: posts.length },
        { id: 'planning', label: 'Planning éditorial', icon: CalendarDays },
        { id: 'transfer', label: 'Import / export', icon: ArrowDownUp },
      ] as const).map(item => <a key={item.id} href={workspaceUrl({ ...navigation.state, view: item.id, activeArticleId: null })} className={`nav-item ${view === item.id ? 'active' : ''}`} aria-current={view === item.id ? 'page' : undefined} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); go(item.id); }}><item.icon aria-hidden="true" /><span>{item.label}</span>{'count' in item && <span className="nav-count">{item.count}</span>}</a>)}</nav>
      <div className="sidebar-divider" />
      <button className={`nav-item ${view === 'sources' ? 'active' : ''}`} aria-current={view === 'sources' ? 'page' : undefined} onClick={() => go('sources')}><Rss aria-hidden="true" /><span>Sources RSS</span><span className="nav-count">{activeFeeds.length}</span></button>
      <div className="sidebar-sources">{activeFeeds.slice(0, 5).map(feed => <button className={`sidebar-source ${feedId === feed.id && view === 'veille' ? 'active' : ''}`} key={feed.id} onClick={() => selectFeed(feed.id)}><span className="source-letter" aria-hidden="true">{feed.name.charAt(0)}</span><span className="source-name">{feed.name.replace(' (France)', '')}</span></button>)}</div>
      <button className="btn btn-ghost sidebar-add" onClick={addSource}><Plus aria-hidden="true" />Ajouter une source</button>
      <div className="sidebar-footer"><SessionControls owner={owner} beforeLogout={beforeTransfer} disabled={transferMutating} /></div>
    </aside>
    <div className="app-body">
      <header ref={topbarRef} className="topbar"><div className="breadcrumb"><button className="icon-btn mobile-menu" aria-label={mobileMenu ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={mobileMenu} onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X /> : <Menu />}</button><span>Rédaction</span><ChevronRight aria-hidden="true" /><strong>{viewLabels[view]}</strong></div><div className="topbar-right"><span className={`sync-status ${failedSources || rssError ? 'sync-partial' : ''}`} role="status"><span className="status-dot" />{syncLabel}</span><button className="btn btn-ghost" disabled={refreshing} onClick={() => void loadArticles(true)}><RefreshCw className={refreshing ? 'is-spinning' : ''} aria-hidden="true" />{refreshing ? 'Actualisation…' : 'Actualiser'}</button></div></header>
      <main id="main" className="page-content" tabIndex={-1} aria-busy={transferMutating}>
        <div className="page-heading"><div><h1>{viewLabels[view]}</h1></div>{view !== 'transfer' && <div className="page-actions"><button className="btn btn-secondary" aria-label="Importer ou exporter" onClick={() => openTransfer(view === 'sources' ? 'feeds' : view === 'notes' || view === 'planning' ? 'notes' : 'articles')}><ArrowDownUp aria-hidden="true" /><span>Import / export</span></button>{view !== 'sources' && <button className="btn btn-primary" aria-label="Nouvelle note" disabled={creating} onClick={() => void createNote().catch(() => {})}><Plus aria-hidden="true" /><span>{creating ? 'Création…' : 'Nouvelle note'}</span></button>}</div>}</div>
        {sessionExpired && <div className="error-banner" role="alert"><CircleAlert aria-hidden="true" /><span>Votre session a expiré. Gardez cette page ouverte pour conserver vos modifications. <a href="/connexion?expired=1" target="_blank" rel="noopener noreferrer">Se reconnecter dans un nouvel onglet</a>, puis réessayer l’enregistrement.</span><button onClick={() => void checkSession()}>Vérifier la connexion</button></div>}
        {error && <div className="error-banner" role="alert"><CircleAlert aria-hidden="true" /><span>{error}</span><button className="icon-btn" aria-label="Fermer le message" onClick={() => setError('')}><X /></button></div>}
        {(view === 'notes' || view === 'planning') && navigation.state.returnTo && <button className="return-to-feed" onClick={() => go(navigation.state.returnTo!)}><ArrowLeft size={16} aria-hidden="true" />{navigation.state.returnTo === 'saved' ? 'Revenir à ma sélection' : 'Revenir à ma veille'}</button>}
        {(view === 'notes' || view === 'planning') && postsError && <LoadError message={postsError} onRetry={() => void loadPosts()} label="Recharger les notes" />}
        {(view === 'veille' || view === 'saved') && rssError && <LoadError message={rssError} onRetry={() => void loadArticles(true)} label="Réessayer la veille" />}
        {(view === 'veille' || view === 'saved') && feedsError && <LoadError message={feedsError} onRetry={() => void loadFeeds()} label="Recharger les sources" />}
        {(view === 'veille' || view === 'saved') && <div className="feed-layout"><section className="feed-main" aria-label="Articles RSS">
          <div className="feed-tabs" aria-label="Filtrer les articles">{([{ id: 'all', label: 'Tous les articles', count: view === 'saved' ? savedArticles.length : articles.length }, { id: 'unread', label: 'À lire', count: unread }, { id: 'saved', label: 'Enregistrés', count: savedArticles.length }] as const).filter(item => view !== 'saved' || item.id === 'all').map(item => <button key={item.id} className={`feed-tab ${feedTab === item.id ? 'active' : ''}`} aria-pressed={feedTab === item.id} onClick={() => setFeedTab(item.id)}>{view === 'saved' ? 'Ma sélection' : item.label}<span className="feed-tab-count">{item.count}</span></button>)}</div>
          <div className="feed-toolbar"><div className="search-control"><Search aria-hidden="true" /><input ref={searchRef} aria-label="Rechercher dans les articles" placeholder="Rechercher un sujet, une source…" value={query} onChange={e => setQuery(e.target.value)} />{query ? <button className="icon-btn" aria-label="Effacer la recherche" onClick={() => setQuery('')}><X /></button> : <kbd>⌘ K</kbd>}</div><button className={`btn btn-secondary filter-toggle ${category !== 'all' || language !== 'all' || feedId !== 'all' || filterOpen ? 'is-active' : ''}`} aria-label="Filtres" aria-expanded={filterOpen} aria-controls="feed-filters" onClick={() => setFilterOpen(!filterOpen)}><SlidersHorizontal aria-hidden="true" /><span>Filtres</span></button><div className="view-toggle" aria-label="Affichage des articles"><button className={`icon-btn ${!compact ? 'active' : ''}`} aria-label="Affichage magazine" aria-pressed={!compact} onClick={() => setCompact(false)}><Newspaper /></button><button className={`icon-btn ${compact ? 'active' : ''}`} aria-label="Affichage liste" aria-pressed={compact} onClick={() => setCompact(true)}><LayoutList /></button></div></div>
          {filterOpen && <div className="filter-panel" id="feed-filters"><label>Thématique<select className="field" value={category} onChange={e => setCategory(e.target.value as FashionCategory)}>{categories.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}</select></label><label>Langue<select className="field" value={language} onChange={e => setLanguage(e.target.value as Language)}><option value="all">Toutes les langues</option><option value="fr">Français</option><option value="en">Anglais</option></select></label><label>Source<select className="field" value={feedId} onChange={e => setFeedId(e.target.value)}><option value="all">Toutes les sources</option>{feeds.map(feed => <option key={feed.id} value={feed.id}>{feed.name}</option>)}</select></label><button className="filter-reset" onClick={resetFilters}>Réinitialiser les filtres</button></div>}
          {hasFilters && <div className="feed-active-filters" aria-label="Filtres appliqués">{feedId !== 'all' && <span>{feeds.find(feed => feed.id === feedId)?.name || 'Source sélectionnée'}</span>}{category !== 'all' && <span>{categoryName(category)}</span>}{language !== 'all' && <span>{language === 'fr' ? 'Français' : 'Anglais'}</span>}{feedTab === 'unread' && <span>À lire</span>}{query.trim() && <span>Recherche : {query}</span>}<button onClick={resetFilters}>Tout effacer</button></div>}
          {warnings.length > 0 && <div className="warning-banner"><CircleAlert aria-hidden="true" /><details><summary>{warnings.length} source{warnings.length > 1 ? 's' : ''} indisponible{warnings.length > 1 ? 's' : ''}. Les articles conservés restent accessibles.</summary>{warnings.map(warning => <p key={warning}>{warning}</p>)}</details></div>}
          {loading ? <div aria-busy="true" aria-label="Chargement des articles"><div className="feed-skeleton feature" /><div className="feed-skeleton" /><div className="feed-skeleton" /><span className="sr-only">Chargement des articles…</span></div> : filteredArticles.length ? <>
            <div className="feed-section-caption"><strong>{feedId !== 'all' ? feeds.find(feed => feed.id === feedId)?.name || 'Sélection' : savedView ? 'Articles enregistrés' : query ? 'Résultats' : 'Articles récents'}</strong><span>{filteredArticles.length} article{filteredArticles.length > 1 ? 's' : ''} · Plus récents d’abord</span></div>
            {featured && <article className="featured-article"><button className="article-title-button" aria-label={`Lire : ${featured.title}`} onClick={() => openArticle(featured.id)}><ArticleImage key={featured.id} article={featured} className="featured-image" /></button><div className="featured-copy"><ArticleMeta article={featured} /><h2><button className="article-title-button line-clamp-3" onClick={() => openArticle(featured.id)}>{featured.title}</button></h2><p className="line-clamp-3">{featured.snippet.startsWith('Aucun aperçu') ? 'Aucun extrait disponible.' : featured.snippet}</p><span className="category-tag">{categoryName(featured.category)}</span><div className="featured-bottom"><button className="read-link" onClick={() => openArticle(featured.id)}>Lire l’article<ArrowRight aria-hidden="true" /></button>{saveButton(featured)}</div></div></article>}
            <div className="feed-section-caption"><strong>{featured ? 'Autres articles' : 'Articles'}</strong><span>{savedView ? 'Enregistrés' : `${activeFeeds.length} sources actives`}</span></div>
            <div className={`article-list ${compact ? 'compact' : ''}`}>{rows.map(article => <article key={article.id} className={`article-row ${article.read ? 'is-read' : ''}`}><button className="article-title-button row-image" aria-label={`Lire : ${article.title}`} onClick={() => openArticle(article.id)}><ArticleImage key={article.id} article={article} className="row-image" /></button><div className="row-copy"><ArticleMeta article={article} /><h3><button className="article-title-button line-clamp-2" onClick={() => openArticle(article.id)}>{article.title}</button></h3>{!article.snippet.startsWith('Aucun aperçu') && <p className="line-clamp-2">{article.snippet}</p>}<span className="category-tag">{categoryName(article.category)}</span></div>{saveButton(article)}</article>)}</div>
            {filteredArticles.length > visibleCount && <div className="feed-load-more"><button className="btn btn-secondary" onClick={() => setVisibleCount(prev => prev + 15)}>Voir plus d’articles<ArrowDown aria-hidden="true" /></button></div>}
          </> : <div className="empty-state"><BookOpen aria-hidden="true" /><h2>{rssError && !articlePool.length ? 'Veille indisponible' : refreshing && !articlePool.length ? 'Collecte en cours…' : hasFilters ? (feedTab === 'unread' && !query && !unread ? 'Tout est lu' : 'Aucun résultat') : savedView ? 'Aucun article enregistré' : 'Aucun article disponible'}</h2><p>{rssError && !articlePool.length ? 'Réessayez le chargement. Vos enregistrements restent conservés.' : refreshing && !articlePool.length ? 'Vous pouvez continuer à travailler pendant la collecte des sources.' : hasFilters ? 'Aucun article ne correspond à cette recherche ou à ces filtres.' : savedView ? 'Enregistrez un article depuis la veille pour le retrouver ici.' : activeFeeds.length ? 'Vos sources n’ont pas encore fourni d’articles. Vous pouvez relancer la collecte.' : 'Ajoutez une source pour commencer votre veille.'}</p>{!(refreshing && !articlePool.length) && <button className="btn btn-secondary" onClick={hasFilters ? resetFilters : savedView ? () => go('veille') : activeFeeds.length || rssError ? () => void loadArticles(true) : addSource}>{hasFilters ? 'Effacer les filtres' : savedView ? 'Voir la veille' : activeFeeds.length || rssError ? 'Réessayer la collecte' : 'Ajouter une source'}</button>}</div>}
        </section><aside className="carnet-aside" aria-label="Notes récentes"><section className="carnet-panel"><div className="carnet-header"><h2><NotebookPen aria-hidden="true" />Notes récentes</h2><span>{posts.length}</span></div>{postsError ? <div className="carnet-load-state"><p>Les notes n’ont pas pu être chargées.</p><button className="btn btn-ghost" onClick={() => void loadPosts()}>Recharger les notes</button></div> : postsLoading && !posts.length ? <p className="carnet-load-state" role="status">Chargement des notes…</p> : posts.length ? [...posts].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0,3).map(post => <button className="carnet-note" key={post.id} onClick={() => openNote(post)}><span className="carnet-note-status"><span className="status-dot" />{statusLabels[post.status]}</span><strong className="line-clamp-2">{post.angle.trim() || 'Note sans titre'}</strong><small>Modifié {relativeDate(post.updatedAt).toLowerCase()}</small></button>) : <button className="carnet-note" onClick={() => void createNote().catch(() => {})}><strong>Aucune note</strong><small>Nouvelle note</small></button>}<div className="carnet-footer"><button onClick={() => go('notes')}>Voir toutes les notes</button><ArrowRight aria-hidden="true" /></div></section><section className="source-summary"><div className="source-summary-heading"><h3>Sources actives</h3><button onClick={() => go('sources')}>Gérer</button></div>{activeFeeds.slice(0,4).map(feed => <button key={feed.id} className="source-summary-row" onClick={() => selectFeed(feed.id)}><span className="source-letter" aria-hidden="true">{feed.name.charAt(0)}</span><span className="source-name">{feed.name.replace(' (France)', '')}</span><Rss size={12} aria-label="Flux activé" style={{ marginLeft: 'auto', color: 'var(--ink-muted)' }} /></button>)}</section></aside></div>}
        <div className="workspace-frame" hidden={view !== 'notes' && view !== 'planning'}><NotesWorkspace ref={notesRef} posts={posts} loading={postsLoading} error={postsError} onRetryLoad={() => void loadPosts()} selectedPostId={selectedPostId} onSelectPost={selectNote} onNewPost={date => createNote(undefined, date)} onSavePost={savePost} onDuplicatePost={duplicatePost} draftStorageKey={`redaction:note-drafts:${owner.email}`} onDeletePost={deletePost} mode={view === 'planning' ? 'planning' : 'notes'} /></div>
        {view === 'transfer' && <TransferWorkspace onDataChanged={handleTransferChanged} beforeTransfer={beforeTransfer} onMutationChange={handleTransferMutation} currentArticles={filteredArticles} initialTarget={transferTarget} requestKey={transferRequest} />}
        {view === 'sources' && <SourceManager feeds={feeds} health={health} loading={feedsLoading} error={feedsError} onRetry={() => void loadFeeds()} onRetryFeed={id => loadArticles(true, id)} onFeedsChange={handleFeedsChange} onSelectFeed={selectFeed} initialAddOpen={openAdd} addRequestKey={addRequestKey} />}
      </main>
    </div>
    <ArticleReader article={activeArticle} onClose={closeArticle} onToggleSave={toggleSave} onToggleRead={toggleRead} onCreateNote={article => createNote(article)} notes={posts} notesLoading={postsLoading} notesError={postsError} onRetryNotes={() => void loadPosts()} onAttachToNote={attachToNote} onPrevious={readingIndex > 0 ? () => moveArticle(-1) : undefined} onNext={readingIndex >= 0 && readingIndex < readingIds.length - 1 ? () => moveArticle(1) : undefined} onReadAndNext={readAndNext} position={readingIndex >= 0 ? { current: readingIndex + 1, total: readingIds.length } : undefined} />
    {toast && <div className="toast" role="status"><Check aria-hidden="true" />{toast}</div>}
  </div>;
}
