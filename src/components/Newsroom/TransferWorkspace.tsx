'use client';

import { authenticatedFetch } from '@/lib/auth-client';

import { ChangeEvent, DragEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertCircle, Archive, ArrowDownToLine, CheckCircle2, Download, File, FileJson, FileText, FolderOpen, History, Loader2, RefreshCw, Rss, Search, Upload, X } from 'lucide-react';
import type { RSSArticle, SocialPost } from '@/types';
import { buildTransferExport, parseTransferFiles } from '@/lib/transfer-formats';
import type { ExportFormat, TransferData, TransferTarget } from '@/lib/transfer-formats';
import type { ApplyImportResult, BackupInfo, ImportPreview } from '@/lib/transfer-store';
import './transfer.css';

interface TransferWorkspaceProps {
  onDataChanged: () => Promise<void>;
  beforeTransfer: () => Promise<void>;
  onMutationChange: (active: boolean) => void;
  currentArticles: RSSArticle[];
  initialTarget?: 'notes' | 'feeds' | 'articles' | 'backup';
  requestKey?: number;
}

type WorkspaceTab = 'export' | 'import' | 'backups';
type ImportMode = 'merge' | 'replace';
type DuplicateMode = 'skip' | 'update';
type ArticleScope = 'current' | 'saved' | 'all';
type BusyAction = 'parse' | 'preview' | 'apply' | 'export' | 'download' | null;
interface TransferSnapshot { data: TransferData; revision: string; backups: BackupInfo[] }

const targets = [
  { value: 'notes' as const, label: 'Notes & rédaction', description: 'Notes, sources liées, statuts et déclinaisons', icon: FileText },
  { value: 'feeds' as const, label: 'Sources RSS', description: 'Adresses des flux et paramètres de collecte', icon: Rss },
  { value: 'articles' as const, label: 'Articles', description: 'Articles de la veille ou de votre sélection', icon: File },
  { value: 'backup' as const, label: 'Espace complet', description: 'Sources, notes, articles et statuts de lecture', icon: Archive },
];
const exportFormats: Record<TransferTarget, { value: ExportFormat; label: string; hint: string }[]> = {
  notes: [
    { value: 'json', label: 'JSON', hint: 'Conserve toutes les données et permet de les réimporter.' },
    { value: 'md', label: 'Markdown', hint: 'Notes lisibles et réutilisables dans un autre carnet.' },
    { value: 'txt', label: 'Texte', hint: 'Un document simple, sans mise en forme.' },
    { value: 'html', label: 'HTML', hint: 'Documents lisibles dans un navigateur.' },
    { value: 'pdf', label: 'PDF', hint: 'Documents prêts à consulter ou à partager.' },
  ],
  feeds: [
    { value: 'opml', label: 'OPML', hint: 'Compatible avec la plupart des lecteurs RSS.' },
    { value: 'json', label: 'JSON', hint: 'Conserve les catégories, langues et états de collecte.' },
  ],
  articles: [
    { value: 'json', label: 'JSON', hint: 'Conserve le contenu et les métadonnées des articles.' },
    { value: 'csv', label: 'CSV', hint: 'Tableau de titres, liens, sources et dates.' },
    { value: 'md', label: 'Markdown', hint: 'Revue de presse en texte avec les liens des sources.' },
    { value: 'html', label: 'HTML', hint: 'Revue de presse lisible dans un navigateur.' },
    { value: 'pdf', label: 'PDF', hint: 'Revue de presse prête à consulter ou à partager.' },
  ],
  backup: [{ value: 'json', label: 'JSON', hint: 'Copie complète de l’espace, à conserver pour une restauration.' }],
};
const importFormats: Record<TransferTarget, { accept: string; label: string; hint: string }> = {
  notes: { accept: '.json,.md,.markdown,.txt,.html,.htm,.pdf,.zip', label: 'JSON, Markdown, TXT, HTML, PDF ou ZIP', hint: 'Plusieurs fichiers sont acceptés. Le PDF importe le texte disponible, sans reconnaissance de texte des pages scannées (OCR).' },
  feeds: { accept: '.json,.opml,.xml', label: 'OPML ou JSON', hint: 'Les fichiers OPML sont compatibles avec les principaux lecteurs RSS. Les flux existants sont détectés avant import.' },
  articles: { accept: '.json,.csv,.md,.markdown,.html,.htm', label: 'JSON, CSV, Markdown ou HTML', hint: 'Les articles importés sont conservés dans Enregistrés. Les liens et les sources disponibles dans les fichiers sont conservés. Utilisez JSON pour préserver toutes les métadonnées.' },
  backup: { accept: '.json', label: 'Sauvegarde complète JSON', hint: 'Ajoutez son contenu à l’espace actuel ou restaurez l’ensemble après vérification.' },
};
const kindLabels = { feeds: 'Source', posts: 'Note', articles: 'Article' };
const actionLabels = { add: 'Ajouter', update: 'Mettre à jour', skip: 'Ignorer' };

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(bytes / 1024)} Ko`;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} Mo`;
}
function savedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(date);
}
function errorMessage(cause: unknown) { return cause instanceof Error ? cause.message : 'Cette opération n’a pas abouti. Réessayez.'; }
async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(url, { cache: 'no-store', ...init });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Cette opération n’a pas abouti. Réessayez.') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return result as T;
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function snapshotArticles(data?: TransferData) {
  if (!data) return [];
  const savedIds = new Set((data.savedArticles || []).map(article => article.id));
  const readIds = new Set(data.readArticleIds || []);
  const pool = new Map((data.cachedArticles || []).map(article => [article.id, article]));
  (data.savedArticles || []).forEach(article => { if (!pool.has(article.id)) pool.set(article.id, article); });
  return Array.from(pool.values()).map(article => ({ ...article, saved: savedIds.has(article.id), read: readIds.has(article.id) }))
    .sort((a, b) => (new Date(b.pubDate).getTime() || 0) - (new Date(a.pubDate).getTime() || 0));
}

