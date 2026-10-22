'use client';

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
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
import { NoteSource, PostStatus, SocialPlatform, SocialPost } from '@/types';
import './notes.css';
import { buildTransferExport, type ExportFormat } from '@/lib/transfer-formats';
import { getNoteSources, mergeNoteSources, noteSearchText } from '@/lib/note-model';
import { noteDraftFingerprint, readNoteDrafts, removeNoteDraftIfUnchanged, writeNoteDraft, type StoredNoteDraft } from '@/lib/note-drafts';
import { safeWebUrl } from './dialog';
import { normalizeSearchText } from '@/lib/search';

interface NotesWorkspaceProps {
  posts: SocialPost[];
  selectedPostId: string | null;
  onSelectPost: (id: string | null) => void;
  onNewPost: (date?: string) => Promise<void>;
  onSavePost: (post: SocialPost) => Promise<SocialPost>;
  onDuplicatePost?: (post: SocialPost) => Promise<void>;
  draftStorageKey: string;
  loading?: boolean;
  error?: string;
  onRetryLoad?: () => void;
  onDeletePost: (id: string, revision?: number) => Promise<void>;
  mode: 'notes' | 'planning';
}

type NotePost = SocialPost & { notes?: string };
type SaveState = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';
type NoteConflict = { server: SocialPost };
type SaveFailure = Error & { status?: number; code?: string; post?: SocialPost };
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
const excerptFor = (post: NotePost) => post.notes?.trim() || getNoteSources(post)[0]?.title || 'Aucun contenu';
const conflictPreview = (post: SocialPost) => [post.angle, `Statut : ${labelForStatus(post.status)}\nPublication prévue : ${post.scheduledDate || 'Sans date'}${post.scheduledDate && post.scheduledTime ? ` à ${post.scheduledTime}` : ''}\nCanaux : ${post.platforms.map(platform => platformLabels[platform]).join(', ') || 'Aucun canal défini'}`, post.notes, post.tags.length ? `Mots-clés : ${post.tags.join(', ')}` : '', ...getNoteSources(post).map(source => `${source.title}\n${source.link}${source.excerpt ? `\n${source.excerpt}` : ''}`), ...Object.entries(post.content).map(([platform, fields]) => {
  const values = Object.values(fields).flat().filter(value => typeof value === 'string' && value.trim());
  return values.length ? `${platformLabels[platform as SocialPlatform]}\n${values.join('\n')}` : '';
})].filter(Boolean).join('\n\n');
const dateLabel = (value?: string) => {
  if (!value) return 'Sans date';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : format(date, 'd MMM', { locale: fr });
};

export interface NotesWorkspaceHandle {
  flush: () => Promise<void>;
  attachSource: (postId: string, source: NoteSource) => Promise<void>;
}

