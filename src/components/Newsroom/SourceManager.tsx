'use client';

import { authenticatedFetch } from '@/lib/auth-client';

import { FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, Check, ChevronRight, Loader2, Plus, Rss, Search, Trash2, X } from 'lucide-react';
import { FashionCategory, FeedSource, FeedHealth } from '@/types';
import { safeWebUrl, useDialogAccessibility } from './dialog';
import './newsroom-dialogs.css';

interface SourceManagerProps {
  feeds: FeedSource[];
  onFeedsChange: (feeds?: FeedSource[]) => Promise<void>;
  health?: FeedHealth[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  onRetryFeed?: (id: string) => Promise<void>;
  onSelectFeed: (id: string) => void;
  initialAddOpen?: boolean;
  addRequestKey?: number;
}

const categories: { value: FashionCategory; label: string }[] = [
  { value: 'general', label: 'Général' },
  { value: 'haute-couture', label: 'Haute couture' },
  { value: 'business', label: 'Économie & industrie' },
  { value: 'streetwear', label: 'Streetwear' },
  { value: 'trends', label: 'Tendances & culture' },
  { value: 'sustainability', label: 'Environnement & société' },
];

function feedDomain(feed: FeedSource) {
  try { return new URL(feed.website || feed.url).hostname.replace(/^www\./, ''); }
  catch { return feed.url; }
}

export function SourceManager({ feeds, onFeedsChange, onSelectFeed, initialAddOpen = false, addRequestKey = 0, health = [], loading = false, error: loadError, onRetry, onRetryFeed }: SourceManagerProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [isAddOpen, setAddOpen] = useState(initialAddOpen);
  const [pendingIds, setPendingIds] = useState(new Set<string>());
  const pendingRef = useRef(new Set<string>());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [website, setWebsite] = useState('');
  const [category, setCategory] = useState<FashionCategory>('general');
  const [language, setLanguage] = useState<'fr' | 'en'>('fr');
  const dialogRef = useRef<HTMLDivElement>(null);
  const formId = useId();
  const closeAdd = () => { if (!isSubmitting) setAddOpen(false); };
  useDialogAccessibility(isAddOpen, dialogRef, closeAdd);
  useEffect(() => { if (initialAddOpen) setAddOpen(true); }, [initialAddOpen, addRequestKey]);

  const activeCount = feeds.filter(feed => feed.enabled).length;
  const healthById = useMemo(() => new Map(health.map(item => [item.feedId, item])), [health]);
  const setPending = (id: string, active: boolean) => {
    if (active) pendingRef.current.add(id); else pendingRef.current.delete(id);
    setPendingIds(new Set(pendingRef.current));
  };
  const syncFeeds = (updatedFeeds?: FeedSource[]) => {
    void onFeedsChange(updatedFeeds).catch(() => setError('La source a bien été enregistrée. L’actualisation de la veille a échoué, vous pouvez la relancer.'));
  };
  const retryFeed = async (id: string) => {
    if (!onRetryFeed || pendingRef.current.has(id)) return;
    setPending(id, true); setError('');
    try { await onRetryFeed(id); }
    catch { setError('La collecte n’a pas pu être relancée. Réessayez.'); }
    finally { setPending(id, false); }
  };
  const collectedDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(date);
  };
  const filteredFeeds = useMemo(() => feeds.filter(feed => {
    const categoryName = categories.find(item => item.value === feed.category)?.label || feed.category;
    const matchesQuery = `${feed.name} ${feedDomain(feed)} ${categoryName}`.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr').trim());
    return matchesQuery && (filter === 'all' || (filter === 'active' ? feed.enabled : !feed.enabled));
  }), [feeds, query, filter]);

  const updateFeed = async (feed: FeedSource, remove = false) => {
    if (pendingRef.current.has(feed.id)) return;
    setPending(feed.id, true);
    setError('');
    setNotice('');
    try {
      const response = await authenticatedFetch(remove ? `/api/feeds?id=${encodeURIComponent(feed.id)}` : '/api/feeds', {
        method: remove ? 'DELETE' : 'PATCH',
        ...(!remove && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: feed.id, enabled: !feed.enabled }) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'La source n’a pas pu être mise à jour. Réessayez.');
      setDeleteId(null);
      setNotice(remove ? `${feed.name} a été retirée des sources.` : `${feed.name} ${feed.enabled ? 'est en pause.' : 'est à nouveau active.'}`);
      syncFeeds(result.feeds);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La source n’a pas pu être mise à jour. Réessayez.');
    } finally { setPending(feed.id, false); }
  };

