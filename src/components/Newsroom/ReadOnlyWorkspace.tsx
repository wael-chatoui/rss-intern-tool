'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Search } from 'lucide-react';
import type { DatabaseSchema, SocialPost } from '@/types';
import { getNoteSources, noteSearchText, validateNotePost } from '@/lib/note-model';
import { noteDraftFingerprint, readNoteDrafts, type StoredNoteDraft } from '@/lib/note-drafts';
import { normalizeSearchText } from '@/lib/search';
import { downloadAccountSnapshot, downloadBlob } from '@/lib/account-export';
import { ArticleReader } from './ArticleReader';
import { safeWebUrl } from './dialog';
import './read-only.css';

type LocalCopy = { record: StoredNoteDraft; note?: SocialPost };
const statuses = { idea: 'À explorer', in_progress: 'En rédaction', ready: 'Prêt à publier', published: 'Publié' };

function plannedDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(date);
}
function NoteContents({ note }: { note: SocialPost }) {
  const sources = getNoteSources(note);
  const social = [
    { name: 'TikTok', fields: [['Accroche', note.content.tiktok.hook], ['Script', note.content.tiktok.script], ['Mise en images', note.content.tiktok.visualNotes], ['Durée estimée', note.content.tiktok.durationEstimate]] },
    { name: 'Instagram', fields: [['Légende', note.content.instagram.caption], ...note.content.instagram.carouselSlides.map((slide, index) => [`Diapositive ${index + 1}`, slide]), ['Hashtags', note.content.instagram.hashtags.join(' ')]] },
    { name: 'LinkedIn', fields: [['Titre', note.content.linkedin.title], ['Publication', note.content.linkedin.body], ...note.content.linkedin.keyTakeaways.map((point, index) => [`Point à retenir ${index + 1}`, point])] },
  ].map(platform => ({ ...platform, fields: platform.fields.filter(([, value]) => value.trim()) })).filter(platform => platform.fields.length);
  return <>
    <p className="read-only-note-meta">{statuses[note.status]}{note.scheduledDate && ` · Prévu le ${plannedDate(note.scheduledDate)}`}{note.scheduledDate && note.scheduledTime && ` à ${note.scheduledTime}`}{note.tags.filter(tag => tag.trim()).length > 0 && ` · ${note.tags.filter(tag => tag.trim()).join(', ')}`}</p>
    <p className="read-only-text">{note.notes || 'Cette note ne contient pas encore de texte.'}</p>
    {sources.length > 0 && <details><summary>Sources de la note</summary><ul>{sources.map((source, index) => <li key={`${source.link}:${index}`}>{safeWebUrl(source.link) ? <a href={safeWebUrl(source.link)} target="_blank" rel="noopener noreferrer">{source.title || source.link}</a> : source.title}{source.excerpt && <p className="read-only-text">{source.excerpt}</p>}</li>)}</ul></details>}
    {social.map(platform => <details className="read-only-social" key={platform.name}><summary>Contenu {platform.name}</summary>{platform.fields.map(([label, value]) => <div key={label}><h4>{label}</h4><p className="read-only-text">{value}</p></div>)}</details>)}
  </>;
}

