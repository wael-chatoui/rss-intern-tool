'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, ArrowUpRight, Bookmark, Check, CheckCheck, ChevronLeft, ChevronRight, FilePenLine, Link2, Loader2, Search, X } from 'lucide-react';
import { RSSArticle, SocialPost } from '@/types';
import { getNoteSources, noteSearchText } from '@/lib/note-model';
import { normalizeSearchText } from '@/lib/search';
import { safeWebUrl, useDialogAccessibility } from './dialog';
import './newsroom-dialogs.css';

interface ArticleReaderBaseProps {
  article: RSSArticle | null;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  position?: { current: number; total: number };
}
interface ArticleReaderActions {
  onToggleSave: (article: RSSArticle) => Promise<void>;
  onToggleRead: (article: RSSArticle) => Promise<void>;
  onCreateNote: (article: RSSArticle) => Promise<void>;
  notes: SocialPost[];
  notesLoading: boolean;
  notesError: string;
  onRetryNotes: () => void;
  onAttachToNote: (id: string, article: RSSArticle) => Promise<void>;
  onReadAndNext: (article: RSSArticle) => Promise<void>;
}
type ArticleReaderProps = ArticleReaderBaseProps & ({ readOnly: true } | ({ readOnly?: false } & ArticleReaderActions));
const EMPTY_NOTES: SocialPost[] = [];
interface InlinePart { text: string; href?: string; strong?: boolean; emphasis?: boolean }
interface ArticleBlock { text: string; parts: InlinePart[]; kind: 'paragraph' | 'heading' | 'quote' | 'list'; items?: InlinePart[][]; ordered?: boolean }