  const addFeed = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setFormError('');
    if (!safeWebUrl(url.trim()) || (website.trim() && !safeWebUrl(website.trim()))) {
      setFormError('Utilisez une adresse complète commençant par https:// ou http://.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await authenticatedFetch('/api/feeds', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), url: url.trim(), website: website.trim() || undefined, category, language }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible d’ajouter cette source. Réessayez.');
      setAddOpen(false);
      setNotice(`${result.feed.name} a été ajoutée aux sources RSS.`);
      setName(''); setUrl(''); setWebsite(''); setCategory('general'); setLanguage('fr');
      syncFeeds(result.feeds);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Impossible d’ajouter cette source. Réessayez.');
    } finally { setSubmitting(false); }
  };

  return (
    <section className="sources-page" aria-labelledby="sources-title">
      <div className="sources-heading">
        <div>
          <h2 id="sources-title">Sources RSS</h2>
        </div>
        <button className="btn btn-primary" onClick={() => { setFormError(''); setAddOpen(true); }}>
          <Plus size={17} aria-hidden="true" /> Ajouter une source RSS
        </button>
      </div>

      <div className="sources-toolbar">
        <div className="sources-filters" role="group" aria-label="Filtrer les sources">
          {([
            ['all', 'Toutes', feeds.length], ['active', 'Actives', activeCount], ['paused', 'En pause', feeds.length - activeCount],
          ] as const).map(([value, label, count]) => (
            <button key={value} aria-pressed={filter === value} className={`sources-filter ${filter === value ? 'is-active' : ''}`} onClick={() => setFilter(value)}>
              {label}<span>{count}</span>
            </button>
          ))}
        </div>
        <div className="sources-search">
          <Search size={17} aria-hidden="true" />
          <input type="search" aria-label="Rechercher une source" placeholder="Rechercher une source…" value={query} onChange={event => setQuery(event.target.value)} />
        </div>
      </div>
      {loadError && <div className="dialog-message dialog-message-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{loadError}</span>{onRetry && <button className="sources-retry" onClick={onRetry}>Réessayer</button>}</div>}
      {error && <p className="dialog-message dialog-message-error" role="alert"><AlertCircle size={17} aria-hidden="true" />{error}</p>}
      <p className="sources-live" role="status">{notice}</p>

      {loading && feeds.length === 0 ? <div className="sources-loading" role="status"><Loader2 size={18} className="dialog-spinner" aria-hidden="true" />Chargement des sources…</div> : loadError && feeds.length === 0 ? null : filteredFeeds.length ? (
        <div className="sources-list">
          <div className="sources-list-head" aria-hidden="true"><span>Source</span><span>Thématique</span><span>Collecte</span><span /></div>
          {filteredFeeds.map(feed => {
            const isPending = pendingIds.has(feed.id);
            const feedHealth = healthById.get(feed.id);
            const unavailable = feed.enabled && feedHealth?.status === 'error';
            const site = safeWebUrl(feed.website || feed.url);
            return (
              <div className={`sources-row ${!feed.enabled ? 'is-paused' : ''}`} key={feed.id}>
                <div className="sources-identity">
                  <span className="sources-mark" aria-hidden="true">{feed.name.trim().slice(0, 1).toLocaleUpperCase('fr')}</span>
                  <div>
                    <button className="sources-name" onClick={() => onSelectFeed(feed.id)}>{feed.name}<ChevronRight size={14} aria-hidden="true" /></button>
                    <span className="sources-domain">{feedDomain(feed)} <span className="sources-language">{feed.language.toUpperCase()}</span></span>
                    <div className={`sources-health ${unavailable ? 'has-error' : ''}`}>
                      <span>{!feed.enabled ? 'Collecte en pause' : unavailable ? `Collecte impossible : ${feedHealth?.error || 'source indisponible'}` : feedHealth?.status === 'ok' ? 'Collecte à jour' : 'Pas encore de collecte'}</span>
                      {feedHealth?.lastSuccessAt ? <small>Dernier succès : {collectedDate(feedHealth.lastSuccessAt)}</small> : feedHealth?.lastAttemptAt ? <small>Dernière tentative : {collectedDate(feedHealth.lastAttemptAt)}</small> : null}
                      {unavailable && onRetryFeed && <button className="sources-retry" disabled={isPending} onClick={() => void retryFeed(feed.id)}>{isPending ? 'Collecte en cours…' : 'Réessayer cette source'}</button>}
                    </div>
                  </div>
                </div>
                <span className="sources-category">{categories.find(item => item.value === feed.category)?.label || feed.category}</span>
                <button
                  className="sources-toggle"
                  type="button"
                  role="switch"
                  aria-checked={feed.enabled}
                  aria-label={`${feed.enabled ? 'Mettre en pause' : 'Activer'} ${feed.name}`}
                  disabled={isPending}
                  onClick={() => updateFeed(feed)}
                >
                  <span className={`sources-switch ${feed.enabled ? 'is-on' : ''}`} aria-hidden="true"><span>{isPending && <Loader2 size={10} className="dialog-spinner" />}</span></span>
                  <span>{feed.enabled ? 'Active' : 'En pause'}</span>
                </button>
                <div className="sources-actions">
                  {site && <a className="icon-btn" href={site} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir le site de ${feed.name}`} title="Ouvrir le site"><ArrowUpRight size={17} aria-hidden="true" /></a>}
                  <button className="icon-btn sources-remove" disabled={isPending} onClick={() => setDeleteId(deleteId === feed.id ? null : feed.id)} aria-label={`Retirer ${feed.name}`} aria-expanded={deleteId === feed.id} title="Retirer la source"><Trash2 size={15} aria-hidden="true" /></button>
                </div>
                {deleteId === feed.id && <div className="sources-confirm">
                  <div><strong>Retirer {feed.name} ?</strong><p>Cette source ne sera plus collectée. Vos articles enregistrés et vos notes seront conservés.</p></div>
                  <div className="sources-confirm-actions"><button className="btn btn-secondary" disabled={isPending} onClick={() => setDeleteId(null)}>Annuler</button><button className="btn sources-danger" disabled={isPending} onClick={() => updateFeed(feed, true)}>{isPending ? <Loader2 size={15} className="dialog-spinner" aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />}Retirer la source</button></div>
                </div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="sources-empty"><Rss size={28} strokeWidth={1.4} aria-hidden="true" /><h2>{query || filter !== 'all' ? 'Aucune source trouvée' : 'Aucune source RSS'}</h2><p>{query ? 'Essayez un autre nom ou une autre thématique.' : filter !== 'all' ? 'Modifiez le filtre pour retrouver vos sources.' : 'Ajoutez le flux RSS d’un média pour commencer à suivre ses articles.'}</p><button className="btn btn-secondary" onClick={() => query || filter !== 'all' ? (setQuery(''), setFilter('all')) : setAddOpen(true)}>{query || filter !== 'all' ? 'Afficher toutes les sources' : 'Ajouter une source RSS'}</button></div>
      )}
      <div className="sources-footnote"><Rss size={15} aria-hidden="true" /><p>La collecte rassemble les articles de vos sources actives. Mettez une source en pause pour l’exclure temporairement.</p></div>

      {isAddOpen && <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeAdd(); }}>
        <div className="dialog-panel sources-add-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${formId}-title`} aria-describedby={`${formId}-description`} tabIndex={-1}>
          <header className="dialog-header"><span className="dialog-symbol"><Rss size={20} aria-hidden="true" /></span><button className="icon-btn" aria-label="Fermer l’ajout de source" onClick={closeAdd} disabled={isSubmitting}><X size={20} aria-hidden="true" /></button></header>
          <div className="dialog-intro"><h2 id={`${formId}-title`}>Ajouter une source RSS</h2><p id={`${formId}-description`}>Collez l’adresse d’un site ou d’un flux RSS. Le nom sera proposé automatiquement.</p></div>
          <form onSubmit={addFeed} className="sources-form">
            {formError && <p id={`${formId}-error`} className="dialog-message dialog-message-error" role="alert"><AlertCircle size={17} aria-hidden="true" />{formError}</p>}
            <label className="dialog-field" htmlFor={`${formId}-url`}>Adresse du site ou du flux RSS<input data-dialog-autofocus id={`${formId}-url`} required type="url" placeholder="https://media.fr" value={url} onChange={event => setUrl(event.target.value)} disabled={isSubmitting} aria-invalid={!!formError} aria-describedby={`${formId}-url-help${formError ? ` ${formId}-error` : ''}`} /><span className="dialog-field-hint" id={`${formId}-url-help`}>Nous cherchons les flux RSS annoncés par cette page. Vous pouvez aussi coller directement une adresse RSS ou Atom.</span></label>
            <details className="sources-advanced"><summary>Nom et options de la source</summary><div>
            <label className="dialog-field" htmlFor={`${formId}-name`}>Nom personnalisé <span className="dialog-optional">(facultatif)</span><input id={`${formId}-name`} maxLength={120} placeholder="Nom fourni par le média" value={name} onChange={event => setName(event.target.value)} disabled={isSubmitting} autoComplete="off" /></label>
            <div className="sources-form-columns"><label className="dialog-field" htmlFor={`${formId}-category`}>Thématique<select id={`${formId}-category`} value={category} onChange={event => setCategory(event.target.value as FashionCategory)} disabled={isSubmitting}>{categories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="dialog-field" htmlFor={`${formId}-language`}>Langue<select id={`${formId}-language`} value={language} onChange={event => setLanguage(event.target.value as 'fr' | 'en')} disabled={isSubmitting}><option value="fr">Français</option><option value="en">Anglais</option></select></label></div>
            <label className="dialog-field" htmlFor={`${formId}-website`}>Site du média <span className="dialog-optional">(facultatif)</span><input id={`${formId}-website`} type="url" placeholder="https://media.fr" value={website} onChange={event => setWebsite(event.target.value)} disabled={isSubmitting} /></label>
            </div></details>
            <div className="dialog-form-footer"><button className="btn btn-secondary" type="button" onClick={closeAdd} disabled={isSubmitting}>Annuler</button><button className="btn btn-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? <Loader2 size={16} className="dialog-spinner" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{isSubmitting ? 'Recherche et vérification…' : 'Ajouter la source'}</button></div>
            <p className="sources-validation-note"><Check size={13} aria-hidden="true" /> Le flux sera vérifié avant d’être ajouté.</p>
          </form>
        </div>
      </div>}
    </section>
  );
}