export function ReadOnlyWorkspace({ database, draftStorageKey }: { database: DatabaseSchema; draftStorageKey: string }) {
  const [query, setQuery] = useState('');
  const [articleId, setArticleId] = useState<string | null>(null);
  const [localCopies, setLocalCopies] = useState<LocalCopy[]>([]);
  const [storageError, setStorageError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportNotice, setExportNotice] = useState('');
  const normalized = normalizeSearchText(query);
  const noteIndex = useMemo(() => new Map(database.posts.map(note => [note.id, normalizeSearchText(noteSearchText(note))])), [database.posts]);
  const articleIndex = useMemo(() => new Map(database.savedArticles.map(article => [article.id, normalizeSearchText(`${article.title} ${article.feedName} ${article.snippet} ${article.content || ''}`)])), [database.savedArticles]);
  const notes = database.posts.filter(note => noteIndex.get(note.id)?.includes(normalized));
  const articles = database.savedArticles.filter(article => articleIndex.get(article.id)?.includes(normalized));
  const activeArticle = database.savedArticles.find(article => article.id === articleId) || null;
  const activeIndex = articles.findIndex(article => article.id === articleId);
  const filteredCopies = localCopies.filter(copy => normalizeSearchText(copy.note ? noteSearchText(copy.note) : copy.record.post.angle).includes(normalized));

  useEffect(() => {
    const refresh = () => {
      try {
        const seen = new Set<string>();
        const copies = readNoteDrafts(window.localStorage, draftStorageKey).filter(record => {
          const fingerprint = noteDraftFingerprint(record.post);
          if (seen.has(fingerprint)) return false;
          seen.add(fingerprint); return true;
        }).map(record => {
          try { return { record, note: validateNotePost(record.post, { id: record.post.id, now: record.savedAt }) }; }
          catch { return { record }; }
        });
        setLocalCopies(copies); setStorageError('');
      } catch { setStorageError('Les copies locales sont indisponibles dans ce navigateur.'); }
    };
    refresh();
    const changed = (event: StorageEvent) => { if (event.key === null || event.key.startsWith(`${draftStorageKey}:draft:`)) refresh(); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [draftStorageKey]);

  const exportAccount = async () => {
    if (exporting) return;
    setExporting(true); setExportError(''); setExportNotice('');
    try {
      await downloadAccountSnapshot();
      setExportNotice('Fichier prêt. Vérifiez les téléchargements de votre navigateur.');
    } catch (cause) { setExportError(cause instanceof Error ? cause.message : 'Le téléchargement a échoué. Réessayez.'); }
    finally { setExporting(false); }
  };
  const downloadCopy = (copy: LocalCopy) => {
    downloadBlob(new Blob([JSON.stringify({ version: 1, kind: 'notes', exportedAt: new Date().toISOString(), posts: [copy.record.post] }, null, 2)], { type: 'application/json' }), 'brouillon-local-redaction.json');
    setExportNotice('Copie locale préparée. Vérifiez les téléchargements de votre navigateur.');
  };

  return <main className="read-only-workspace">
    <header><Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">r.</span><span className="brand-name">La Rédaction</span></Link><Link className="btn btn-primary" href="/compte">Mon compte et mon abonnement</Link></header>
    <h1>Votre espace en lecture seule</h1>
    <p className="read-only-intro">Vos notes et vos articles restent consultables. Réactivez votre abonnement pour écrire et actualiser vos sources.</p>
    <button className="btn btn-secondary" onClick={() => void exportAccount()} disabled={exporting}>{exporting && <Loader2 aria-hidden="true" className="is-spinning" />}{exporting ? 'Préparation du fichier…' : 'Télécharger mes données enregistrées'}</button>
    {exportError && <p className="read-only-error" role="alert">{exportError}</p>}
    {exportNotice && <p className="read-only-notice" role="status">{exportNotice}</p>}
    {storageError && <p className="read-only-error" role="alert">{storageError}</p>}
    <label className="read-only-search"><Search aria-hidden="true" /><span className="sr-only">Rechercher dans mes notes et articles</span><input className="field" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher dans mes notes et articles" /></label>
    {localCopies.length > 0 && <section aria-labelledby="readonly-local-copies"><h2 id="readonly-local-copies">Copies locales non enregistrées</h2><p className="read-only-intro">Ces brouillons sont conservés sur cet appareil. Ils restent consultables et téléchargeables après la fin de votre abonnement. Téléchargez-les avant de vider les données du navigateur.</p>{!filteredCopies.length && <p>Aucune copie locale ne correspond à votre recherche.</p>}{filteredCopies.map(copy => <article className="read-only-note read-only-local-copy" key={copy.record.key}><h3>{copy.record.post.angle || 'Sans titre'}</h3><p className="read-only-note-meta">Copie du <time dateTime={copy.record.savedAt}>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(copy.record.savedAt))}</time></p>{copy.note ? <NoteContents note={copy.note} /> : <p>Cette copie ne peut pas être affichée entièrement. Téléchargez son fichier JSON pour la conserver.</p>}<button className="btn btn-secondary" onClick={() => downloadCopy(copy)}>Télécharger cette copie locale</button></article>)}</section>}
    <section aria-labelledby="readonly-notes"><h2 id="readonly-notes">Mes notes enregistrées</h2>
      {!notes.length && <p>{query ? 'Aucune note ne correspond à votre recherche.' : 'Vous n’avez pas encore de note dans cet espace.'}</p>}
      {notes.map(note => <article className="read-only-note" key={note.id}><h3>{note.angle || 'Sans titre'}</h3><NoteContents note={note} /></article>)}
    </section>
    <section aria-labelledby="readonly-articles"><h2 id="readonly-articles">Mes articles enregistrés</h2>{!articles.length && <p>{query ? 'Aucun article ne correspond à votre recherche.' : 'Aucun article enregistré.'}</p>}<ul className="read-only-articles">{articles.map(article => <li key={article.id}><button className="read-only-article-title" onClick={() => setArticleId(article.id)}>{article.title}</button><small>{article.feedName}</small><span>Lire la copie enregistrée</span></li>)}</ul></section>
    <footer><Link href="/compte">Revenir à mon compte</Link></footer>
    <ArticleReader readOnly article={activeArticle} onClose={() => setArticleId(null)} onPrevious={activeIndex > 0 ? () => setArticleId(articles[activeIndex - 1].id) : undefined} onNext={activeIndex >= 0 && activeIndex < articles.length - 1 ? () => setArticleId(articles[activeIndex + 1].id) : undefined} position={activeIndex >= 0 ? { current: activeIndex + 1, total: articles.length } : undefined} />
  </main>;
}
