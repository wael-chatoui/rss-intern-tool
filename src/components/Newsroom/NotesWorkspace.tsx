'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, CheckCheck,
  ChevronLeft, ChevronRight, Clock3, Download, ExternalLink, FileText, LayoutGrid,
  Loader2, Plus, Search, Trash2, X,
} from 'lucide-react';
import {
  addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, startOfMonth, startOfWeek,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { PostStatus, SocialPlatform, SocialPost } from '@/types';
import './notes.css';

interface NotesWorkspaceProps {
  posts: SocialPost[];
  selectedPostId: string | null;
  onSelectPost: (id: string | null) => void;
  onNewPost: (date?: string) => Promise<void>;
  onSavePost: (post: SocialPost) => Promise<void>;
  onDeletePost: (id: string) => Promise<void>;
  mode: 'notes' | 'planning';
}

type NotePost = SocialPost & { notes?: string };
type SaveState = 'saved' | 'pending' | 'saving' | 'error';
type EditorTab = 'note' | SocialPlatform;
const statuses: { id: PostStatus; label: string; hint: string }[] = [
  { id: 'idea', label: 'À explorer', hint: 'Sujets à traiter' },
  { id: 'in_progress', label: 'En rédaction', hint: 'Brouillons en cours' },
  { id: 'ready', label: 'Prêt à publier', hint: 'Contenus prêts' },
  { id: 'published', label: 'Publié', hint: 'Publications diffusées' },
];
const platformLabels: Record<SocialPlatform, string> = {
  tiktok: 'TikTok', instagram: 'Instagram', linkedin: 'LinkedIn',
};
const labelForStatus = (status: PostStatus) => statuses.find((item) => item.id === status)?.label || status;
const titleFor = (post: NotePost) => post.angle.trim() || 'Note sans titre';
const excerptFor = (post: NotePost) => post.notes?.trim() || post.sourceArticleTitle || 'Aucun contenu';
const dateLabel = (value?: string) => {
  if (!value) return 'Sans date';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : format(date, 'd MMM', { locale: fr });
};

function markdownFor(post: NotePost) {
  const source = post.sourceArticleTitle
    ? `\n## Source\n${post.sourceArticleLink ? `[${post.sourceArticleTitle}](${post.sourceArticleLink})` : post.sourceArticleTitle}${post.sourceArticleFeed ? `\n\n${post.sourceArticleFeed}` : ''}\n`
    : '';
  return `# ${titleFor(post)}\n\n${post.notes || ''}\n\nStatut : ${labelForStatus(post.status)}\n${post.scheduledDate ? `Publication : ${post.scheduledDate}${post.scheduledTime ? ` à ${post.scheduledTime}` : ''}\n` : ''}${post.tags.length ? `Mots-clés : ${post.tags.join(', ')}\n` : ''}${source}\n## TikTok\n\n### Accroche\n${post.content.tiktok.hook}\n\n### Script\n${post.content.tiktok.script}\n\n### Mise en images\n${post.content.tiktok.visualNotes}\n\nDurée : ${post.content.tiktok.durationEstimate}\n\n## Instagram\n\n${post.content.instagram.caption}\n\n${post.content.instagram.carouselSlides.map((slide, index) => `### Diapositive ${index + 1}\n${slide}`).join('\n\n')}\n\n${post.content.instagram.hashtags.join(' ')}\n\n## LinkedIn\n\n### ${post.content.linkedin.title || 'Titre'}\n${post.content.linkedin.body}\n\n${post.content.linkedin.keyTakeaways.map((item) => `- ${item}`).join('\n')}\n`;
}

/** Drafts and save queues are keyed by note, so a delayed save can never write into another note. */
export function NotesWorkspace({ posts, selectedPostId, onSelectPost, onNewPost, onSavePost, onDeletePost, mode }: NotesWorkspaceProps) {
  const drafts = useRef(new Map<string, NotePost>());
  const versions = useRef(new Map<string, number>());
  const dirty = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saves = useRef(new Map<string, Promise<void>>());
  const saveCallback = useRef(onSavePost);
  const mounted = useRef(true);
  const [revision, setRevision] = useState(0);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PostStatus | 'all'>('all');
  const [tab, setTab] = useState<EditorTab>('note');
  const [actionError, setActionError] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [planView, setPlanView] = useState<'board' | 'calendar'>('board');
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const calendarButtons = useRef(new Map<string, HTMLButtonElement>());
  const titleInput = useRef<HTMLTextAreaElement>(null);
  saveCallback.current = onSavePost;

  const updateSaveState = useCallback((id: string, state: SaveState) => {
    if (mounted.current) setSaveStates((current) => ({ ...current, [id]: state }));
  }, []);

  const persist = useCallback(async (id: string): Promise<void> => {
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
    const inFlight = saves.current.get(id);
    if (inFlight) {
      await inFlight;
      if (dirty.current.has(id)) return persist(id);
      return;
    }
    if (!dirty.current.has(id)) return;
    const snapshot = drafts.current.get(id);
    if (!snapshot) return;
    const version = versions.current.get(id);
    updateSaveState(id, 'saving');
    const request = (async () => {
      try {
        await saveCallback.current(snapshot);
        if (versions.current.get(id) === version) {
          dirty.current.delete(id);
          updateSaveState(id, 'saved');
        } else {
          updateSaveState(id, 'pending');
        }
      } catch (error) {
        updateSaveState(id, 'error');
        throw error;
      } finally {
        saves.current.delete(id);
      }
    })();
    saves.current.set(id, request);
    await request;
    if (dirty.current.has(id)) return persist(id);
  }, [updateSaveState]);

  useEffect(() => {
    for (const post of posts) {
      if (!drafts.current.has(post.id) || (!dirty.current.has(post.id) && !saves.current.has(post.id))) {
        drafts.current.set(post.id, post);
      }
    }
    setRevision((current) => current + 1);
  }, [posts]);

  useEffect(() => {
    setTab('note');
    setConfirmDelete(false);
    setActionError('');
  }, [selectedPostId]);

  useEffect(() => {
    mounted.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current.size) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      mounted.current = false;
      window.removeEventListener('beforeunload', beforeUnload);
      timers.current.forEach(clearTimeout);
      timers.current.clear();
      dirty.current.forEach((id) => { void persist(id).catch(() => undefined); });
    };
  }, [persist]);

  const mergedPosts = useMemo(() => posts.map((post) => drafts.current.get(post.id) || post), [posts, revision]);
  const selected = selectedPostId ? drafts.current.get(selectedPostId) || posts.find((post) => post.id === selectedPostId) || null : null;
  const selectedState = selected ? saveStates[selected.id] || 'saved' : 'saved';
  const failedIds = Object.keys(saveStates).filter((id) => saveStates[id] === 'error' && dirty.current.has(id));
  useEffect(() => {
    const input = titleInput.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }, [selectedPostId, selected?.angle, mode]);
  const filteredPosts = useMemo(() => {
    const query = search.toLocaleLowerCase('fr').trim();
    return mergedPosts.filter((post) => (filter === 'all' || post.status === filter) && (!query || `${post.angle} ${post.notes || ''} ${post.tags.join(' ')} ${post.sourceArticleTitle || ''}`.toLocaleLowerCase('fr').includes(query)))
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  }, [mergedPosts, search, filter]);

  const editPost = useCallback((id: string, update: Partial<NotePost>) => {
    const current = drafts.current.get(id) || posts.find((post) => post.id === id);
    if (!current) return;
    drafts.current.set(id, { ...current, ...update, updatedAt: new Date().toISOString() });
    versions.current.set(id, (versions.current.get(id) || 0) + 1);
    dirty.current.add(id);
    updateSaveState(id, 'pending');
    setRevision((currentRevision) => currentRevision + 1);
    const previousTimer = timers.current.get(id);
    if (previousTimer) clearTimeout(previousTimer);
    timers.current.set(id, setTimeout(() => { void persist(id).catch(() => undefined); }, 650));
  }, [posts, persist, updateSaveState]);

  const select = (id: string | null) => {
    if (selectedPostId) void persist(selectedPostId).catch(() => undefined);
    onSelectPost(id);
  };
  const create = async (date?: string) => {
    setCreating(true);
    setActionError('');
    try {
      if (selectedPostId) void persist(selectedPostId).catch(() => undefined);
      await onNewPost(date);
    } catch {
      setActionError('La note n’a pas pu être créée. Vérifiez votre connexion et réessayez.');
    } finally { setCreating(false); }
  };
  const remove = async () => {
    if (!selected) return;
    const id = selected.id;
    setDeleting(true);
    setActionError('');
    try {
      await persist(id);
      await onDeletePost(id);
      drafts.current.delete(id);
      dirty.current.delete(id);
      setConfirmDelete(false);
    } catch {
      setActionError('La note n’a pas pu être supprimée. Réessayez.');
    } finally { setDeleting(false); }
  };
  const exportNote = () => {
    if (!selected) return;
    const url = URL.createObjectURL(new Blob([markdownFor(selected)], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${titleFor(selected).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 70) || 'note'}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const editContent = <T extends SocialPlatform>(platform: T, update: Partial<SocialPost['content'][T]>) => {
    if (!selected) return;
    editPost(selected.id, { content: { ...selected.content, [platform]: { ...selected.content[platform], ...update } } });
  };
  const changeStatus = async (post: NotePost, status: PostStatus) => {
    editPost(post.id, { status });
    try { await persist(post.id); } catch { setActionError('Le statut n’a pas pu être enregistré. Votre modification est conservée, réessayez depuis la note.'); }
  };

  const noteEditor = selected ? (
    <article className="notes-editor" aria-label={`Rédaction : ${titleFor(selected)}`} onKeyDown={(event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void persist(selected.id).catch(() => undefined);
      }
    }}>
      <div className="notes-editor-toolbar">
        <button className="notes-mobile-back notes-icon" onClick={() => select(null)} aria-label="Revenir à toutes les notes"><ArrowLeft size={18} /></button>
        <div className={`notes-save-state notes-save-${selectedState}`} role="status" aria-live="polite">
          {selectedState === 'saving' ? <Loader2 size={15} className="notes-spinner" /> : selectedState === 'error' ? <AlertCircle size={15} /> : selectedState === 'saved' ? <Check size={15} /> : <span className="notes-pending-dot" />}
          <span>{selectedState === 'saving' ? 'Enregistrement…' : selectedState === 'error' ? 'Échec de l’enregistrement' : selectedState === 'pending' ? 'Modifications en cours' : 'Tout est enregistré'}</span>
          {selectedState === 'error' && <button onClick={() => { void persist(selected.id).catch(() => undefined); }}>Réessayer</button>}
        </div>
        <div className="notes-editor-actions">
          <button className="notes-action" onClick={exportNote} aria-label="Exporter la note en Markdown" title="Exporter la note en Markdown"><Download size={16} /><span>Exporter</span></button>
          <button className="notes-icon" onClick={() => setConfirmDelete(true)} aria-label="Supprimer cette note" title="Supprimer cette note"><Trash2 size={17} /></button>
        </div>
      </div>
      {selectedState === 'error' && <p className="notes-inline-error" role="alert">Le serveur n’a pas reçu les dernières modifications. Elles restent disponibles ici. Réessayez avant de quitter la page.</p>}
      {confirmDelete && <div className="notes-delete-confirm" role="alert">
        <div><strong>Supprimer cette note ?</strong><p>La note et ses déclinaisons seront supprimées.</p></div>
        <button className="notes-action" onClick={() => setConfirmDelete(false)} disabled={deleting}>Annuler</button>
        <button className="notes-delete-btn" onClick={() => { void remove(); }} disabled={deleting}>{deleting ? 'Suppression…' : 'Supprimer'}</button>
      </div>}
      <div className="notes-editor-scroll">
        <div className="notes-paper">
          <div className="notes-paper-topline"><span>Note éditoriale</span><span>{dateLabel(selected.createdAt.slice(0, 10))}</span></div>
          <label className="notes-sr-only" htmlFor="note-angle">Titre ou angle éditorial</label>
          <textarea ref={titleInput} id="note-angle" className="notes-title-input" rows={1} value={selected.angle} onChange={(event) => editPost(selected.id, { angle: event.target.value })} placeholder="Titre ou angle éditorial" />
          <div className="notes-meta-row">
            <label className="notes-status-control"><span className={`notes-status-mark notes-status-${selected.status}`} /><span className="notes-sr-only">Statut de la note</span><select aria-label="Statut de la note" value={selected.status} onChange={(event) => editPost(selected.id, { status: event.target.value as PostStatus })}>{statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
            <span className="notes-meta-separator" />
            <label className="notes-date-control"><CalendarDays size={15} /><span className="notes-sr-only">Date de publication</span><input aria-label="Date de publication" type="date" value={selected.scheduledDate || ''} onChange={(event) => editPost(selected.id, { scheduledDate: event.target.value })} /></label>
            {selected.scheduledDate && <label className="notes-date-control"><Clock3 size={15} /><span className="notes-sr-only">Heure de publication</span><input aria-label="Heure de publication" type="time" value={selected.scheduledTime || ''} onChange={(event) => editPost(selected.id, { scheduledTime: event.target.value })} /></label>}
          </div>
          <div className="notes-tabs" role="tablist" aria-label="Contenu de la note">
            {(['note', 'tiktok', 'instagram', 'linkedin'] as EditorTab[]).map((item) => <button key={item} id={`notes-tab-${item}`} role="tab" aria-selected={tab === item} aria-controls="notes-tab-panel" tabIndex={tab === item ? 0 : -1} onClick={() => setTab(item)} onKeyDown={(event) => {
              const tabs: EditorTab[] = ['note', 'tiktok', 'instagram', 'linkedin'];
              const index = tabs.indexOf(item);
              const next = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length] : event.key === 'ArrowLeft' ? tabs[(index + tabs.length - 1) % tabs.length] : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : null;
              if (next) { event.preventDefault(); setTab(next); document.getElementById(`notes-tab-${next}`)?.focus(); }
            }}>{item === 'note' ? <><FileText size={15} />Notes</> : platformLabels[item]}</button>)}
          </div>
          <div className="notes-tab-panel" id="notes-tab-panel" role="tabpanel" aria-labelledby={`notes-tab-${tab}`}>
            {tab === 'note' ? <>
              <label className="notes-sr-only" htmlFor="note-body">Vos notes</label>
              <textarea id="note-body" className="notes-body-input" value={selected.notes || ''} onChange={(event) => editPost(selected.id, { notes: event.target.value })} placeholder="Saisir les notes…" />
              <div className="notes-writing-footer"><span>{(selected.notes || '').trim().split(/\s+/).filter(Boolean).length} mots</span><span>Enregistrement automatique</span></div>
            </> : <div className="notes-platform-editor">
              <div className="notes-platform-intro"><h3>{platformLabels[tab]}</h3><label className="notes-channel-toggle"><input type="checkbox" checked={selected.platforms.includes(tab)} onChange={(event) => editPost(selected.id, { platforms: event.target.checked ? [...selected.platforms, tab] : selected.platforms.filter((platform) => platform !== tab) })} />Prévoir ce canal</label></div>
              {tab === 'tiktok' && <>
                <label className="notes-form-field">Accroche<input value={selected.content.tiktok.hook} onChange={(event) => editContent('tiktok', { hook: event.target.value })} placeholder="Saisir l’accroche…" /></label>
                <label className="notes-form-field">Script<textarea rows={9} value={selected.content.tiktok.script} onChange={(event) => editContent('tiktok', { script: event.target.value })} placeholder="Saisir le script…" /></label>
                <div className="notes-field-row"><label className="notes-form-field">Mise en images<textarea rows={3} value={selected.content.tiktok.visualNotes} onChange={(event) => editContent('tiktok', { visualNotes: event.target.value })} placeholder="Plans, illustrations, sous-titres…" /></label><label className="notes-form-field notes-duration">Durée estimée<input value={selected.content.tiktok.durationEstimate} onChange={(event) => editContent('tiktok', { durationEstimate: event.target.value })} placeholder="60 secondes" /></label></div>
              </>}
              {tab === 'instagram' && <>
                <label className="notes-form-field">Légende<textarea rows={7} value={selected.content.instagram.caption} onChange={(event) => editContent('instagram', { caption: event.target.value })} placeholder="Saisir la légende…" /></label>
                <div className="notes-array-heading"><span>Carrousel</span><button className="notes-action" onClick={() => editContent('instagram', { carouselSlides: [...selected.content.instagram.carouselSlides, ''] })}><Plus size={15} />Ajouter une diapositive</button></div>
                {selected.content.instagram.carouselSlides.map((slide, index) => <div className="notes-array-item" key={index}><label className="notes-form-field">Diapositive {index + 1}<textarea rows={3} value={slide} onChange={(event) => editContent('instagram', { carouselSlides: selected.content.instagram.carouselSlides.map((value, slideIndex) => slideIndex === index ? event.target.value : value) })} /></label><button className="notes-icon" aria-label={`Supprimer la diapositive ${index + 1}`} onClick={() => editContent('instagram', { carouselSlides: selected.content.instagram.carouselSlides.filter((_, slideIndex) => slideIndex !== index) })}><X size={16} /></button></div>)}
                <label className="notes-form-field">Hashtags<input value={selected.content.instagram.hashtags.join(' ')} onChange={(event) => editContent('instagram', { hashtags: event.target.value.split(' ') })} placeholder="#presse #actualité" /></label>
              </>}
              {tab === 'linkedin' && <>
                <label className="notes-form-field">Titre<input value={selected.content.linkedin.title} onChange={(event) => editContent('linkedin', { title: event.target.value })} placeholder="Saisir le titre…" /></label>
                <label className="notes-form-field">Publication<textarea rows={10} value={selected.content.linkedin.body} onChange={(event) => editContent('linkedin', { body: event.target.value })} placeholder="Saisir la publication…" /></label>
                <div className="notes-array-heading"><span>Points à retenir</span><button className="notes-action" onClick={() => editContent('linkedin', { keyTakeaways: [...selected.content.linkedin.keyTakeaways, ''] })}><Plus size={15} />Ajouter un point</button></div>
                {selected.content.linkedin.keyTakeaways.map((point, index) => <div className="notes-array-item" key={index}><label className="notes-form-field"><span className="notes-sr-only">Point à retenir {index + 1}</span><input value={point} onChange={(event) => editContent('linkedin', { keyTakeaways: selected.content.linkedin.keyTakeaways.map((value, pointIndex) => pointIndex === index ? event.target.value : value) })} placeholder={`Point à retenir ${index + 1}`} /></label><button className="notes-icon" aria-label={`Supprimer le point ${index + 1}`} onClick={() => editContent('linkedin', { keyTakeaways: selected.content.linkedin.keyTakeaways.filter((_, pointIndex) => pointIndex !== index) })}><X size={16} /></button></div>)}
              </>}
            </div>}
          </div>
          <div className="notes-reference-block">
            <div className="notes-source"><span className="notes-section-label"><BookOpen size={15} />Source du sujet</span>{selected.sourceArticleTitle ? <><p>{selected.sourceArticleTitle}</p><div><span>{selected.sourceArticleFeed || 'Article lié'}</span>{selected.sourceArticleLink && <a href={selected.sourceArticleLink} target="_blank" rel="noreferrer">Lire la source <ExternalLink size={13} /></a>}</div></> : <p className="notes-source-empty">Aucune source liée. Créez une note depuis un article pour lier sa source.</p>}</div>
            <label className="notes-tags-field"><span className="notes-section-label">Mots-clés</span><input value={selected.tags.join(',')} onChange={(event) => editPost(selected.id, { tags: event.target.value.split(',') })} placeholder="Enquête, société, à vérifier…" /><span>Séparez les mots-clés par une virgule.</span></label>
          </div>
        </div>
      </div>
    </article>
  ) : <div className="notes-no-selection"><div className="notes-empty-paper" aria-hidden="true"><span /><span /><span /><FileText size={28} /></div><h2>Aucune note sélectionnée</h2><p>Sélectionnez une note dans la liste ou créez une note.</p><button className="notes-primary" onClick={() => { void create(); }} disabled={creating}><Plus size={17} />{creating ? 'Création…' : 'Créer une note'}</button></div>;

  const planningPost = (post: NotePost) => <article className="planning-card" key={post.id}>
    <button className="planning-card-open" onClick={() => select(post.id)}><span className="planning-card-source">{post.sourceArticleFeed || 'Sujet libre'}</span><h3>{titleFor(post)}</h3>{post.notes && <p>{post.notes}</p>}</button>
    <div className="planning-card-meta"><span><CalendarDays size={14} />{dateLabel(post.scheduledDate)}{post.scheduledTime ? ` · ${post.scheduledTime}` : ''}</span>{saveStates[post.id] === 'saving' && <Loader2 className="notes-spinner" size={14} />}{saveStates[post.id] === 'error' && <AlertCircle size={14} aria-label="Statut non enregistré" />}</div>
    <div className="planning-card-footer"><span>{post.platforms.length ? post.platforms.map((platform) => platformLabels[platform]).join(' · ') : 'Canal à définir'}</span><select aria-label={`Changer le statut de ${titleFor(post)}`} value={post.status} onChange={(event) => { void changeStatus(post, event.target.value as PostStatus); }}>{statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></div>
  </article>;
  const calendarDays = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const selectedDateKey = format(selectedDate, 'yyyy-MM-dd');
  const scheduledPosts = mergedPosts.filter((post) => post.scheduledDate === selectedDateKey).sort((first, second) => (first.scheduledTime || '').localeCompare(second.scheduledTime || ''));
  const calendarKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, date: Date) => {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? 7 : event.key === 'ArrowUp' ? -7 : 0;
    if (!offset) return;
    event.preventDefault();
    const next = addDays(date, offset);
    setSelectedDate(next);
    if (!isSameMonth(next, month)) setMonth(next);
    requestAnimationFrame(() => calendarButtons.current.get(format(next, 'yyyy-MM-dd'))?.focus());
  };

  return <section className={`notes-workspace ${mode === 'planning' ? 'notes-is-planning' : ''} ${selected ? 'notes-has-selection' : ''}`}>
    {actionError && <div className="notes-action-error" role="alert"><AlertCircle size={17} /><span>{actionError}</span><button className="notes-icon" onClick={() => setActionError('')} aria-label="Fermer le message"><X size={17} /></button></div>}
    {failedIds.length > 0 && <div className="notes-action-error" role="alert"><AlertCircle size={17} /><span>{failedIds.length === 1 ? 'Une note attend d’être enregistrée.' : `${failedIds.length} notes attendent d’être enregistrées.`} Vos modifications sont conservées dans ce carnet.</span><button className="notes-action" onClick={() => { failedIds.forEach((id) => { void persist(id).catch(() => undefined); }); }}>Réessayer</button></div>}
    {mode === 'notes' ? <div className="notes-layout"><aside className="notes-list-panel" aria-label="Vos notes"><div className="notes-list-toolbar"><div className="notes-list-heading"><h2>Toutes les notes</h2><span>{mergedPosts.length}</span></div><label className="notes-search"><Search size={17} /><span className="notes-sr-only">Rechercher dans les notes</span><input placeholder="Rechercher une note…" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button onClick={() => setSearch('')} aria-label="Effacer la recherche"><X size={15} /></button>}</label><label className="notes-filter"><span>Afficher</span><select value={filter} onChange={(event) => setFilter(event.target.value as PostStatus | 'all')}><option value="all">Tous les statuts</option>{statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label></div><div className="notes-list">{filteredPosts.length ? filteredPosts.map((post) => <button key={post.id} className={`notes-list-item ${selectedPostId === post.id ? 'is-active' : ''}`} onClick={() => select(post.id)} aria-current={selectedPostId === post.id ? 'true' : undefined}><div className="notes-list-item-top"><span className={`notes-status-mark notes-status-${post.status}`} /><span>{labelForStatus(post.status)}</span><time dateTime={post.updatedAt}>{dateLabel(post.updatedAt.slice(0, 10))}</time>{saveStates[post.id] === 'error' && <AlertCircle size={14} aria-label="Enregistrement à réessayer" />}</div><h3>{titleFor(post)}</h3><p>{excerptFor(post)}</p><div className="notes-list-item-bottom">{post.sourceArticleFeed ? <span><BookOpen size={12} />{post.sourceArticleFeed}</span> : <span>Note libre</span>}{post.tags.filter((tag) => tag.trim()).length > 0 && <span>{post.tags.filter((tag) => tag.trim()).slice(0, 2).join(' · ')}</span>}</div></button>) : <div className="notes-list-empty"><FileText size={25} /><h3>{search || filter !== 'all' ? 'Aucune note trouvée' : 'Aucune note'}</h3><p>{search || filter !== 'all' ? 'Essayez un autre mot ou affichez tous les statuts.' : 'Créez une note ou sélectionnez un article dans la veille.'}</p>{search || filter !== 'all' ? <button className="notes-action" onClick={() => { setSearch(''); setFilter('all'); }}>Réinitialiser les filtres</button> : <button className="notes-action" disabled={creating} onClick={() => { void create(); }}><Plus size={15} />Créer une note</button>}</div>}</div></aside>{noteEditor}</div> : <>
      <div className="planning-view-bar"><div className="planning-view-switch" aria-label="Vue du planning"><button aria-pressed={planView === 'board'} onClick={() => setPlanView('board')}><LayoutGrid size={16} />Tableau</button><button aria-pressed={planView === 'calendar'} onClick={() => setPlanView('calendar')}><CalendarDays size={16} />Calendrier</button></div><span>{mergedPosts.filter((post) => post.status !== 'published').length} sujets en préparation</span></div>
      {planView === 'board' ? <div className="planning-board">{statuses.map((status) => { const columnPosts = mergedPosts.filter((post) => post.status === status.id); return <section className={`planning-column planning-column-${status.id}`} key={status.id}><header><div><span className={`notes-status-mark notes-status-${status.id}`} /><h2>{status.label}</h2><span className="planning-column-count">{columnPosts.length}</span></div><p>{status.hint}</p></header><div className="planning-column-cards">{columnPosts.map(planningPost)}{columnPosts.length === 0 && <div className="planning-column-empty">{status.id === 'idea' ? <><FileText size={22} /><p>Aucun sujet à explorer.</p><button className="notes-action" disabled={creating} onClick={() => { void create(); }}><Plus size={15} />Ajouter un sujet</button></> : status.id === 'published' ? <><CheckCheck size={22} /><p>Aucune publication.</p></> : <p>Aucun sujet.</p>}</div>}</div></section>; })}</div> : <div className="planning-calendar-layout"><div className="planning-calendar"><header><div className="planning-month-nav"><button className="notes-icon" aria-label="Mois précédent" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={19} /></button><h2>{format(month, 'MMMM yyyy', { locale: fr })}</h2><button className="notes-icon" aria-label="Mois suivant" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={19} /></button></div><button className="notes-action" onClick={() => { const today = new Date(); setMonth(today); setSelectedDate(today); }}>Aujourd’hui</button></header><div className="planning-weekdays">{['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'].map((day) => <span key={day}>{day}</span>)}</div><div className="planning-days">{calendarDays.map((day) => { const key = format(day, 'yyyy-MM-dd'); const dayPosts = mergedPosts.filter((post) => post.scheduledDate === key); return <button ref={(element) => { if (element) calendarButtons.current.set(key, element); else calendarButtons.current.delete(key); }} key={key} className={`planning-day ${!isSameMonth(day, month) ? 'is-other-month' : ''} ${isSameDay(day, selectedDate) ? 'is-selected' : ''} ${isSameDay(day, new Date()) ? 'is-today' : ''}`} aria-pressed={isSameDay(day, selectedDate)} aria-label={`${format(day, 'EEEE d MMMM yyyy', { locale: fr })}, ${dayPosts.length} sujet${dayPosts.length > 1 ? 's' : ''}`} onClick={() => setSelectedDate(day)} onKeyDown={(event) => calendarKeyDown(event, day)}><span className="planning-day-number">{format(day, 'd')}</span><span className="planning-day-posts">{dayPosts.slice(0, 2).map((post) => <span key={post.id}>{titleFor(post)}</span>)}{dayPosts.length > 2 && <span className="planning-more">+{dayPosts.length - 2} sujets</span>}</span>{dayPosts.length > 0 && <span className="planning-day-mobile-count">{dayPosts.length}</span>}</button>; })}</div><p className="planning-calendar-help">Sélectionnez une date pour afficher les sujets planifiés.</p></div><aside className="planning-day-inspector"><header><span>Sujets planifiés</span><h2>{format(selectedDate, 'EEEE d MMMM', { locale: fr })}</h2><button className="notes-primary" disabled={creating} onClick={() => { void create(selectedDateKey); }}><Plus size={16} />{creating ? 'Création…' : 'Ajouter un sujet'}</button></header><div className="planning-day-list">{scheduledPosts.length ? scheduledPosts.map((post) => <button key={post.id} className="planning-scheduled-post" onClick={() => select(post.id)}><span><Clock3 size={14} />{post.scheduledTime || 'Heure à définir'}</span><h3>{titleFor(post)}</h3><div><span>{labelForStatus(post.status)}</span><ArrowRight size={16} /></div></button>) : <div className="planning-day-empty"><CalendarDays size={28} /><h3>Aucun sujet planifié</h3><p>Ajoutez un sujet pour cette date.</p></div>}</div></aside></div>}
    </>}
  </section>;
}
