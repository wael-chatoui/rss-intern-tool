'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowDownUp, ArrowRight, Bookmark, BookOpen, CalendarDays, Check, ChevronRight, CircleAlert, LayoutList, Menu, Newspaper, NotebookPen, Plus, RefreshCw, Rss, Search, SlidersHorizontal, X } from 'lucide-react';
import { FeedSource, FashionCategory, Language, RSSArticle, SocialPost } from '@/types';
import { ArticleReader } from '@/components/Newsroom/ArticleReader';
import { SourceManager } from '@/components/Newsroom/SourceManager';
import { NotesWorkspace, type NotesWorkspaceHandle } from '@/components/Newsroom/NotesWorkspace';
import { TransferWorkspace } from '@/components/Newsroom/TransferWorkspace';
import type { TransferData, TransferTarget } from '@/lib/transfer-formats';
import { useDialogAccessibility } from '@/components/Newsroom/dialog';
import { SessionControls } from '@/components/Auth/SessionControls';
import type { Owner } from '@/lib/auth-store';
import { authenticatedFetch } from '@/lib/auth-client';

type View = 'veille' | 'saved' | 'notes' | 'planning' | 'sources' | 'transfer';
type FeedTab = 'all' | 'unread' | 'saved';
const categories: { id: FashionCategory; label: string }[] = [
  { id: 'all', label: 'Toutes les thématiques' }, { id: 'haute-couture', label: 'Haute couture' }, { id: 'business', label: 'Économie & business' }, { id: 'streetwear', label: 'Streetwear' }, { id: 'trends', label: 'Culture & tendances' }, { id: 'sustainability', label: 'Environnement & RSE' },
];
const statusLabels = { idea: 'Idée', in_progress: 'En rédaction', ready: 'Prêt à publier', published: 'Publié' };
const viewLabels: Record<View, string> = { veille: 'Veille RSS', saved: 'Articles enregistrés', notes: 'Notes & rédaction', planning: 'Planning éditorial', sources: 'Sources RSS', transfer: 'Import / export' };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(url, { cache: 'no-store', ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Une erreur est survenue. Réessayez.');
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

export default function NewsroomApp({ owner }: { owner: Owner }) {
  const [view, setView] = useState<View>('veille');
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [articles, setArticles] = useState<RSSArticle[]>([]);
  const [savedArticles, setSavedArticles] = useState<RSSArticle[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const [feedTab, setFeedTab] = useState<FeedTab>('all');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FashionCategory>('all');
  const [language, setLanguage] = useState<Language>('all');
  const [feedId, setFeedId] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [visibleCount, setVisibleCount] = useState(15);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [transferTarget, setTransferTarget] = useState<TransferTarget>('notes');
  const [transferRequest, setTransferRequest] = useState(0);
  const [transferMutating, setTransferMutating] = useState(false);
  const transferMutationRef = useRef(false);
  const notesRef = useRef<NotesWorkspaceHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const topbarRef = useRef<HTMLElement>(null);
  const pendingArticles = useRef(new Set<string>());
  const initialLoad = useRef(false);
  const loadSequence = useRef(0);
  const go = useCallback((next: View) => {
    if (transferMutationRef.current) return;
    setView(next); setMobileMenu(false); setOpenAdd(false); window.scrollTo({ top: 0 });
  }, []);
  const handleTransferMutation = useCallback((active: boolean) => {
    transferMutationRef.current = active;
    setTransferMutating(active);
    if (active) { setMobileMenu(false); setActiveArticleId(null); }
  }, []);
  useEffect(() => {
    if (sidebarRef.current) sidebarRef.current.inert = transferMutating;
    if (topbarRef.current) topbarRef.current.inert = transferMutating;
  }, [transferMutating]);
  const closeMobileMenu = useCallback(() => setMobileMenu(false), []);
  useDialogAccessibility(mobileMenu, sidebarRef, closeMobileMenu);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4200); return () => clearTimeout(timer); }, [toast]);

  const loadArticles = useCallback(async (refresh = false) => {
    const sequence = ++loadSequence.current;
    if (refresh) setRefreshing(true);
    try {
      const data = await request<{ articles: RSSArticle[]; savedArticles?: RSSArticle[]; lastFetchedAt?: string; warnings?: string[] }>(`/api/rss${refresh ? '?refresh=true' : ''}`);
      if (sequence !== loadSequence.current) return;
      setArticles(data.articles); setSavedArticles(data.savedArticles || []); setLastFetched(data.lastFetchedAt || null); setWarnings(data.warnings || []); setError('');
      if (refresh) notify(data.warnings?.length ? 'Veille actualisée. Certaines sources sont indisponibles.' : 'Flux actualisés.');
    } catch (e) { if (sequence === loadSequence.current) setError(e instanceof Error ? e.message : 'Impossible de charger la veille.'); }
    finally { if (sequence === loadSequence.current) { setLoading(false); setRefreshing(false); } }
  }, [notify]);
  const loadFeeds = useCallback(async () => { const data = await request<{ feeds: FeedSource[] }>('/api/feeds'); setFeeds(data.feeds); }, []);
  const handleFeedsChange = useCallback(async () => { await loadFeeds(); await loadArticles(true); }, [loadFeeds, loadArticles]);
  useEffect(() => {
    if (initialLoad.current) return;
    initialLoad.current = true;
    loadFeeds().catch(() => setError('Impossible de charger les sources. Réessayez.'));
    request<{ posts: SocialPost[] }>('/api/posts').then(data => setPosts(data.posts)).catch(() => setError('Impossible de charger les notes. Réessayez.'));
    void loadArticles();
  }, [loadArticles, loadFeeds]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (transferMutationRef.current) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); go('veille'); requestAnimationFrame(() => searchRef.current?.focus()); }
      if (event.key === 'Escape') setMobileMenu(false);
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [go]);
  useEffect(() => { setVisibleCount(15); }, [query, category, language, feedId, feedTab, view]);

  const articlePool = useMemo(() => {
    const pool = new Map(articles.map(article => [article.id, article]));
    savedArticles.forEach(article => { if (!pool.has(article.id)) pool.set(article.id, article); });
    return Array.from(pool.values());
  }, [articles, savedArticles]);
  const activeArticle = articlePool.find(article => article.id === activeArticleId) || null;
  const unread = articles.filter(article => !article.read).length;
  const activeFeeds = feeds.filter(feed => feed.enabled);
  const savedView = view === 'saved' || feedTab === 'saved';
  const filteredArticles = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('fr');
    return (savedView ? articlePool.filter(article => article.saved) : articles).filter(article =>
      (feedTab !== 'unread' || savedView || !article.read) &&
      (category === 'all' || article.category === category) &&
      (language === 'all' || article.feedLanguage === language) &&
      (feedId === 'all' || article.feedId === feedId) &&
      (!needle || `${article.title} ${article.snippet} ${article.feedName} ${article.author || ''}`.toLocaleLowerCase('fr').includes(needle))
    );
  }, [articles, articlePool, savedView, feedTab, category, language, feedId, query]);
  const resetFilters = () => { setQuery(''); setCategory('all'); setLanguage('all'); setFeedId('all'); setFeedTab('all'); };
  const selectFeed = (id: string) => { go('veille'); setFeedId(id); setCategory('all'); setLanguage('all'); setQuery(''); setFeedTab('all'); };

  const toggleSave = async (article: RSSArticle) => {
    if (pendingArticles.current.has(article.id)) return;
    pendingArticles.current.add(article.id);
    try {
      const data = await request<{ isSaved: boolean; savedArticles: RSSArticle[] }>('/api/articles/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(article) });
      setArticles(prev => prev.map(item => item.id === article.id ? { ...item, saved: data.isSaved } : item));
      setSavedArticles(data.savedArticles); notify(data.isSaved ? 'Article enregistré.' : 'Article retiré des enregistrements.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Impossible d’enregistrer cet article.'); throw e; }
    finally { pendingArticles.current.delete(article.id); }
  };
  const toggleRead = async (article: RSSArticle) => {
    const data = await request<{ read: boolean }>('/api/articles/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articleId: article.id, read: !article.read }) });
    setArticles(prev => prev.map(item => item.id === article.id ? { ...item, read: data.read } : item));
    setSavedArticles(prev => prev.map(item => item.id === article.id ? { ...item, read: data.read } : item));
  };
  const createNote = async (article?: RSSArticle, scheduledDate?: string) => {
    if (creating || transferMutationRef.current) return;
    setCreating(true);
    try {
      const data = await request<{ post: SocialPost }>('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        angle: article?.title || 'Note sans titre', notes: article?.snippet && !article.snippet.startsWith('Aucun aperçu') ? article.snippet : '',
        articleId: article?.id, sourceArticleTitle: article?.title, sourceArticleLink: article?.link, sourceArticleFeed: article?.feedName,
        status: 'idea', tags: [], platforms: [], scheduledDate, scheduledTime: scheduledDate ? '09:00' : undefined,
      }) });
      setPosts(prev => [data.post, ...prev]); setSelectedPostId(data.post.id); setActiveArticleId(null); go('notes'); notify('Note créée.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Impossible de créer une note.'); throw e; }
    finally { setCreating(false); }
  };
  const savePost = useCallback(async (post: SocialPost) => {
    const data = await request<{ post: SocialPost }>('/api/posts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(post) });
    setPosts(prev => prev.map(item => item.id === data.post.id ? data.post : item));
  }, []);
  const deletePost = useCallback(async (id: string) => {
    await request(`/api/posts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    setPosts(prev => prev.filter(item => item.id !== id)); setSelectedPostId(prev => prev === id ? null : prev); notify('Note supprimée.');
  }, [notify]);
  const openNote = (post: SocialPost) => { setSelectedPostId(post.id); go('notes'); };
  const beforeTransfer = useCallback(async () => { await notesRef.current?.flush(); }, []);
  useEffect(() => {
    const expired = () => setSessionExpired(true);
    window.addEventListener('redaction-session-expired', expired);
    return () => window.removeEventListener('redaction-session-expired', expired);
  }, []);
  async function checkSession() {
    try { if ((await fetch('/api/auth/session', { cache: 'no-store' })).ok) setSessionExpired(false); }
    catch { /* Keep the reconnection notice visible until the server confirms it. */ }
  }
  const openTransfer = (target: TransferTarget) => { setTransferTarget(target); setTransferRequest(value => value + 1); go('transfer'); };
  const handleTransferChanged = useCallback(async () => {
    loadSequence.current += 1;
    setRefreshing(false); setLoading(false);
    const { data } = await request<{ data: TransferData }>('/api/transfer');
    setFeeds(data.feeds || []); setPosts(data.posts || []); setArticles(data.cachedArticles || []); setSavedArticles(data.savedArticles || []);
    setLastFetched(data.lastFetchedAt || null); setSelectedPostId(null); setActiveArticleId(null); setWarnings([]);
  }, []);
  const addSource = () => { go('sources'); setOpenAdd(true); };
  const featured = !compact ? filteredArticles[0] : undefined;
  const rows = filteredArticles.slice(featured ? 1 : 0, visibleCount);
  const categoryName = (value: FashionCategory) => categories.find(cat => cat.id === value)?.label || value;
  const saveButton = (article: RSSArticle) => <button className={`icon-btn save-article ${article.saved ? 'saved' : ''}`} aria-label={article.saved ? `Retirer de la sélection : ${article.title}` : `Enregistrer : ${article.title}`} aria-pressed={!!article.saved} onClick={() => void toggleSave(article).catch(() => {})}><Bookmark aria-hidden="true" /></button>;

  return <div className="newsroom">
    <a className="skip-link" href="#main">Aller au contenu</a>
    {mobileMenu && <button className="sidebar-scrim" aria-label="Fermer la navigation" onClick={() => setMobileMenu(false)} />}
    <aside ref={sidebarRef} className={`sidebar ${mobileMenu ? 'is-open' : ''}`} aria-label="Navigation principale" role={mobileMenu ? 'dialog' : undefined} aria-modal={mobileMenu ? true : undefined} tabIndex={mobileMenu ? -1 : undefined}>
      <a className="brand" href="#main" onClick={() => go('veille')}><span className="brand-mark">r.</span><span className="brand-name">La rédaction</span></a>
      <span className="nav-label">NAVIGATION</span>
      <nav>{([
        { id: 'veille', label: 'Veille RSS', icon: Newspaper, count: unread },
        { id: 'saved', label: 'Enregistrés', icon: Bookmark, count: savedArticles.length },
        { id: 'notes', label: 'Notes & rédaction', icon: NotebookPen, count: posts.length },
        { id: 'planning', label: 'Planning éditorial', icon: CalendarDays },
        { id: 'transfer', label: 'Import / export', icon: ArrowDownUp },
      ] as const).map(item => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} aria-current={view === item.id ? 'page' : undefined} onClick={() => { go(item.id); if (item.id === 'veille' || item.id === 'saved') { setFeedTab('all'); resetFilters(); } }}><item.icon aria-hidden="true" /><span>{item.label}</span>{'count' in item && <span className="nav-count">{item.count}</span>}</button>)}</nav>
      <div className="sidebar-divider" />
      <button className={`nav-item ${view === 'sources' ? 'active' : ''}`} aria-current={view === 'sources' ? 'page' : undefined} onClick={() => go('sources')}><Rss aria-hidden="true" /><span>Sources RSS</span><span className="nav-count">{activeFeeds.length}</span></button>
      <div className="sidebar-sources">{activeFeeds.slice(0, 5).map(feed => <button className={`sidebar-source ${feedId === feed.id && view === 'veille' ? 'active' : ''}`} key={feed.id} onClick={() => selectFeed(feed.id)}><span className="source-letter" aria-hidden="true">{feed.name.charAt(0)}</span><span className="source-name">{feed.name.replace(' (France)', '')}</span></button>)}</div>
      <button className="btn btn-ghost sidebar-add" onClick={addSource}><Plus aria-hidden="true" />Ajouter une source</button>
      <div className="sidebar-footer"><SessionControls owner={owner} beforeLogout={beforeTransfer} disabled={transferMutating} /></div>
    </aside>
    <div className="app-body">
      <header ref={topbarRef} className="topbar"><div className="breadcrumb"><button className="icon-btn mobile-menu" aria-label={mobileMenu ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={mobileMenu} onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X /> : <Menu />}</button><span>Rédaction</span><ChevronRight aria-hidden="true" /><strong>{viewLabels[view]}</strong></div><div className="topbar-right"><span className="sync-status"><span className="status-dot" />{loading ? 'Chargement des sources' : lastFetched ? `Synchronisé ${relativeDate(lastFetched).toLowerCase()}` : `${activeFeeds.length} sources actives`}</span><button className="btn btn-ghost" disabled={refreshing} onClick={() => void loadArticles(true)}><RefreshCw className={refreshing ? 'is-spinning' : ''} aria-hidden="true" />{refreshing ? 'Actualisation…' : 'Actualiser'}</button></div></header>
      <main id="main" className="page-content" tabIndex={-1} aria-busy={transferMutating}>
        <div className="page-heading"><div><h1>{viewLabels[view]}</h1></div>{view !== 'transfer' && <div className="page-actions"><button className="btn btn-secondary" aria-label="Importer ou exporter" onClick={() => openTransfer(view === 'sources' ? 'feeds' : view === 'notes' || view === 'planning' ? 'notes' : 'articles')}><ArrowDownUp aria-hidden="true" /><span>Import / export</span></button>{view !== 'sources' && <button className="btn btn-primary" aria-label="Nouvelle note" disabled={creating} onClick={() => void createNote().catch(() => {})}><Plus aria-hidden="true" /><span>{creating ? 'Création…' : 'Nouvelle note'}</span></button>}</div>}</div>
        {sessionExpired && <div className="error-banner" role="alert"><CircleAlert aria-hidden="true" /><span>Votre session a expiré. Gardez cette page ouverte pour conserver vos modifications. <a href="/connexion?expired=1" target="_blank" rel="noopener noreferrer">Se reconnecter dans un nouvel onglet</a>, puis réessayer l’enregistrement.</span><button onClick={() => void checkSession()}>Vérifier la connexion</button></div>}
        {error && <div className="error-banner" role="alert"><CircleAlert aria-hidden="true" /><span>{error}{error.includes('session a expiré') && <> <a href="/connexion?expired=1" target="_blank" rel="noopener noreferrer">Se reconnecter dans un nouvel onglet</a>, puis réessayer ici.</>}</span><button onClick={() => { setError(''); void loadFeeds().catch(() => {}); void loadArticles(); }}>Réessayer</button><button className="icon-btn" aria-label="Fermer le message" onClick={() => setError('')}><X /></button></div>}
        {(view === 'veille' || view === 'saved') && <div className="feed-layout"><section className="feed-main" aria-label="Articles RSS">
          <div className="feed-tabs" aria-label="Filtrer les articles">{([{ id: 'all', label: 'Tous les articles', count: view === 'saved' ? savedArticles.length : articles.length }, { id: 'unread', label: 'À lire', count: unread }, { id: 'saved', label: 'Enregistrés', count: savedArticles.length }] as const).filter(item => view !== 'saved' || item.id === 'all').map(item => <button key={item.id} className={`feed-tab ${feedTab === item.id ? 'active' : ''}`} aria-pressed={feedTab === item.id} onClick={() => setFeedTab(item.id)}>{view === 'saved' ? 'Ma sélection' : item.label}<span className="feed-tab-count">{item.count}</span></button>)}</div>
          <div className="feed-toolbar"><div className="search-control"><Search aria-hidden="true" /><input ref={searchRef} aria-label="Rechercher dans les articles" placeholder="Rechercher un sujet, une source…" value={query} onChange={e => setQuery(e.target.value)} />{query ? <button className="icon-btn" aria-label="Effacer la recherche" onClick={() => setQuery('')}><X /></button> : <kbd>⌘ K</kbd>}</div><button className={`btn btn-secondary filter-toggle ${category !== 'all' || language !== 'all' || feedId !== 'all' || filterOpen ? 'is-active' : ''}`} aria-label="Filtres" aria-expanded={filterOpen} aria-controls="feed-filters" onClick={() => setFilterOpen(!filterOpen)}><SlidersHorizontal aria-hidden="true" /><span>Filtres</span></button><div className="view-toggle" aria-label="Affichage des articles"><button className={`icon-btn ${!compact ? 'active' : ''}`} aria-label="Affichage magazine" aria-pressed={!compact} onClick={() => setCompact(false)}><Newspaper /></button><button className={`icon-btn ${compact ? 'active' : ''}`} aria-label="Affichage liste" aria-pressed={compact} onClick={() => setCompact(true)}><LayoutList /></button></div></div>
          {filterOpen && <div className="filter-panel" id="feed-filters"><label>Thématique<select className="field" value={category} onChange={e => setCategory(e.target.value as FashionCategory)}>{categories.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}</select></label><label>Langue<select className="field" value={language} onChange={e => setLanguage(e.target.value as Language)}><option value="all">Toutes les langues</option><option value="fr">Français</option><option value="en">Anglais</option></select></label><label>Source<select className="field" value={feedId} onChange={e => setFeedId(e.target.value)}><option value="all">Toutes les sources</option>{feeds.map(feed => <option key={feed.id} value={feed.id}>{feed.name}</option>)}</select></label><button className="filter-reset" onClick={resetFilters}>Réinitialiser les filtres</button></div>}
          {warnings.length > 0 && <div className="warning-banner"><CircleAlert aria-hidden="true" /><details><summary>{warnings.length} source{warnings.length > 1 ? 's' : ''} indisponible{warnings.length > 1 ? 's' : ''}. Les articles conservés restent accessibles.</summary>{warnings.map(warning => <p key={warning}>{warning}</p>)}</details></div>}
          {loading ? <div aria-busy="true" aria-label="Chargement des articles"><div className="feed-skeleton feature" /><div className="feed-skeleton" /><div className="feed-skeleton" /><span className="sr-only">Chargement des articles…</span></div> : filteredArticles.length ? <>
            <div className="feed-section-caption"><strong>{feedId !== 'all' ? feeds.find(feed => feed.id === feedId)?.name || 'Sélection' : savedView ? 'Articles enregistrés' : query ? 'Résultats' : 'Articles récents'}</strong><span>{filteredArticles.length} article{filteredArticles.length > 1 ? 's' : ''} · Plus récents d’abord</span></div>
            {featured && <article className="featured-article"><button className="article-title-button" aria-label={`Lire : ${featured.title}`} onClick={() => setActiveArticleId(featured.id)}><ArticleImage key={featured.id} article={featured} className="featured-image" /></button><div className="featured-copy"><ArticleMeta article={featured} /><h2><button className="article-title-button line-clamp-3" onClick={() => setActiveArticleId(featured.id)}>{featured.title}</button></h2><p className="line-clamp-3">{featured.snippet.startsWith('Aucun aperçu') ? 'Aucun extrait disponible.' : featured.snippet}</p><span className="category-tag">{categoryName(featured.category)}</span><div className="featured-bottom"><button className="read-link" onClick={() => setActiveArticleId(featured.id)}>Lire l’article<ArrowRight aria-hidden="true" /></button>{saveButton(featured)}</div></div></article>}
            <div className="feed-section-caption"><strong>{featured ? 'Autres articles' : 'Articles'}</strong><span>{savedView ? 'Enregistrés' : `${activeFeeds.length} sources actives`}</span></div>
            <div className={`article-list ${compact ? 'compact' : ''}`}>{rows.map(article => <article key={article.id} className={`article-row ${article.read ? 'is-read' : ''}`}><button className="article-title-button row-image" aria-label={`Lire : ${article.title}`} onClick={() => setActiveArticleId(article.id)}><ArticleImage key={article.id} article={article} className="row-image" /></button><div className="row-copy"><ArticleMeta article={article} /><h3><button className="article-title-button line-clamp-2" onClick={() => setActiveArticleId(article.id)}>{article.title}</button></h3>{!article.snippet.startsWith('Aucun aperçu') && <p className="line-clamp-2">{article.snippet}</p>}<span className="category-tag">{categoryName(article.category)}</span></div>{saveButton(article)}</article>)}</div>
            {filteredArticles.length > visibleCount && <div className="feed-load-more"><button className="btn btn-secondary" onClick={() => setVisibleCount(prev => prev + 15)}>Voir plus d’articles<ArrowDown aria-hidden="true" /></button></div>}
          </> : <div className="empty-state"><BookOpen aria-hidden="true" /><h2>{savedView ? 'Aucun article enregistré' : 'Aucun article'}</h2><p>{savedView ? 'Les articles enregistrés apparaissent ici.' : query || category !== 'all' || language !== 'all' || feedId !== 'all' ? 'Modifiez la recherche ou les filtres.' : 'Ajoutez une source RSS pour charger des articles.'}</p><button className="btn btn-secondary" onClick={savedView ? () => { go('veille'); resetFilters(); } : query || category !== 'all' || language !== 'all' || feedId !== 'all' ? resetFilters : addSource}>{savedView ? 'Voir les articles' : query || category !== 'all' || language !== 'all' || feedId !== 'all' ? 'Effacer les filtres' : 'Ajouter une source'}</button></div>}
        </section><aside className="carnet-aside" aria-label="Notes récentes"><section className="carnet-panel"><div className="carnet-header"><h2><NotebookPen aria-hidden="true" />Notes récentes</h2><span>{posts.length}</span></div>{posts.length ? [...posts].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0,3).map(post => <button className="carnet-note" key={post.id} onClick={() => openNote(post)}><span className="carnet-note-status"><span className="status-dot" />{statusLabels[post.status]}</span><strong className="line-clamp-2">{post.angle}</strong><small>Modifié {relativeDate(post.updatedAt).toLowerCase()}</small></button>) : <button className="carnet-note" onClick={() => void createNote().catch(() => {})}><strong>Aucune note</strong><small>Nouvelle note</small></button>}<div className="carnet-footer"><button onClick={() => go('notes')}>Voir toutes les notes</button><ArrowRight aria-hidden="true" /></div></section><section className="source-summary"><div className="source-summary-heading"><h3>Sources actives</h3><button onClick={() => go('sources')}>Gérer</button></div>{activeFeeds.slice(0,4).map(feed => <button key={feed.id} className="source-summary-row" onClick={() => selectFeed(feed.id)}><span className="source-letter" aria-hidden="true">{feed.name.charAt(0)}</span><span className="source-name">{feed.name.replace(' (France)', '')}</span><Rss size={12} aria-label="Flux activé" style={{ marginLeft: 'auto', color: 'var(--ink-muted)' }} /></button>)}</section></aside></div>}
        <div className="workspace-frame" hidden={view !== 'notes' && view !== 'planning'}><NotesWorkspace ref={notesRef} posts={posts} selectedPostId={selectedPostId} onSelectPost={id => { setSelectedPostId(id); if (id) go('notes'); }} onNewPost={date => createNote(undefined, date)} onSavePost={savePost} onDeletePost={deletePost} mode={view === 'planning' ? 'planning' : 'notes'} /></div>
        {view === 'transfer' && <TransferWorkspace onDataChanged={handleTransferChanged} beforeTransfer={beforeTransfer} onMutationChange={handleTransferMutation} currentArticles={filteredArticles} initialTarget={transferTarget} requestKey={transferRequest} />}
        {view === 'sources' && <SourceManager feeds={feeds} onFeedsChange={handleFeedsChange} onSelectFeed={selectFeed} initialAddOpen={openAdd} />}
      </main>
    </div>
    <ArticleReader article={activeArticle} onClose={() => setActiveArticleId(null)} onToggleSave={toggleSave} onToggleRead={toggleRead} onCreateNote={article => createNote(article)} />
    {toast && <div className="toast" role="status"><Check aria-hidden="true" />{toast}</div>}
  </div>;
}