export function TransferWorkspace({ onDataChanged, beforeTransfer, onMutationChange, currentArticles, initialTarget = 'notes', requestKey }: TransferWorkspaceProps) {
  const [tab, setTab] = useState<WorkspaceTab>('export');
  const [exportTarget, setExportTarget] = useState<TransferTarget>(initialTarget);
  const [importTarget, setImportTarget] = useState<TransferTarget>(initialTarget);
  const [format, setFormat] = useState<ExportFormat>(initialTarget === 'feeds' ? 'opml' : 'json');
  const [snapshot, setSnapshot] = useState<TransferSnapshot | null>(null);
  const [stateLoading, setStateLoading] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [exportWarnings, setExportWarnings] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [parsedData, setParsedData] = useState<TransferData | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [duplicates, setDuplicates] = useState<DuplicateMode>('skip');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [noteScope, setNoteScope] = useState<'all' | 'selected'>('all');
  const [feedScope, setFeedScope] = useState<'all' | 'enabled'>('all');
  const [articleScope, setArticleScope] = useState<ArticleScope>('current');
  const [chooseArticles, setChooseArticles] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState(new Set<string>());
  const [selectedArticles, setSelectedArticles] = useState(new Set<string>());
  const [selectionSearch, setSelectionSearch] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const stateGeneration = useRef(0);
  const mounted = useRef(true);
  const beforeRef = useRef(beforeTransfer);
  const changedRef = useRef(onDataChanged);
  const mutationRef = useRef(onMutationChange);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const formId = useId();
  beforeRef.current = beforeTransfer;
  changedRef.current = onDataChanged;
  mutationRef.current = onMutationChange;

  const loadSnapshot = useCallback(async () => {
    const token = ++stateGeneration.current;
    setStateLoading(true);
    try {
      await beforeRef.current();
      const result = await requestJson<TransferSnapshot>('/api/transfer');
      if (mounted.current && token === stateGeneration.current) setSnapshot(result);
      return result;
    } finally { if (mounted.current && token === stateGeneration.current) setStateLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void loadSnapshot().catch(cause => { if (mounted.current) setError(errorMessage(cause)); });
    return () => { mounted.current = false; generation.current += 1; stateGeneration.current += 1; };
  }, [loadSnapshot]);
  useEffect(() => {
    generation.current += 1;
    setBusy(null); setFiles([]); setParsedData(null); setPreview(null); setParseWarnings([]); setConfirmReplace(false);
    setError(''); setNotice(''); setExportWarnings([]); setMode('merge'); setTab('export');
    if (fileInput.current) fileInput.current.value = '';
    setExportTarget(initialTarget);
    setImportTarget(initialTarget);
    setFormat(initialTarget === 'feeds' ? 'opml' : 'json');
    setSelectionSearch('');
  }, [initialTarget, requestKey]);

  const allArticles = useMemo(() => snapshotArticles(snapshot?.data), [snapshot]);
  const articleCandidates = useMemo(() => articleScope === 'current' ? currentArticles : articleScope === 'saved' ? allArticles.filter(article => article.saved) : allArticles, [articleScope, currentArticles, allArticles]);
  const notes = snapshot?.data.posts || [];
  const selectionNeedle = selectionSearch.trim().toLocaleLowerCase('fr');
  const listedNotes = notes.filter(post => `${post.angle} ${post.sourceArticleFeed || ''}`.toLocaleLowerCase('fr').includes(selectionNeedle));
  const listedArticles = articleCandidates.filter(article => `${article.title} ${article.feedName}`.toLocaleLowerCase('fr').includes(selectionNeedle));
  const selectedNoteCount = notes.filter(post => selectedNotes.has(post.id)).length;
  const selectedArticleCount = articleCandidates.filter(article => selectedArticles.has(article.id)).length;
  const exportCount = exportTarget === 'notes' ? noteScope === 'all' ? notes.length : selectedNoteCount : exportTarget === 'feeds' ? (snapshot?.data.feeds || []).filter(feed => feedScope === 'all' || feed.enabled).length : exportTarget === 'articles' ? chooseArticles ? selectedArticleCount : articleCandidates.length : null;
  const selectionNeeded = (exportTarget === 'notes' && noteScope === 'selected') || (exportTarget === 'articles' && chooseArticles);
  const importing = busy === 'parse' || busy === 'preview' || busy === 'apply';
  const importWarnings = Array.from(new Set([...parseWarnings, ...(preview?.warnings || [])]));
  const changeCount = preview ? Object.values(preview.summary).reduce((total, counts) => total + counts.added + counts.updated, 0) : 0;
  const includesReadHistory = preview?.data.kind === 'backup' && !!preview.data.readArticleIds?.length;

  const cancelImport = () => {
    generation.current += 1;
    setBusy(null); setFiles([]); setParsedData(null); setPreview(null); setParseWarnings([]); setError(''); setNotice(''); setConfirmReplace(false);
    if (fileInput.current) fileInput.current.value = '';
  };
  const changeImportTarget = (target: TransferTarget) => { cancelImport(); setImportTarget(target); setMode('merge'); };
  const changeExportTarget = (target: TransferTarget) => { setExportTarget(target); setFormat(target === 'feeds' ? 'opml' : 'json'); setSelectionSearch(''); setExportWarnings([]); setError(''); setNotice(''); };
  const toggleId = (id: string, target: 'notes' | 'articles') => {
    const update = (previous: Set<string>) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; };
    if (target === 'notes') setSelectedNotes(update); else setSelectedArticles(update);
  };

  const runPreview = async (data: TransferData, nextMode = mode, nextDuplicates = duplicates, existingToken?: number) => {
    const token = existingToken ?? ++generation.current;
    setBusy('preview'); setPreview(null); setError(''); setNotice(''); setConfirmReplace(false);
    try {
      await beforeRef.current();
      if (token !== generation.current || !mounted.current) return;
      const result = await requestJson<ImportPreview>('/api/transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preview', data, mode: nextMode, duplicates: nextDuplicates }) });
      if (token !== generation.current || !mounted.current) return;
      setPreview(result);
      requestAnimationFrame(() => previewHeading.current?.focus());
    } catch (cause) {
      if (token === generation.current && mounted.current) setError(errorMessage(cause));
    } finally { if (token === generation.current && mounted.current) setBusy(null); }
  };
  const inspectFiles = async (incoming: File[]) => {
    if (!incoming.length || busy === 'apply') return;
    const token = ++generation.current;
    setFiles(incoming); setBusy('parse'); setPreview(null); setParsedData(null); setError(''); setNotice(''); setParseWarnings([]); setConfirmReplace(false);
    try {
      const result = await parseTransferFiles(incoming, importTarget);
      if (token !== generation.current || !mounted.current) return;
      setParsedData(result.data); setParseWarnings(result.warnings);
      await runPreview(result.data, mode, duplicates, token);
    } catch (cause) {
      if (token === generation.current && mounted.current) { setError(errorMessage(cause)); setBusy(null); }
    }
  };
  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => { void inspectFiles(Array.from(event.target.files || [])); };
  const dropFiles = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); if (!busy) void inspectFiles(Array.from(event.dataTransfer.files)); };

  const applyImport = async () => {
    if (!preview || !parsedData || busy || (mode === 'replace' && !confirmReplace)) return;
    const token = ++generation.current;
    setBusy('apply'); setError(''); setNotice('');
    mutationRef.current(true);
    let importCommitted = false;
    let parentUpdated = false;
    try {
      await beforeRef.current();
      if (token !== generation.current || !mounted.current) return;
      const result = await requestJson<ApplyImportResult>('/api/transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'apply', data: parsedData, mode, duplicates, expectedRevision: preview.revision }) });
      importCommitted = true;
      let refreshFailed = false;
      try { await changedRef.current(); parentUpdated = true; } catch { refreshFailed = true; }
      if (token !== generation.current || !mounted.current) return;
      setPreview(null); setParsedData(null); setFiles([]); setParseWarnings([]); setConfirmReplace(false);
      if (fileInput.current) fileInput.current.value = '';
      setNotice(mode === 'replace' ? 'L’espace a été restauré. Une copie de l’état précédent a été conservée dans les sauvegardes.' : 'Import terminé. Les données sont disponibles dans votre espace.');
      try { await loadSnapshot(); } catch { refreshFailed = true; }
      if (refreshFailed && mounted.current) setError('L’import est enregistré, mais l’affichage n’a pas pu être actualisé. Utilisez Actualiser les données, sans réimporter les fichiers.');
      if (mounted.current && result.backups) setSnapshot(previous => previous ? { ...previous, backups: result.backups } : previous);
    } catch (cause) {
      if (token === generation.current && mounted.current) {
        const stale = (cause as Error & { status?: number }).status === 409;
        if (stale) setPreview(null);
        setError(stale ? 'Votre espace a changé depuis l’aperçu. Actualisez l’aperçu, puis vérifiez les modifications avant d’importer.' : errorMessage(cause));
      }
    } finally {
      // Keep stale editors inaccessible if the server import succeeded but the
      // parent could not reload. The refresh action below safely releases the lock.
      if (!importCommitted || parentUpdated) mutationRef.current(false);
      if (token === generation.current && mounted.current) setBusy(null);
    }
  };

  const exportData = async () => {
    if (busy) return;
    const token = ++generation.current;
    setBusy('export'); setError(''); setNotice(''); setExportWarnings([]);
    try {
      const fresh = await loadSnapshot();
      if (token !== generation.current || !mounted.current) return;
      const data: TransferData = { version: 1, kind: exportTarget, exportedAt: new Date().toISOString() };
      if (exportTarget === 'backup') Object.assign(data, fresh.data, { kind: 'backup', exportedAt: data.exportedAt });
      if (exportTarget === 'notes') {
        data.posts = (fresh.data.posts || []).filter(post => noteScope === 'all' || selectedNotes.has(post.id));
        if (!data.posts.length) throw new Error('Sélectionnez au moins une note à exporter.');
      }
      if (exportTarget === 'feeds') {
        data.feeds = (fresh.data.feeds || []).filter(feed => feedScope === 'all' || feed.enabled);
        if (!data.feeds.length) throw new Error('Aucune source ne correspond à cette sélection.');
      }
      if (exportTarget === 'articles') {
        const freshArticles = snapshotArticles(fresh.data);
        const byId = new Map(freshArticles.map(article => [article.id, article]));
        const candidates = articleScope === 'current' ? currentArticles.map(article => byId.get(article.id) || article) : articleScope === 'saved' ? freshArticles.filter(article => article.saved) : freshArticles;
        const selected = candidates.filter(article => !chooseArticles || selectedArticles.has(article.id));
        if (!selected.length) throw new Error('Sélectionnez au moins un article à exporter.');
        data.cachedArticles = selected;
        data.savedArticles = selected.filter(article => article.saved);
        data.readArticleIds = selected.filter(article => article.read).map(article => article.id);
      }
      const result = await buildTransferExport(data, exportTarget, format);
      if (token !== generation.current || !mounted.current) return;
      const buffer = new ArrayBuffer(result.bytes.byteLength);
      new Uint8Array(buffer).set(result.bytes);
      downloadBlob(new Blob([buffer], { type: result.mime }), result.filename);
      setExportWarnings(result.warnings || []);
      setNotice(`Export prêt : ${result.filename}.`);
    } catch (cause) { if (token === generation.current && mounted.current) setError(errorMessage(cause)); }
    finally { if (token === generation.current && mounted.current) setBusy(null); }
  };

  const downloadBackup = async (backup: BackupInfo) => {
    if (busy) return;
    setBusy('download'); setError(''); setNotice('');
    try {
      await beforeRef.current();
      const response = await authenticatedFetch(`/api/transfer?backup=${encodeURIComponent(backup.id)}`, { cache: 'no-store' });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Cette sauvegarde n’est pas disponible.'); }
      downloadBlob(await response.blob(), `sauvegarde-${backup.id.replace(/\.json$/i, '')}.json`);
      if (mounted.current) setNotice('La sauvegarde est prête à télécharger.');
    } catch (cause) { if (mounted.current) setError(errorMessage(cause)); }
    finally { if (mounted.current) setBusy(null); }
  };
  const refreshData = async () => {
    setError('');
    try { await changedRef.current(); mutationRef.current(false); await loadSnapshot(); setNotice('Les données sont à jour.'); }
    catch (cause) { setError(errorMessage(cause)); }
  };

  return <section className="transfer-workspace" aria-label="Import et export des données">
    <div className="transfer-nav" role="tablist" aria-label="Opérations de transfert">
      {([{ id: 'export', label: 'Exporter', icon: Download }, { id: 'import', label: 'Importer', icon: Upload }, { id: 'backups', label: 'Sauvegardes', icon: History }] as const).map((item, index) => <button key={item.id} role="tab" id={`${formId}-${item.id}-tab`} aria-controls={`${formId}-${item.id}-panel`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} disabled={busy === 'apply'} onClick={() => { setTab(item.id); setError(''); setNotice(''); }} onKeyDown={event => {
        const tabs: WorkspaceTab[] = ['export', 'import', 'backups'];
        const next = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length] : event.key === 'ArrowLeft' ? tabs[(index + 2) % tabs.length] : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[2] : null;
        if (next && busy !== 'apply') { event.preventDefault(); setTab(next); document.getElementById(`${formId}-${next}-tab`)?.focus(); }
      }}><item.icon size={16} aria-hidden="true" />{item.label}{item.id === 'backups' && !!snapshot?.backups.length && <span>{snapshot.backups.length}</span>}</button>)}
      <button className="transfer-refresh" onClick={() => void refreshData()} disabled={!!busy || stateLoading} aria-label="Actualiser les données" title="Actualiser les données"><RefreshCw size={15} className={stateLoading ? 'transfer-spinner' : ''} aria-hidden="true" /></button>
    </div>
    {error && <div className="transfer-message transfer-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{error}</span><button className="icon-btn" aria-label="Fermer le message d’erreur" onClick={() => setError('')}><X size={16} aria-hidden="true" /></button></div>}
    <div className={notice ? 'transfer-message transfer-success' : 'sr-only'} role="status" aria-live="polite">{notice && <><CheckCircle2 size={17} aria-hidden="true" /><span>{notice}</span></>}</div>

    {tab === 'export' && <div role="tabpanel" id={`${formId}-export-panel`} aria-labelledby={`${formId}-export-tab`} className="transfer-panel">
      <div className="transfer-content-header"><h2>Exporter des données</h2><p>Choisissez le contenu et le format du fichier à télécharger.</p></div>
      <div className="transfer-export-layout"><div className="transfer-form">
        <fieldset className="transfer-targets"><legend>Contenu à exporter</legend>{targets.map(target => <label key={target.value} className={`transfer-target ${exportTarget === target.value ? 'is-selected' : ''}`}><input type="radio" name={`${formId}-export-target`} value={target.value} checked={exportTarget === target.value} onChange={() => changeExportTarget(target.value)} disabled={!!busy} /><target.icon size={18} aria-hidden="true" /><span><strong>{target.label}</strong><small>{target.description}</small></span><span className="transfer-radio-mark" aria-hidden="true">{exportTarget === target.value && <span />}</span></label>)}</fieldset>
        <div className="transfer-export-settings">
          {exportTarget === 'notes' && <label className="transfer-field">Notes à exporter<select className="field" value={noteScope} onChange={event => { setNoteScope(event.target.value as 'all' | 'selected'); setSelectionSearch(''); }} disabled={!!busy}><option value="all">Toutes les notes ({notes.length})</option><option value="selected">Choisir des notes</option></select></label>}
          {exportTarget === 'feeds' && <label className="transfer-field">Sources à exporter<select className="field" value={feedScope} onChange={event => setFeedScope(event.target.value as 'all' | 'enabled')} disabled={!!busy}><option value="all">Toutes les sources</option><option value="enabled">Sources actives uniquement</option></select></label>}
          {exportTarget === 'articles' && <><label className="transfer-field">Articles à exporter<select className="field" value={articleScope} onChange={event => { setArticleScope(event.target.value as ArticleScope); setSelectionSearch(''); }} disabled={!!busy}><option value="current">Veille affichée ({currentArticles.length})</option><option value="saved">Articles enregistrés ({allArticles.filter(article => article.saved).length})</option><option value="all">Tous les articles disponibles ({allArticles.length})</option></select><span>La veille affichée reprend les filtres actifs de votre espace RSS.</span></label><label className="transfer-check"><input type="checkbox" checked={chooseArticles} onChange={event => setChooseArticles(event.target.checked)} disabled={!!busy} />Choisir des articles dans cette sélection</label></>}
          <label className="transfer-field">Format du fichier<select className="field" value={format} onChange={event => setFormat(event.target.value as ExportFormat)} disabled={!!busy}>{exportFormats[exportTarget].map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><span>{exportFormats[exportTarget].find(item => item.value === format)?.hint}</span></label>
          {exportTarget === 'notes' && ['md', 'txt', 'html'].includes(format) && <p className="transfer-format-note"><FolderOpen size={15} aria-hidden="true" />Plusieurs notes sont regroupées dans une archive ZIP.</p>}{exportTarget === 'notes' && format === 'pdf' && <p className="transfer-format-note"><FileText size={15} aria-hidden="true" />Les notes sont regroupées dans un seul PDF, chaque note commençant sur une nouvelle page.</p>}
        </div>
      </div><aside className="transfer-export-summary"><div className="transfer-summary-symbol">{exportTarget === 'backup' ? <Archive size={23} aria-hidden="true" /> : <FileJson size={23} aria-hidden="true" />}</div><h3>{exportTarget === 'backup' ? 'Sauvegarde complète' : `${exportCount || 0} ${exportTarget === 'notes' ? 'note' : exportTarget === 'feeds' ? 'source' : 'article'}${exportCount === 1 ? '' : 's'}`}</h3><p>{exportTarget === 'backup' ? 'Le fichier JSON contient vos sources, notes, articles et statuts de lecture. Il pourra être réimporté ou restauré dans cet espace.' : `Format ${format.toUpperCase()}. Le fichier sera construit avec les dernières données enregistrées.`}</p>{exportTarget === 'backup' && <dl><div><dt>Sources</dt><dd>{snapshot?.data.feeds?.length || 0}</dd></div><div><dt>Notes</dt><dd>{notes.length}</dd></div><div><dt>Articles disponibles</dt><dd>{allArticles.length}</dd></div></dl>}<button className="btn btn-primary" onClick={() => void exportData()} disabled={!!busy || stateLoading || !snapshot || (exportTarget !== 'backup' && !exportCount)}>{busy === 'export' ? <Loader2 size={16} className="transfer-spinner" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}{busy === 'export' ? 'Préparation du fichier…' : 'Télécharger le fichier'}</button>{busy === 'export' && <button className="transfer-cancel-export" onClick={() => { generation.current += 1; setBusy(null); setNotice('Export annulé.'); }}>Annuler</button>}</aside></div>
      {selectionNeeded && <div className="transfer-selection"><div className="transfer-selection-heading"><h3>{exportTarget === 'notes' ? 'Choisir les notes' : 'Choisir les articles'}<span>{exportTarget === 'notes' ? selectedNoteCount : selectedArticleCount} sélectionné{(exportTarget === 'notes' ? selectedNoteCount : selectedArticleCount) === 1 ? '' : 's'}</span></h3><div><button disabled={!!busy} onClick={() => exportTarget === 'notes' ? setSelectedNotes(new Set(notes.map(post => post.id))) : setSelectedArticles(new Set(articleCandidates.map(article => article.id)))}>Tout sélectionner</button><button disabled={!!busy} onClick={() => exportTarget === 'notes' ? setSelectedNotes(new Set()) : setSelectedArticles(new Set())}>Tout désélectionner</button></div></div><label className="transfer-selection-search"><Search size={16} aria-hidden="true" /><input value={selectionSearch} onChange={event => setSelectionSearch(event.target.value)} placeholder={exportTarget === 'notes' ? 'Rechercher une note…' : 'Rechercher un article…'} aria-label={exportTarget === 'notes' ? 'Rechercher parmi les notes à exporter' : 'Rechercher parmi les articles à exporter'} /></label><div className="transfer-selection-list">{exportTarget === 'notes' ? listedNotes.length ? listedNotes.map((post: SocialPost) => <label key={post.id}><input type="checkbox" checked={selectedNotes.has(post.id)} onChange={() => toggleId(post.id, 'notes')} disabled={!!busy} /><span><strong>{post.angle.trim() || 'Note sans titre'}</strong><small>{post.sourceArticleFeed || 'Note libre'}</small></span></label>) : <p className="transfer-list-empty">Aucune note ne correspond à cette recherche.</p> : listedArticles.length ? listedArticles.map(article => <label key={article.id}><input type="checkbox" checked={selectedArticles.has(article.id)} onChange={() => toggleId(article.id, 'articles')} disabled={!!busy} /><span><strong>{article.title}</strong><small>{article.feedName}{article.saved ? ' · Enregistré' : ''}</small></span></label>) : <p className="transfer-list-empty">Aucun article ne correspond à cette recherche.</p>}</div></div>}
      {exportWarnings.length > 0 && <Warnings warnings={exportWarnings} />}
    </div>}

    {tab === 'import' && <div role="tabpanel" id={`${formId}-import-panel`} aria-labelledby={`${formId}-import-tab`} className="transfer-panel">
      <div className="transfer-content-header"><h2>Importer des données</h2><p>Vérifiez le contenu et les doublons avant de confirmer l’import.</p></div>
      <div className="transfer-import-setup"><label className="transfer-field">Contenu à importer<select className="field" value={importTarget} onChange={event => changeImportTarget(event.target.value as TransferTarget)} disabled={busy === 'apply'}>{targets.map(target => <option key={target.value} value={target.value}>{target.label}</option>)}</select></label><p>{importFormats[importTarget].hint}</p></div>
      <input ref={fileInput} type="file" accept={importFormats[importTarget].accept} multiple={importTarget !== 'backup'} onChange={handleFiles} className="transfer-file-input" tabIndex={-1} aria-label="Fichiers à importer" />
      <div className={`transfer-dropzone ${dragging ? 'is-dragging' : ''} ${files.length ? 'has-files' : ''}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={dropFiles} aria-busy={importing}>
        <div className="transfer-drop-symbol">{importing && busy !== 'apply' ? <Loader2 size={25} className="transfer-spinner" aria-hidden="true" /> : <Upload size={25} aria-hidden="true" />}</div><div><strong>{busy === 'parse' ? 'Lecture des fichiers…' : busy === 'preview' ? 'Préparation de l’aperçu…' : files.length ? `${files.length} fichier${files.length > 1 ? 's' : ''} sélectionné${files.length > 1 ? 's' : ''}` : 'Glissez vos fichiers ici'}</strong><p>{importFormats[importTarget].label}</p></div><button className="btn btn-secondary" onClick={() => fileInput.current?.click()} disabled={!!busy}>{files.length ? 'Changer les fichiers' : 'Choisir les fichiers'}</button>
      </div>
      {files.length > 0 && <div className="transfer-file-list"><div>{files.map((file, index) => <span key={`${file.name}-${index}`}><File size={14} aria-hidden="true" /><strong>{file.name}</strong><small>{humanSize(file.size)}</small></span>)}</div>{busy !== 'apply' && <button className="transfer-clear-files" onClick={cancelImport}>{busy === 'parse' || busy === 'preview' ? 'Annuler l’analyse' : 'Retirer les fichiers'}</button>}</div>}
      {parsedData && <div className="transfer-import-options"><label className="transfer-field">Doublons détectés<select className="field" value={duplicates} onChange={event => { const value = event.target.value as DuplicateMode; setDuplicates(value); void runPreview(parsedData, mode, value); }} disabled={!!busy}><option value="skip">Conserver les données actuelles, ignorer les doublons</option><option value="update">Mettre à jour les doublons avec le fichier importé</option></select></label>{importTarget === 'backup' && <label className="transfer-field">Utilisation de la sauvegarde<select className="field" value={mode} onChange={event => { const value = event.target.value as ImportMode; setMode(value); void runPreview(parsedData, value, duplicates); }} disabled={!!busy}><option value="merge">Ajouter au contenu actuel</option><option value="replace">Restaurer et remplacer l’espace actuel</option></select></label>}{!preview && !importing && <button className="btn btn-secondary" onClick={() => void runPreview(parsedData)}><RefreshCw size={15} aria-hidden="true" />Actualiser l’aperçu</button>}</div>}
      {importWarnings.length > 0 && <Warnings warnings={importWarnings} />}
      {preview && <div className="transfer-preview"><div className="transfer-preview-heading"><h3 tabIndex={-1} ref={previewHeading}>Aperçu des modifications</h3><span>Aucune modification enregistrée</span></div><div className="transfer-preview-counts">{([['feeds', 'Sources'], ['posts', 'Notes'], ['articles', 'Articles']] as const).map(([kind, label]) => { const counts = preview.summary[kind]; return <div key={kind}><h4>{label}</h4><p><strong>{counts.added}</strong> à ajouter</p><span>{counts.updated} à mettre à jour · {counts.skipped} ignoré{counts.skipped === 1 ? '' : 's'}</span></div>; })}</div>{preview.entries.length > 0 ? <div className="transfer-table-wrap"><table className="transfer-preview-table"><thead><tr><th scope="col">Type</th><th scope="col">Contenu</th><th scope="col">Action</th></tr></thead><tbody>{preview.entries.map((entry, index) => <tr key={`${entry.kind}-${entry.title}-${index}`}><td>{kindLabels[entry.kind]}</td><td>{entry.title}</td><td><span className={`transfer-entry-action transfer-entry-${entry.action}`}>{entry.action === 'add' && <PlusMark />}{actionLabels[entry.action]}</span></td></tr>)}</tbody></table></div> : <p className="transfer-preview-empty">Aucune donnée à ajouter avec les options choisies.</p>}{preview.truncated && <p className="transfer-table-note">L’aperçu de la liste est limité. Les totaux incluent l’ensemble du fichier.</p>}
        {mode === 'replace' && <div className="transfer-replace-confirm"><div><AlertCircle size={18} aria-hidden="true" /><div><strong>Cette restauration remplace tout l’espace actuel.</strong><p>Les notes, sources et articles actuels seront remplacés par la sauvegarde. Une copie de l’état précédent sera créée automatiquement avant le remplacement.</p></div></div><label className="transfer-check"><input type="checkbox" checked={confirmReplace} onChange={event => setConfirmReplace(event.target.checked)} disabled={!!busy} />Je confirme le remplacement de mon espace par cette sauvegarde.</label></div>}
        {includesReadHistory && <p className="transfer-table-note">Historique de lecture inclus.</p>}<div className="transfer-import-footer"><p><History size={15} aria-hidden="true" />Une sauvegarde de l’état actuel sera conservée avant l’import.</p><button className={`btn ${mode === 'replace' ? 'transfer-restore-button' : 'btn-primary'}`} onClick={() => void applyImport()} disabled={!!busy || (mode === 'replace' ? !confirmReplace : changeCount === 0 && !includesReadHistory)}>{busy === 'apply' ? <Loader2 size={16} className="transfer-spinner" aria-hidden="true" /> : mode === 'replace' ? <History size={16} aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}{busy === 'apply' ? 'Enregistrement…' : mode === 'replace' ? 'Restaurer cette sauvegarde' : 'Importer les données'}</button></div>
      </div>}
    </div>}

    {tab === 'backups' && <div role="tabpanel" id={`${formId}-backups-panel`} aria-labelledby={`${formId}-backups-tab`} className="transfer-panel"><div className="transfer-content-header"><h2>Sauvegardes avant import</h2><p>Les dix dernières copies de votre espace, créées automatiquement avant chaque import ou restauration.</p></div><div className="transfer-backup-note"><History size={19} aria-hidden="true" /><p>Téléchargez une copie JSON pour la conserver. Pour la restaurer, choisissez <strong>Importer → Espace complet</strong>, puis sélectionnez le fichier téléchargé.</p></div>{stateLoading && !snapshot ? <p className="transfer-loading"><Loader2 size={17} className="transfer-spinner" aria-hidden="true" />Chargement des sauvegardes…</p> : snapshot?.backups.length ? <div className="transfer-backups-list">{snapshot.backups.slice(0, 10).map(backup => <div className="transfer-backup-row" key={backup.id}><span className="transfer-backup-icon"><Archive size={20} aria-hidden="true" /></span><div><strong>{savedDate(backup.createdAt)}</strong><small>Copie complète · {humanSize(backup.size)}</small></div><button className="btn btn-secondary" onClick={() => void downloadBackup(backup)} disabled={!!busy} aria-label={`Télécharger la sauvegarde du ${savedDate(backup.createdAt)}`}><ArrowDownToLine size={16} aria-hidden="true" /><span>Télécharger</span></button></div>)}</div> : <div className="transfer-no-backups"><History size={30} aria-hidden="true" /><h3>Aucune sauvegarde automatique</h3><p>Une copie sera conservée avant votre premier import. Vous pouvez aussi exporter l’espace complet dès maintenant.</p><button className="btn btn-secondary" onClick={() => { changeExportTarget('backup'); setTab('export'); }}><Download size={16} aria-hidden="true" />Exporter l’espace complet</button></div>}</div>}
  </section>;
}

function Warnings({ warnings }: { warnings: string[] }) {
  return <div className="transfer-warnings" role="status"><AlertCircle size={17} aria-hidden="true" /><div><strong>Points à vérifier</strong><ul>{warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div></div>;
}
function PlusMark() { return <span aria-hidden="true">+</span>; }