/** Drafts and save queues are keyed by note, so a delayed save can never write into another note. */
export const NotesWorkspace = forwardRef<NotesWorkspaceHandle, NotesWorkspaceProps>(function NotesWorkspace({ posts, selectedPostId, onSelectPost, onNewPost, onSavePost, onDuplicatePost, onDeletePost, draftStorageKey, loading = false, error = '', onRetryLoad, mode }, ref) {
  const drafts = useRef(new Map<string, NotePost>());
  const versions = useRef(new Map<string, number>());
  const dirty = useRef(new Set<string>());
  const deletingNoteIds = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saves = useRef(new Map<string, Promise<void>>());
  const conflicts = useRef(new Map<string, NoteConflict>());
  const saveFailures = useRef(new Map<string, { status?: number; code?: string; message: string }>());
  const missingNoteIds = useRef(new Set<string>());
  const previousPostIds = useRef(new Set<string>());
  const recoveredOrigins = useRef(new Map<string, StoredNoteDraft[]>());
  const localRecords = useRef(new Map<string, StoredNoteDraft>());
  const writer = useRef('');
  const storageKey = useRef(draftStorageKey);
  storageKey.current = draftStorageKey;
  const saveCallback = useRef(onSavePost);
  const mounted = useRef(true);
  const [revision, setRevision] = useState(0);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [recoverableDrafts, setRecoverableDrafts] = useState<StoredNoteDraft[]>([]);
  const [storageError, setStorageError] = useState('');
  const [confirmServerVersion, setConfirmServerVersion] = useState(false);
  const [resolvingConflict, setResolvingConflict] = useState(false);
  const [sourceFormOpen, setSourceFormOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceEditIndex, setSourceEditIndex] = useState<number | null>(null);
  const [sourceError, setSourceError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PostStatus | 'all'>('all');
  const [tab, setTab] = useState<EditorTab>('note');
  const [actionError, setActionError] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('md');
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState('');
  const [planView, setPlanView] = useState<'board' | 'calendar'>('board');
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const calendarButtons = useRef(new Map<string, HTMLButtonElement>());
  const titleInput = useRef<HTMLTextAreaElement>(null);
  const listSearchInput = useRef<HTMLInputElement>(null);
  const focusNextSelection = useRef(false);
  const downloadedSnapshots = useRef(new Set<string>());
  saveCallback.current = onSavePost;

  const localWriter = useCallback(() => {
    if (!writer.current) writer.current = crypto.randomUUID();
    return writer.current;
  }, []);
  const refreshRecovery = useCallback(() => {
    try {
      const chosenKeys = new Set(Array.from(recoveredOrigins.current.values()).flat().map(record => record.key));
      setRecoverableDrafts(readNoteDrafts(window.localStorage, storageKey.current).filter(record => !chosenKeys.has(record.key) && (record.writer !== writer.current || !dirty.current.has(record.post.id))));
    }
    catch { setStorageError('La copie locale est indisponible sur cet appareil. Téléchargez vos brouillons avant de quitter si l’enregistrement échoue.'); }
  }, []);
  const storeLocal = useCallback((post: SocialPost) => {
    try { localRecords.current.set(post.id, writeNoteDraft(window.localStorage, storageKey.current, localWriter(), post)); setStorageError(''); return true; }
    catch { setStorageError('La copie locale n’a pas pu être enregistrée (stockage plein ou indisponible). Gardez la page ouverte et téléchargez vos brouillons.'); return false; }
  }, [localWriter]);
  const cleanupLocal = useCallback((id: string, snapshot: SocialPost) => {
    try {
      const record = localRecords.current.get(id);
      if (record && removeNoteDraftIfUnchanged(window.localStorage, record.key, snapshot)) localRecords.current.delete(id);
      for (const record of recoveredOrigins.current.get(id) || []) removeNoteDraftIfUnchanged(window.localStorage, record.key, record.post);
      recoveredOrigins.current.delete(id);
      refreshRecovery();
    } catch { setStorageError('La copie locale reste disponible sur cet appareil.'); }
  }, [localWriter, refreshRecovery]);

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
    if (conflicts.current.has(id)) throw new Error('Choisissez la version à conserver avant de poursuivre.');
    const snapshot = drafts.current.get(id);
    if (!snapshot) return;
    const version = versions.current.get(id);
    updateSaveState(id, 'saving');
    const request = (async () => {
      try {
        const saved = await saveCallback.current({ ...snapshot, revision: snapshot.revision ?? 0 });
        saveFailures.current.delete(id);
        if (versions.current.get(id) === version) {
          drafts.current.set(id, saved);
          dirty.current.delete(id);
          updateSaveState(id, 'saved');
          cleanupLocal(id, snapshot);
        } else {
          const current = drafts.current.get(id);
          if (current) { const rebased = { ...current, revision: saved.revision }; drafts.current.set(id, rebased); storeLocal(rebased); }
          updateSaveState(id, 'pending');
        }
        if (mounted.current) setRevision(value => value + 1);
      } catch (error) {
        const cause = error as SaveFailure;
        saveFailures.current.set(id, { status: cause.status, code: cause.code, message: cause.message || '' });
        if (cause.status === 409 && cause.code === 'NOTE_CONFLICT' && cause.post) {
          conflicts.current.set(id, { server: cause.post });
          updateSaveState(id, 'conflict');
        } else { if (cause.status === 404) missingNoteIds.current.add(id); updateSaveState(id, 'error'); }
        const current = drafts.current.get(id);
        if (current) storeLocal(current);
        throw error;
      } finally {
        saves.current.delete(id);
      }
    })();
    saves.current.set(id, request);
    await request;
    if (dirty.current.has(id)) return persist(id);
  }, [updateSaveState, cleanupLocal, storeLocal]);

  useEffect(() => {
    const currentIds = new Set(posts.map(post => post.id));
    for (const id of !loading && !error ? Array.from(previousPostIds.current) : []) {
      if (currentIds.has(id)) continue;
      const local = drafts.current.get(id);
      if (local && (dirty.current.has(id) || selectedPostId === id)) {
        missingNoteIds.current.add(id); dirty.current.add(id); storeLocal(local); updateSaveState(id, 'error');
      } else if (!saves.current.has(id)) drafts.current.delete(id);
    }
    if (!loading && !error) previousPostIds.current = currentIds;
    for (const post of posts) {
      const current = drafts.current.get(post.id);
      missingNoteIds.current.delete(post.id);
      if (!current || (!dirty.current.has(post.id) && !saves.current.has(post.id) && (post.revision ?? 0) >= (current.revision ?? 0))) {
        drafts.current.set(post.id, post);
      }
    }
    setRevision((current) => current + 1);
  }, [posts, selectedPostId, storeLocal, updateSaveState, loading, error]);

  useEffect(() => {
    setTab('note');
    setConfirmDelete(false);
    setConfirmServerVersion(false);
    setSourceFormOpen(false); setSourceUrl(''); setSourceTitle(''); setSourceError(''); setSourceEditIndex(null);
    setActionError('');
  }, [selectedPostId]);

  useEffect(() => {
    mounted.current = true;
    localWriter();
    refreshRecovery();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current.size) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    const retryOnline = () => { dirty.current.forEach(id => { if (!conflicts.current.has(id)) void persist(id).catch(() => undefined); }); };
    const storageChanged = (event: StorageEvent) => { if (event.key?.startsWith(`${storageKey.current}:draft:`)) refreshRecovery(); };
    window.addEventListener('online', retryOnline);
    window.addEventListener('storage', storageChanged);
    return () => {
      mounted.current = false;
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('online', retryOnline);
      window.removeEventListener('storage', storageChanged);
      timers.current.forEach(clearTimeout);
      timers.current.clear();
      dirty.current.forEach((id) => { void persist(id).catch(() => undefined); });
    };
  }, [persist, localWriter, refreshRecovery]);

  const mergedPosts = useMemo(() => {
    const merged = new Map(posts.map(post => [post.id, drafts.current.get(post.id) || post]));
    dirty.current.forEach(id => { const draft = drafts.current.get(id); if (draft && !merged.has(id)) merged.set(id, draft); });
    return Array.from(merged.values());
  }, [posts, revision]);
  const selected = selectedPostId ? drafts.current.get(selectedPostId) || posts.find((post) => post.id === selectedPostId) || null : null;
  const selectedState = selected ? saveStates[selected.id] || 'saved' : 'saved';
  const selectedConflict = selected ? conflicts.current.get(selected.id) : undefined;
  const selectedFailure = selected ? saveFailures.current.get(selected.id) : undefined;
  const subscriptionRequired = selectedFailure?.code === 'SUBSCRIPTION_REQUIRED' || selectedFailure?.status === 402;
  const selectedSources = selected ? getNoteSources(selected) : [];
  const failedIds = Object.keys(saveStates).filter((id) => saveStates[id] === 'error' && dirty.current.has(id));
  useEffect(() => {
    const input = titleInput.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }, [selectedPostId, selected?.angle, mode]);
  const filteredPosts = useMemo(() => {
    const query = normalizeSearchText(search.trim());
    return mergedPosts.filter((post) => (filter === 'all' || post.status === filter) && (!query || normalizeSearchText(noteSearchText(post)).includes(query)))
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  }, [mergedPosts, search, filter]);

  const editPost = useCallback((id: string, update: Partial<NotePost>) => {
    if (deletingNoteIds.current.has(id)) return;
    const current = drafts.current.get(id) || posts.find((post) => post.id === id);
    if (!current) return;
    const next = { ...current, ...update, updatedAt: new Date().toISOString() };
    drafts.current.set(id, next);
    versions.current.set(id, (versions.current.get(id) || 0) + 1);
    dirty.current.add(id);
    storeLocal(next);
    updateSaveState(id, conflicts.current.has(id) ? 'conflict' : 'pending');
    setRevision((currentRevision) => currentRevision + 1);
    const previousTimer = timers.current.get(id);
    if (previousTimer) clearTimeout(previousTimer);
    if (!conflicts.current.has(id)) timers.current.set(id, setTimeout(() => { void persist(id).catch(() => undefined); }, 650));
  }, [posts, persist, updateSaveState, storeLocal]);

  useImperativeHandle(ref, () => ({
    flush: async () => { await Promise.all(Array.from(dirty.current).map(id => persist(id))); },
    attachSource: async (id, source) => {
      if (deletingNoteIds.current.has(id)) throw new Error('La suppression de cette note est en cours.');
      const current = drafts.current.get(id) || posts.find(post => post.id === id);
      if (!current) throw new Error('Cette note n’est plus disponible.');
      editPost(id, { sources: mergeNoteSources(getNoteSources(current), [source]) });
      await persist(id);
    },
  }), [editPost, persist, posts]);

  useEffect(() => {
    if (mode !== 'notes' || !selectedPostId) return;
    focusNextSelection.current = false;
    requestAnimationFrame(() => titleInput.current?.focus());
  }, [selectedPostId, mode]);

  const select = (id: string | null) => {
    if (selectedPostId) void persist(selectedPostId).catch(() => undefined);
    if (id) focusNextSelection.current = true;
    onSelectPost(id);
    if (!id) requestAnimationFrame(() => listSearchInput.current?.focus());
  };
  const downloadLocal = (post?: SocialPost) => {
    const copies = post ? [post] : [...Array.from(dirty.current).map(id => drafts.current.get(id)).filter((item): item is SocialPost => !!item), ...recoverableDrafts.map(record => record.post)];
    if (!copies.length) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, kind: 'notes', exportedAt: new Date().toISOString(), posts: copies }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'brouillons-notes.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    copies.forEach(copy => downloadedSnapshots.current.add(noteDraftFingerprint(copy)));
    setExportNotice('Copie des brouillons téléchargée.');
  };
  const archiveLocal = (post: SocialPost) => {
    try {
      writeNoteDraft(window.localStorage, storageKey.current, `${localWriter()}-copie-${crypto.randomUUID()}`, post);
      const current = localRecords.current.get(post.id);
      if (current && removeNoteDraftIfUnchanged(window.localStorage, current.key, post)) localRecords.current.delete(post.id);
      return true;
    } catch {
      setStorageError('La copie locale est indisponible. Téléchargez ce brouillon avant de choisir la version enregistrée.');
      return downloadedSnapshots.current.has(noteDraftFingerprint(post));
    }
  };
  const useServerVersion = () => {
    if (!selected || !selectedConflict || !archiveLocal(selected)) return;
    const timer = timers.current.get(selected.id); if (timer) clearTimeout(timer);
    drafts.current.set(selected.id, selectedConflict.server);
    dirty.current.delete(selected.id); conflicts.current.delete(selected.id); recoveredOrigins.current.delete(selected.id); saveFailures.current.delete(selected.id);
    updateSaveState(selected.id, 'saved'); setConfirmServerVersion(false);
    setRevision(value => value + 1); refreshRecovery();
  };
  const duplicateLocal = async (post: SocialPost, origin?: StoredNoteDraft) => {
    if (!onDuplicatePost || resolvingConflict) return;
    setResolvingConflict(true); setActionError('');
    const version = versions.current.get(post.id);
    try {
      await onDuplicatePost(post);
      const conflict = conflicts.current.get(post.id);
      if (conflict && versions.current.get(post.id) === version) {
        drafts.current.set(post.id, conflict.server); dirty.current.delete(post.id); conflicts.current.delete(post.id); saveFailures.current.delete(post.id);
        cleanupLocal(post.id, post); updateSaveState(post.id, 'saved'); setRevision(value => value + 1);
      }
      if (missingNoteIds.current.has(post.id) && versions.current.get(post.id) === version) {
        dirty.current.delete(post.id); missingNoteIds.current.delete(post.id); cleanupLocal(post.id, post);
        drafts.current.delete(post.id); saveFailures.current.delete(post.id); setRevision(value => value + 1);
      }
      if (origin) {
        try { removeNoteDraftIfUnchanged(window.localStorage, origin.key, origin.post); refreshRecovery(); }
        catch { /* Keep the original recovery copy if cleanup is unavailable. */ }
      }
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'La nouvelle note n’a pas pu être créée. Votre brouillon est conservé.'); }
    finally { setResolvingConflict(false); }
  };
  const restoreDraft = (record: StoredNoteDraft) => {
    if (deletingNoteIds.current.has(record.post.id)) return;
    const current = drafts.current.get(record.post.id);
    if (current && dirty.current.has(current.id) && !archiveLocal(current)) return;
    const timer = timers.current.get(record.post.id); if (timer) clearTimeout(timer);
    drafts.current.set(record.post.id, record.post); dirty.current.add(record.post.id);
    versions.current.set(record.post.id, (versions.current.get(record.post.id) || 0) + 1);
    recoveredOrigins.current.set(record.post.id, [...(recoveredOrigins.current.get(record.post.id) || []), record]);
    conflicts.current.delete(record.post.id); saveFailures.current.delete(record.post.id); storeLocal(record.post); updateSaveState(record.post.id, 'pending');
    setRevision(value => value + 1); select(record.post.id); refreshRecovery();
    timers.current.set(record.post.id, setTimeout(() => { void persist(record.post.id).catch(() => undefined); }, 650));
  };
  const addSourceReference = (event: React.FormEvent) => {
    event.preventDefault(); if (!selected) return;
    const link = safeWebUrl(sourceUrl.trim());
    if (!link) { setSourceError('Saisissez une adresse complète commençant par https:// ou http://.'); return; }
    const feed = new URL(link).hostname.replace(/^www\./, '');
    const source = { title: sourceTitle.trim() || feed, link, feed };
    const current = getNoteSources(selected);
    editPost(selected.id, { sources: sourceEditIndex === null ? mergeNoteSources(current, [source]) : mergeNoteSources(current.map((item, index) => index === sourceEditIndex ? { ...(item.link === link ? item : {}), ...source } : item)) });
    setSourceFormOpen(false); setSourceUrl(''); setSourceTitle(''); setSourceError(''); setSourceEditIndex(null);
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
    deletingNoteIds.current.add(id);
    setDeleting(true);
    setActionError('');
    try {
      await persist(id);
      await onDeletePost(id, drafts.current.get(id)?.revision ?? selected.revision ?? 0);
      cleanupLocal(id, drafts.current.get(id) || selected);
      drafts.current.delete(id);
      dirty.current.delete(id);
      conflicts.current.delete(id); recoveredOrigins.current.delete(id); saveFailures.current.delete(id);
      setSaveStates(current => { const next = { ...current }; delete next[id]; return next; });
      setConfirmDelete(false);
    } catch (error) {
      const cause = error as SaveFailure;
      if (cause.status === 409 && cause.post) {
        conflicts.current.set(id, { server: cause.post }); dirty.current.add(id);
        const current = drafts.current.get(id); if (current) storeLocal(current);
        updateSaveState(id, 'conflict'); setConfirmDelete(false);
        setActionError('Cette note a changé ailleurs. Comparez les versions avant de la supprimer.');
      } else setActionError('La note n’a pas pu être supprimée. Réessayez.');
    } finally { deletingNoteIds.current.delete(id); setDeleting(false); }
  };
  const exportNote = async () => {
    if (!selected || exporting) return;
    setExporting(true); setActionError(''); setExportNotice('');
    try {
      const result = await buildTransferExport({ version: 1, kind: 'notes', exportedAt: new Date().toISOString(), posts: [selected] }, 'notes', exportFormat);
      const url = URL.createObjectURL(new Blob([new Uint8Array(result.bytes).buffer], { type: result.mime }));
      const link = document.createElement('a'); link.href = url; link.download = result.filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportNotice(result.warnings?.join(' ') || 'Note exportée.');
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'L’export a échoué. Réessayez.'); }
    finally { setExporting(false); }
  };
  const editContent = <T extends SocialPlatform>(platform: T, update: Partial<SocialPost['content'][T]>) => {
    if (!selected) return;
    editPost(selected.id, { content: { ...selected.content, [platform]: { ...selected.content[platform], ...update } } });
  };
  const changeStatus = async (post: NotePost, status: PostStatus) => {
    editPost(post.id, { status });
    try { await persist(post.id); } catch { setActionError('Le statut n’a pas pu être enregistré. Votre modification est conservée, réessayez depuis la note.'); }
  };
  const schedulePost = (post: SocialPost, date: string) => {
    editPost(post.id, { scheduledDate: date, scheduledTime: post.scheduledTime || undefined });
    void persist(post.id).catch(() => setActionError('La date n’a pas pu être enregistrée. Votre modification est conservée dans la note.'));
  };

  const noteEditor = selected ? (
    <article className="notes-editor" aria-busy={deleting} aria-label={`Rédaction : ${titleFor(selected)}`} onKeyDown={(event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void persist(selected.id).catch(() => undefined);
      }
    }}>
      <div className="notes-editor-toolbar">
        <button className="notes-mobile-back notes-icon" onClick={() => select(null)} aria-label="Revenir à toutes les notes"><ArrowLeft size={18} /></button>
        <div className={`notes-save-state notes-save-${selectedState}`} role="status" aria-live="polite">
          {selectedState === 'saving' ? <Loader2 size={15} className="notes-spinner" /> : selectedState === 'error' || selectedState === 'conflict' ? <AlertCircle size={15} /> : selectedState === 'saved' ? <Check size={15} /> : <span className="notes-pending-dot" />}
          <span>{selectedState === 'saving' ? 'Enregistrement…' : selectedState === 'conflict' ? 'Deux versions à départager' : selectedState === 'error' ? 'Échec de l’enregistrement' : selectedState === 'pending' ? 'Modifications en cours' : 'Tout est enregistré'}</span>
          {selectedState === 'error' && <button onClick={() => { void persist(selected.id).catch(() => undefined); }}>Réessayer</button>}
        </div>
        <div className="notes-editor-actions">
          <select className="notes-export-format" aria-label="Format d’export de la note" value={exportFormat} onChange={event => setExportFormat(event.target.value as ExportFormat)} disabled={exporting}><option value="md">Markdown</option><option value="txt">Texte</option><option value="html">HTML</option><option value="json">JSON</option><option value="pdf">PDF</option></select><button className="notes-action" onClick={() => void exportNote()} disabled={exporting} aria-label="Exporter la note" title="Exporter la note">{exporting ? <Loader2 size={16} className="notes-spinner" /> : <Download size={16} />}<span>Exporter</span></button>
          <button className="notes-icon" disabled={deleting} onClick={() => setConfirmDelete(true)} aria-label="Supprimer cette note" title="Supprimer cette note"><Trash2 size={17} /></button>
        </div>
      </div>
      {selectedState === 'error' && <p className="notes-inline-error" role="alert">{missingNoteIds.current.has(selected.id) ? 'Cette note a été supprimée ailleurs.' : subscriptionRequired ? 'Votre abonnement ne permet plus d’enregistrer cette note.' : selectedFailure?.status && selectedFailure.message ? selectedFailure.message : 'Le serveur n’a pas reçu les dernières modifications.'} Votre brouillon reste sur cette page{!storageError ? ' et dans une copie locale sur cet appareil' : ''}. <button className="notes-action" onClick={() => downloadLocal(selected)}>Télécharger le brouillon</button>{subscriptionRequired && <a className="notes-action" href="/compte">Mon compte et mon abonnement</a>}{missingNoteIds.current.has(selected.id) && onDuplicatePost && <button className="notes-action" disabled={resolvingConflict} onClick={() => void duplicateLocal(selected)}>Conserver dans une nouvelle note</button>}</p>}
      {confirmDelete && <div className="notes-delete-confirm" role="alert">
        <div><strong>Supprimer cette note ?</strong><p>La note et ses déclinaisons seront supprimées.</p></div>
        <button className="notes-action" onClick={() => setConfirmDelete(false)} disabled={deleting}>Annuler</button>
        <button className="notes-delete-btn" onClick={() => { void remove(); }} disabled={deleting}>{deleting ? 'Suppression…' : 'Supprimer'}</button>
      </div>}
      <div className="notes-editor-scroll">
        {selectedConflict && <section className="notes-conflict" role="alert" aria-label="Deux versions de cette note">
          <h2>Cette note a été modifiée ailleurs</h2><p>Votre brouillon est conservé. Comparez les deux versions avant de choisir.</p>
          <div className="notes-conflict-versions"><div><h3>Votre brouillon</h3><pre tabIndex={0}>{conflictPreview(selected)}</pre></div><div><h3>Version enregistrée</h3><pre tabIndex={0}>{conflictPreview(selectedConflict.server)}</pre></div></div>
          <div className="notes-conflict-actions">{onDuplicatePost && <button className="notes-primary" disabled={resolvingConflict} onClick={() => void duplicateLocal(selected)}>{resolvingConflict ? 'Création…' : 'Conserver mon brouillon dans une nouvelle note'}</button>}<button className="notes-action" onClick={() => downloadLocal(selected)}><Download size={15} />Télécharger mon brouillon</button><button className="notes-action" disabled={resolvingConflict} onClick={() => setConfirmServerVersion(true)}>Utiliser la version enregistrée</button></div>
          {confirmServerVersion && <div className="notes-conflict-confirm"><p>Remplacer le contenu affiché par la version enregistrée ? Votre brouillon restera accessible dans les copies locales.</p><button className="notes-action" onClick={() => setConfirmServerVersion(false)}>Annuler</button><button className="notes-primary" onClick={useServerVersion}>Confirmer le remplacement</button></div>}
        </section>}
        <fieldset className="notes-paper" aria-label="Contenu de la note" disabled={deleting}>
          <div className="notes-paper-topline"><span>Note éditoriale</span><span>Créée le {dateLabel(selected.createdAt.slice(0, 10))}</span></div>
          <section className="notes-source-context" aria-label="Sources de la note"><div className="notes-source-heading"><h2><BookOpen size={15} />{selectedSources.length ? `Sources (${selectedSources.length})` : 'Sources'}</h2><button className="notes-action" onClick={() => { setSourceFormOpen(true); setSourceEditIndex(null); setSourceTitle(''); setSourceUrl(''); setSourceError(''); }}><Plus size={15} />Lier une source</button></div>
            {selectedSources.length ? <ul>{selectedSources.map((source, index) => <li key={`${source.link}-${index}`}><div className="notes-source-main"><span>{source.feed || 'Source liée'}</span>{safeWebUrl(source.link) ? <a href={safeWebUrl(source.link)} target="_blank" rel="noopener noreferrer">{source.title || source.link}<ExternalLink size={13} /></a> : <strong>{source.title || 'Source liée'}</strong>}{source.excerpt && <details><summary>Voir l’extrait du flux</summary><p>{source.excerpt}</p></details>}</div><div className="notes-source-actions"><button className="notes-action" onClick={() => { setSourceEditIndex(index); setSourceUrl(source.link); setSourceTitle(source.title); setSourceError(''); setSourceFormOpen(true); }}>Modifier<span className="notes-sr-only"> la source {source.title}</span></button><button className="notes-icon" aria-label={`Retirer la référence ${source.title}`} onClick={() => editPost(selected.id, { sources: selectedSources.filter((_, sourceIndex) => sourceIndex !== index) })}><X size={15} /></button></div></li>)}</ul> : <p className="notes-source-empty">Liez un article ou une adresse pour garder vos références avec cette note.</p>}
            {sourceFormOpen && <form className="notes-source-form" onSubmit={addSourceReference}>{sourceError && <p role="alert">{sourceError}</p>}<label>Adresse de la source<input autoFocus type="url" required value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://…" /></label><label>Titre de la référence <span>(facultatif)</span><input value={sourceTitle} onChange={event => setSourceTitle(event.target.value)} /></label><div><button className="notes-action" type="button" onClick={() => { setSourceFormOpen(false); setSourceEditIndex(null); }}>Annuler</button><button className="notes-primary" type="submit">{sourceEditIndex === null ? 'Lier la source' : 'Enregistrer la référence'}</button></div></form>}
          </section>
          <label className="notes-writing-label" htmlFor="note-angle">Mon angle</label>
          <textarea ref={titleInput} id="note-angle" className="notes-title-input" rows={1} value={selected.angle} onChange={(event) => editPost(selected.id, { angle: event.target.value })} placeholder="Quel sujet voulez-vous traiter ?" />
          <div className="notes-meta-row">
            <label className="notes-status-control"><span className={`notes-status-mark notes-status-${selected.status}`} /><span className="notes-sr-only">Statut de la note</span><select aria-label="Statut de la note" value={selected.status} onChange={(event) => editPost(selected.id, { status: event.target.value as PostStatus })}>{statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
            <span className="notes-meta-separator" />
            <label className="notes-date-control"><CalendarDays size={15} /><span>Prévu le</span><input aria-label="Date prévue de publication" type="date" value={selected.scheduledDate || ''} onChange={(event) => editPost(selected.id, { scheduledDate: event.target.value || undefined, scheduledTime: event.target.value ? selected.scheduledTime : undefined })} /></label>{selected.scheduledDate && <button className="notes-icon notes-unschedule" aria-label="Retirer la date de publication" onClick={() => editPost(selected.id, { scheduledDate: undefined, scheduledTime: undefined })}><X size={14} /></button>}
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
              <label className="notes-writing-label notes-body-label" htmlFor="note-body">Mes notes</label>
              <textarea id="note-body" className="notes-body-input" value={selected.notes || ''} onChange={(event) => editPost(selected.id, { notes: event.target.value })} placeholder="Vos observations, ce qui mérite d’être vérifié, les points à développer…" />
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
            <label className="notes-tags-field"><span className="notes-section-label">Mots-clés</span><input value={selected.tags.join(',')} onChange={(event) => editPost(selected.id, { tags: event.target.value.split(',') })} placeholder="Enquête, société, à vérifier…" /><span>Séparez les mots-clés par une virgule.</span></label>
          </div>
        </fieldset>
      </div>
    </article>
  ) : <div className="notes-no-selection"><div className="notes-empty-paper" aria-hidden="true"><span /><span /><span /><FileText size={28} /></div><h2>{!mergedPosts.length && loading ? 'Chargement des notes…' : !mergedPosts.length && error ? 'Notes enregistrées indisponibles' : 'Aucune note sélectionnée'}</h2><p>{!mergedPosts.length && error ? 'Réessayez le chargement ou reprenez une copie locale disponible sur cet appareil.' : !mergedPosts.length && loading ? 'Vos notes sont en cours de récupération.' : 'Sélectionnez une note dans la liste ou créez une note.'}</p>{!mergedPosts.length && error && onRetryLoad ? <button className="notes-primary" onClick={onRetryLoad}>Réessayer le chargement</button> : !loading && <button className="notes-primary" onClick={() => { void create(); }} disabled={creating}><Plus size={17} />{creating ? 'Création…' : 'Créer une note'}</button>}</div>;

  const planningPost = (post: NotePost) => <article className="planning-card" key={post.id}>
    <button className="planning-card-open" onClick={() => select(post.id)}><span className="planning-card-source">{getNoteSources(post)[0]?.feed || 'Sujet libre'}</span><h3>{titleFor(post)}</h3>{post.notes && <p>{post.notes}</p>}</button>
    <div className="planning-card-meta"><span><CalendarDays size={14} />{dateLabel(post.scheduledDate)}{post.scheduledDate && post.scheduledTime ? ` · ${post.scheduledTime}` : ''}</span>{saveStates[post.id] === 'saving' && <Loader2 className="notes-spinner" size={14} />}{saveStates[post.id] === 'error' && <AlertCircle size={14} aria-label="Statut non enregistré" />}</div>
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
    {exportNotice && <p className="notes-export-notice" role="status">{exportNotice}</p>}
    {storageError && <div className="notes-action-error" role="alert"><AlertCircle size={17} /><span>{storageError}</span><button className="notes-action" onClick={() => downloadLocal()}><Download size={15} />Télécharger les brouillons</button></div>}
    {recoverableDrafts.length > 0 && <details className="notes-recovery"><summary>{recoverableDrafts.length} copie{recoverableDrafts.length > 1 ? 's' : ''} locale{recoverableDrafts.length > 1 ? 's' : ''} disponible{recoverableDrafts.length > 1 ? 's' : ''} sur cet appareil</summary><p>Ces brouillons viennent d’une session précédente ou d’un autre onglet. Vos notes enregistrées restent conservées.</p><ul>{recoverableDrafts.map(record => <li key={record.key}><div><strong>{titleFor(record.post)}</strong><span>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(record.savedAt))}</span></div><div><button className="notes-action" onClick={() => restoreDraft(record)}>Reprendre</button>{onDuplicatePost && <button className="notes-action" disabled={resolvingConflict} onClick={() => void duplicateLocal(record.post, record)}>Récupérer dans une nouvelle note</button>}<button className="notes-icon" onClick={() => downloadLocal(record.post)} aria-label={`Télécharger la copie locale de ${titleFor(record.post)}`}><Download size={16} /></button></div></li>)}</ul></details>}
    {actionError && <div className="notes-action-error" role="alert"><AlertCircle size={17} /><span>{actionError}</span><button className="notes-icon" onClick={() => setActionError('')} aria-label="Fermer le message"><X size={17} /></button></div>}
    {failedIds.length > 0 && <div className="notes-action-error" role="alert"><AlertCircle size={17} /><span>{failedIds.length === 1 ? 'Une note attend d’être enregistrée.' : `${failedIds.length} notes attendent d’être enregistrées.`} Vos modifications restent disponibles sur cette page.</span><button className="notes-action" onClick={() => { failedIds.forEach((id) => { void persist(id).catch(() => undefined); }); }}>Réessayer</button></div>}
    {Array.from(conflicts.current.keys()).some(id => id !== selectedPostId || mode !== 'notes') && <div className="notes-action-error" role="alert"><AlertCircle size={17} /><span>Des notes ont été modifiées ailleurs. Vos brouillons sont conservés.</span>{Array.from(conflicts.current.keys()).filter(id => id !== selectedPostId || mode !== 'notes').map(id => <button className="notes-action" key={id} onClick={() => select(id)}>Comparer {titleFor(drafts.current.get(id)!)}</button>)}</div>}
    {mode === 'notes' ? <div className="notes-layout"><aside className="notes-list-panel" aria-label="Vos notes"><div className="notes-list-toolbar"><div className="notes-list-heading"><h2>Toutes les notes</h2><span>{mergedPosts.length}</span></div><label className="notes-search"><Search size={17} /><span className="notes-sr-only">Rechercher dans les notes</span><input ref={listSearchInput} placeholder="Rechercher une note…" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button onClick={() => setSearch('')} aria-label="Effacer la recherche"><X size={15} /></button>}</label><label className="notes-filter"><span>Afficher</span><select value={filter} onChange={(event) => setFilter(event.target.value as PostStatus | 'all')}><option value="all">Tous les statuts</option>{statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label></div><div className="notes-list">{filteredPosts.length ? filteredPosts.map((post) => <button key={post.id} className={`notes-list-item ${selectedPostId === post.id ? 'is-active' : ''}`} onClick={() => select(post.id)} aria-current={selectedPostId === post.id ? 'true' : undefined}><div className="notes-list-item-top"><span className={`notes-status-mark notes-status-${post.status}`} /><span>{labelForStatus(post.status)}</span><time dateTime={post.updatedAt}>{dateLabel(post.updatedAt.slice(0, 10))}</time>{saveStates[post.id] === 'error' && <AlertCircle size={14} aria-label="Enregistrement à réessayer" />}</div><h3>{titleFor(post)}</h3><p>{excerptFor(post)}</p><div className="notes-list-item-bottom">{getNoteSources(post).length ? <span><BookOpen size={12} />{getNoteSources(post)[0].feed || 'Source liée'}{getNoteSources(post).length > 1 ? ` +${getNoteSources(post).length - 1}` : ''}</span> : <span>Note libre</span>}{post.tags.filter((tag) => tag.trim()).length > 0 && <span>{post.tags.filter((tag) => tag.trim()).slice(0, 2).join(' · ')}</span>}</div></button>) : <div className="notes-list-empty"><FileText size={25} /><h3>{!mergedPosts.length && loading ? 'Chargement des notes…' : !mergedPosts.length && error ? 'Notes enregistrées indisponibles' : search || filter !== 'all' ? 'Aucune note trouvée' : 'Aucune note'}</h3><p>{!mergedPosts.length && loading ? 'Récupération en cours.' : !mergedPosts.length && error ? 'Vos copies locales restent accessibles ci-dessus.' : search || filter !== 'all' ? 'Essayez un autre mot ou affichez tous les statuts.' : 'Créez une note ou sélectionnez un article dans la veille.'}</p>{!mergedPosts.length && error && onRetryLoad ? <button className="notes-action" onClick={onRetryLoad}>Réessayer</button> : loading ? null : search || filter !== 'all' ? <button className="notes-action" onClick={() => { setSearch(''); setFilter('all'); }}>Réinitialiser les filtres</button> : <button className="notes-action" disabled={creating} onClick={() => { void create(); }}><Plus size={15} />Créer une note</button>}</div>}</div></aside>{noteEditor}</div> : <>
      <div className="planning-view-bar"><div className="planning-view-switch" aria-label="Vue du planning"><button aria-pressed={planView === 'board'} onClick={() => setPlanView('board')}><LayoutGrid size={16} />Tableau</button><button aria-pressed={planView === 'calendar'} onClick={() => setPlanView('calendar')}><CalendarDays size={16} />Calendrier</button></div><span>{mergedPosts.filter((post) => post.status !== 'published').length} sujets en préparation</span></div>
      {planView === 'board' ? <div className="planning-board">{statuses.map((status) => { const columnPosts = mergedPosts.filter((post) => post.status === status.id); return <section className={`planning-column planning-column-${status.id}`} key={status.id}><header><div><span className={`notes-status-mark notes-status-${status.id}`} /><h2>{status.label}</h2><span className="planning-column-count">{columnPosts.length}</span></div><p>{status.hint}</p></header><div className="planning-column-cards">{columnPosts.map(planningPost)}{columnPosts.length === 0 && <div className="planning-column-empty">{status.id === 'idea' ? <><FileText size={22} /><p>Aucun sujet à explorer.</p><button className="notes-action" disabled={creating} onClick={() => { void create(); }}><Plus size={15} />Ajouter un sujet</button></> : status.id === 'published' ? <><CheckCheck size={22} /><p>Aucune publication.</p></> : <p>Aucun sujet.</p>}</div>}</div></section>; })}</div> : <div className="planning-calendar-layout"><div className="planning-calendar"><header><div className="planning-month-nav"><button className="notes-icon" aria-label="Mois précédent" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={19} /></button><h2>{format(month, 'MMMM yyyy', { locale: fr })}</h2><button className="notes-icon" aria-label="Mois suivant" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={19} /></button></div><button className="notes-action" onClick={() => { const today = new Date(); setMonth(today); setSelectedDate(today); }}>Aujourd’hui</button></header><div className="planning-weekdays">{['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'].map((day) => <span key={day}>{day}</span>)}</div><div className="planning-days">{calendarDays.map((day) => { const key = format(day, 'yyyy-MM-dd'); const dayPosts = mergedPosts.filter((post) => post.scheduledDate === key); return <button ref={(element) => { if (element) calendarButtons.current.set(key, element); else calendarButtons.current.delete(key); }} key={key} className={`planning-day ${!isSameMonth(day, month) ? 'is-other-month' : ''} ${isSameDay(day, selectedDate) ? 'is-selected' : ''} ${isSameDay(day, new Date()) ? 'is-today' : ''}`} aria-pressed={isSameDay(day, selectedDate)} aria-label={`${format(day, 'EEEE d MMMM yyyy', { locale: fr })}, ${dayPosts.length} sujet${dayPosts.length > 1 ? 's' : ''}`} onClick={() => setSelectedDate(day)} onKeyDown={(event) => calendarKeyDown(event, day)}><span className="planning-day-number">{format(day, 'd')}</span><span className="planning-day-posts">{dayPosts.slice(0, 2).map((post) => <span key={post.id}>{titleFor(post)}</span>)}{dayPosts.length > 2 && <span className="planning-more">+{dayPosts.length - 2} sujets</span>}</span>{dayPosts.length > 0 && <span className="planning-day-mobile-count">{dayPosts.length}</span>}</button>; })}</div><p className="planning-calendar-help">Sélectionnez une date pour afficher les sujets planifiés.</p></div><aside className="planning-day-inspector"><header><span>Sujets planifiés</span><h2>{format(selectedDate, 'EEEE d MMMM', { locale: fr })}</h2><button className="notes-primary" disabled={creating} onClick={() => { void create(selectedDateKey); }}><Plus size={16} />{creating ? 'Création…' : 'Ajouter un sujet'}</button></header><div className="planning-day-list">{scheduledPosts.length ? scheduledPosts.map((post) => <button key={post.id} className="planning-scheduled-post" onClick={() => select(post.id)}><span><Clock3 size={14} />{post.scheduledTime || 'Heure à définir'}</span><h3>{titleFor(post)}</h3><div><span>{labelForStatus(post.status)}</span><ArrowRight size={16} /></div></button>) : <div className="planning-day-empty"><CalendarDays size={28} /><h3>Aucun sujet planifié</h3><p>Ajoutez un sujet pour cette date.</p></div>}</div><section className="planning-backlog" aria-label="Sujets à planifier"><h3>À planifier <span>{mergedPosts.filter(post => !post.scheduledDate && post.status !== 'published').length}</span></h3><p>Ajouter un sujet existant au {format(selectedDate, 'd MMMM', { locale: fr })}.</p>{mergedPosts.filter(post => !post.scheduledDate && post.status !== 'published').map(post => <div className="planning-backlog-item" key={post.id}><button className="planning-backlog-open" onClick={() => select(post.id)}>{titleFor(post)}</button><button className="notes-action" onClick={() => schedulePost(post, selectedDateKey)} aria-label={`Planifier ${titleFor(post)} le ${format(selectedDate, 'd MMMM', { locale: fr })}`}><Plus size={15} />Planifier</button></div>)}{!mergedPosts.some(post => !post.scheduledDate && post.status !== 'published') && <p>Tous les sujets en préparation ont une date.</p>}</section></aside></div>}
    </>}
  </section>;
});