/** Rebuild a small safe text/link tree. No feed HTML is inserted into the page. */
function inlineParts(node: Node, base: string, inherited: Omit<InlinePart, 'text'> = {}): InlinePart[] {
  if (node.nodeType === Node.TEXT_NODE) return [{ ...inherited, text: node.textContent || '' }];
  if (!(node instanceof Element)) return [];
  if (node.tagName === 'BR') return [{ text: '\n' }];
  let href = inherited.href;
  if (node.tagName === 'A') { try { href = safeWebUrl(new URL(node.getAttribute('href') || '', base).href); } catch { href = undefined; } }
  const style = { href, strong: inherited.strong || ['STRONG', 'B'].includes(node.tagName), emphasis: inherited.emphasis || ['EM', 'I'].includes(node.tagName) };
  return Array.from(node.childNodes).flatMap(child => inlineParts(child, base, style));
}
function readableBlocks(content: string | undefined, base: string): ArticleBlock[] {
  if (!content?.trim()) return [];
  const parsed = new DOMParser().parseFromString(content, 'text/html');
  parsed.querySelectorAll('script, style, iframe, form, noscript, nav, footer, object, embed').forEach(node => node.remove());
  const selector = 'p, h1, h2, h3, h4, blockquote, ul, ol';
  const blocks = Array.from(parsed.body.querySelectorAll(selector)).filter(node => !node.parentElement?.closest(selector)).map(node => {
    const parts = inlineParts(node, base);
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
    const kind = /^H[1-4]$/.test(node.tagName) ? 'heading' : node.tagName === 'BLOCKQUOTE' ? 'quote' : ['UL', 'OL'].includes(node.tagName) ? 'list' : 'paragraph';
    return { text, parts, kind, ...(kind === 'list' ? { ordered: node.tagName === 'OL', items: Array.from(node.children).filter(child => child.tagName === 'LI').map(child => inlineParts(child, base)) } : {}) } as ArticleBlock;
  }).filter(block => block.text);
  if (blocks.length) return blocks;
  return (parsed.body.textContent || '').split(/\n\s*\n/).map(text => ({ text: text.replace(/\s+/g, ' ').trim(), parts: [{ text }], kind: 'paragraph' as const })).filter(block => block.text);
}
function renderParts(parts: InlinePart[]): ReactNode[] {
  return parts.map((part, index) => {
    let content: ReactNode = part.text;
    if (part.emphasis) content = <em>{content}</em>;
    if (part.strong) content = <strong>{content}</strong>;
    return part.href ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer">{content}</a> : <span key={index}>{content}</span>;
  });
}
function publishedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date non précisée' : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function ArticleReader(props: ArticleReaderProps) {
  const { article, onClose, onPrevious, onNext, position } = props;
  const editable = props.readOnly ? null : props;
  const notes = editable?.notes || EMPTY_NOTES;
  const notesLoading = editable?.notesLoading || false;
  const notesError = editable?.notesError || '';
  const backdropRef = useRef<HTMLDialogElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const actionGeneration = useRef(0);
  const titleId = useId();
  const [blocks, setBlocks] = useState<ArticleBlock[]>([]);
  const [snippet, setSnippet] = useState('');
  const [pending, setPending] = useState<'save' | 'read' | 'note' | 'advance' | 'attach' | null>(null);
  const [error, setError] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const [choosingNote, setChoosingNote] = useState(false);
  const [noteQuery, setNoteQuery] = useState('');
  const close = () => { actionGeneration.current += 1; onClose(); };
  useDialogAccessibility(!!article, dialogRef, close);

  // The browser's top layer keeps the reader above long, scrolled workspaces.
  const isOpen = !!article;
  useEffect(() => {
    const dialog = backdropRef.current;
    if (!isOpen || !dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, [isOpen]);

  useEffect(() => {
    actionGeneration.current += 1;
    setBlocks(readableBlocks(article?.content, article?.link || ''));
    setSnippet(readableBlocks(article?.snippet, article?.link || '').map(block => block.text).join(' '));
    setError(''); setPending(null); setImageFailed(false); setChoosingNote(false); setNoteQuery('');
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    const frame = requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [article?.id, article?.content, article?.snippet, article?.link]);
  useEffect(() => {
    if (!choosingNote) return;
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [choosingNote]);
  const matchingNotes = useMemo(() => {
    const query = normalizeSearchText(noteQuery);
    return [...notes].filter(note => !query || normalizeSearchText(noteSearchText(note)).includes(query)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [notes, noteQuery]);

  if (!article) return null;
  const originalUrl = safeWebUrl(article.link);
  const imageUrl = safeWebUrl(article.imageUrl);
  const contentBlocks = blocks.filter(block => block.text !== snippet && block.text !== article.title);
  const readingMinutes = Math.max(1, Math.ceil(`${snippet} ${contentBlocks.map(block => block.text).join(' ')}`.split(/\s+/).length / 220));
  const runAction = async (kind: 'save' | 'read' | 'note' | 'advance') => {
    if (!editable || pending) return;
    const generation = actionGeneration.current;
    setPending(kind); setError('');
    try {
      await (kind === 'save' ? editable.onToggleSave(article) : kind === 'read' ? editable.onToggleRead(article) : kind === 'advance' ? editable.onReadAndNext(article) : editable.onCreateNote(article));
      if (kind === 'note' && generation === actionGeneration.current) onClose();
    } catch (cause) { if (generation === actionGeneration.current) setError(cause instanceof Error ? cause.message : 'Cette action n’a pas abouti. Réessayez.'); }
    finally { if (generation === actionGeneration.current) setPending(null); }
  };
  const attach = async (id: string) => {
    if (!editable || pending) return;
    const generation = actionGeneration.current;
    setPending('attach'); setError('');
    try { await editable.onAttachToNote(id, article); if (generation === actionGeneration.current) onClose(); }
    catch (cause) { if (generation === actionGeneration.current) setError(cause instanceof Error ? cause.message : 'La référence n’a pas pu être ajoutée. Réessayez.'); }
    finally { if (generation === actionGeneration.current) setPending(null); }
  };

  return <dialog ref={backdropRef} className="dialog-backdrop reader-backdrop" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="reader-panel" ref={dialogRef} tabIndex={-1}>
      <header className="reader-toolbar">
        <div className="reader-source"><span className="reader-source-mark" aria-hidden="true">{article.feedName.trim().slice(0, 1).toLocaleUpperCase('fr')}</span><div><strong>{article.feedName}</strong><span>{article.feedLanguage === 'fr' ? 'Français' : 'Anglais'}</span></div></div>
        {position && <span className="reader-position">Article {position.current} sur {position.total}</span>}
        <button className="icon-btn reader-close" onClick={close} aria-label="Fermer l’article" title="Fermer (Échap)"><X size={21} aria-hidden="true" /></button>
      </header>
      <div className="reader-scroll" ref={scrollRef} tabIndex={0} aria-label={choosingNote ? 'Choisir un sujet' : 'Contenu de l’article'}>
        {choosingNote && editable ? <section className="reader-note-picker">
          <button className="btn btn-ghost" onClick={() => { setChoosingNote(false); setError(''); requestAnimationFrame(() => headingRef.current?.focus()); }}><ArrowLeft aria-hidden="true" />Revenir à l’article</button>
          <h1 id={titleId}>Ajouter à un sujet existant</h1><p>La référence sera ajoutée aux sources du sujet. Vos notes restent conservées.</p>
          <label className="reader-note-search"><Search aria-hidden="true" /><span className="sr-only">Rechercher un sujet</span><input ref={searchRef} className="field" value={noteQuery} onChange={event => setNoteQuery(event.target.value)} placeholder="Rechercher dans vos notes…" /></label>
          {notesError ? <div className="dialog-message dialog-message-error" role="alert"><p>{notesError}</p><button className="btn btn-secondary" onClick={editable.onRetryNotes}>Recharger les notes</button></div> : notesLoading ? <p role="status"><Loader2 className="is-spinning" aria-hidden="true" />Chargement des notes…</p> : matchingNotes.length ? <div className="reader-note-options">{matchingNotes.map(note => {
            const attached = getNoteSources(note).some(source => source.articleId === article.id || (source.link && source.link === article.link));
            return <button key={note.id} disabled={!!pending} onClick={() => void attach(note.id)}><span><strong>{note.angle.trim() || 'Note sans titre'}</strong><small>{attached ? 'Source déjà présente' : `${getNoteSources(note).length} référence${getNoteSources(note).length === 1 ? '' : 's'}`}</small></span>{pending === 'attach' ? <Loader2 className="is-spinning" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}</button>;
          })}</div> : <div className="reader-note-empty"><p>{noteQuery ? 'Aucun sujet ne correspond à cette recherche.' : 'Vous n’avez pas encore de note.'}</p>{noteQuery ? <button className="btn btn-secondary" onClick={() => setNoteQuery('')}>Effacer la recherche</button> : <button className="btn btn-primary" disabled={!!pending} onClick={() => void runAction('note')}>Créer une note avec cette source</button>}</div>}
        </section> : <article className="reader-article">
          <div className="reader-metadata"><time dateTime={article.pubDate}>{publishedDate(article.pubDate)}</time><span aria-hidden="true">·</span><span>{readingMinutes} min de lecture</span>{article.read && <span className="reader-read-status"><Check size={12} aria-hidden="true" /> Lu</span>}</div>
          <h1 className="reader-title" id={titleId} ref={headingRef} tabIndex={-1} data-dialog-autofocus>{article.title}</h1>
          {article.author && <p className="reader-byline">Par <strong>{article.author}</strong></p>}
          {originalUrl && <div className="reader-original-early"><span>{contentBlocks.length ? 'Texte du flux RSS' : 'Extrait du flux RSS'}</span><a href={originalUrl} target="_blank" rel="noopener noreferrer">{contentBlocks.length ? 'Ouvrir l’article original' : 'Lire l’article complet'}<ArrowUpRight size={15} aria-hidden="true" /></a></div>}
          {snippet && <p className="reader-lede">{snippet}</p>}
          {imageUrl && !imageFailed && <figure className="reader-figure"><img src={imageUrl} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /></figure>}
          {contentBlocks.length > 0 && <div className="reader-body">{contentBlocks.map((block, index) => block.kind === 'heading' ? <h2 key={index}>{renderParts(block.parts)}</h2> : block.kind === 'quote' ? <blockquote key={index}>{renderParts(block.parts)}</blockquote> : block.kind === 'list' ? block.ordered ? <ol key={index}>{block.items?.map((item, i) => <li key={i}>{renderParts(item)}</li>)}</ol> : <ul key={index}>{block.items?.map((item, i) => <li key={i}>{renderParts(item)}</li>)}</ul> : <p key={index}>{renderParts(block.parts)}</p>)}</div>}
          <div className="reader-original"><span className="reader-original-rule" aria-hidden="true" /><p>{contentBlocks.length ? 'Texte fourni par le flux RSS. Retrouvez l’article original sur le site de la source.' : 'Le flux fournit un extrait. La suite est disponible sur le site de la source.'}</p>{originalUrl && <a href={originalUrl} target="_blank" rel="noopener noreferrer">Lire sur {article.feedName}<ArrowUpRight size={17} aria-hidden="true" /></a>}</div>
        </article>}
      </div>
      <footer className="reader-footer">
        {error && <p className="dialog-message dialog-message-error" role="alert"><AlertCircle size={16} aria-hidden="true" />{error}</p>}
        {!choosingNote && <div className="reader-navigation" aria-label="Parcourir les articles"><button className="btn btn-ghost" aria-label="Article précédent" onClick={onPrevious} disabled={!!pending || !onPrevious}><ChevronLeft aria-hidden="true" /><span>Précédent</span></button>{editable && <button className="btn btn-secondary" onClick={() => void runAction('advance')} disabled={!!pending}>{pending === 'advance' ? <Loader2 className="dialog-spinner" aria-hidden="true" /> : <CheckCheck aria-hidden="true" />}{onNext ? 'Lu et suivant' : 'Lu et terminer'}</button>}<button className="btn btn-ghost" aria-label="Article suivant" onClick={onNext} disabled={!!pending || !onNext}><span>Suivant</span><ChevronRight aria-hidden="true" /></button></div>}
        {!editable && <p className="reader-readonly-notice">Copie enregistrée, en lecture seule.</p>}
        {!choosingNote && editable && <div className="reader-footer-actions"><div className="reader-utility-actions">
          <button className={`btn btn-secondary ${article.saved ? 'reader-is-saved' : ''}`} onClick={() => void runAction('save')} disabled={!!pending} aria-pressed={!!article.saved}>{pending === 'save' ? <Loader2 className="dialog-spinner" aria-hidden="true" /> : <Bookmark fill={article.saved ? 'currentColor' : 'none'} aria-hidden="true" />}<span>{article.saved ? 'Enregistré' : 'Enregistrer'}</span></button>
          <button className="icon-btn reader-read-toggle" aria-label={article.read ? 'Marquer non lu' : 'Marquer comme lu'} title={article.read ? 'Marquer non lu' : 'Marquer comme lu'} onClick={() => void runAction('read')} disabled={!!pending} aria-pressed={!!article.read}><CheckCheck aria-hidden="true" /></button>
        </div><div className="reader-subject-actions"><button className="btn btn-secondary" disabled={!!pending} onClick={() => setChoosingNote(true)}><Link2 aria-hidden="true" /><span>Ajouter à un sujet</span></button><button className="btn btn-primary" onClick={() => void runAction('note')} disabled={!!pending}>{pending === 'note' ? <Loader2 className="dialog-spinner" aria-hidden="true" /> : <FilePenLine aria-hidden="true" />}Créer une note</button></div></div>}
      </footer>
    </div>
  </dialog>;
}
