'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, Bookmark, Check, CheckCheck, FilePenLine, Loader2, X } from 'lucide-react';
import { RSSArticle } from '@/types';
import { safeWebUrl, useDialogAccessibility } from './dialog';
import './newsroom-dialogs.css';

interface ArticleReaderProps {
  article: RSSArticle | null;
  onClose: () => void;
  onToggleSave: (article: RSSArticle) => Promise<void>;
  onToggleRead: (article: RSSArticle) => Promise<void>;
  onCreateNote: (article: RSSArticle) => Promise<void>;
}

interface ArticleBlock { text: string; kind: 'paragraph' | 'heading' | 'quote' }

function readableBlocks(content?: string): ArticleBlock[] {
  if (!content?.trim()) return [];
  const parsed = new DOMParser().parseFromString(content, 'text/html');
  parsed.querySelectorAll('script, style, iframe, form, noscript, nav, footer').forEach(node => node.remove());
  const selector = 'p, h1, h2, h3, h4, blockquote, li';
  const blocks = Array.from(parsed.body.querySelectorAll(selector))
    .filter(node => !node.parentElement?.closest(selector))
    .map(node => ({
      text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
      kind: /^H[1-4]$/.test(node.tagName) ? 'heading' as const : node.tagName === 'BLOCKQUOTE' ? 'quote' as const : 'paragraph' as const,
    })).filter(block => block.text.length > 0);
  if (blocks.length) return blocks;
  return (parsed.body.textContent || '').split(/\n\s*\n/).map(text => ({ text: text.replace(/\s+/g, ' ').trim(), kind: 'paragraph' as const })).filter(block => block.text.length > 0);
}

function publishedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date non précisée';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function ArticleReader({ article, onClose, onToggleSave, onToggleRead, onCreateNote }: ArticleReaderProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [blocks, setBlocks] = useState<ArticleBlock[]>([]);
  const [snippet, setSnippet] = useState('');
  const [pending, setPending] = useState<'save' | 'read' | 'note' | null>(null);
  const [error, setError] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  useDialogAccessibility(!!article, dialogRef, onClose);

  useEffect(() => {
    setBlocks(readableBlocks(article?.content));
    setSnippet(readableBlocks(article?.snippet).map(block => block.text).join(' '));
    setError('');
    setPending(null);
    setImageFailed(false);
  }, [article?.id, article?.content, article?.snippet]);

  if (!article) return null;
  const originalUrl = safeWebUrl(article.link);
  const imageUrl = safeWebUrl(article.imageUrl);
  const contentBlocks = blocks.filter(block => block.text !== snippet && block.text !== article.title);
  const readingMinutes = Math.max(1, Math.ceil(`${snippet} ${blocks.map(block => block.text).join(' ')}`.split(/\s+/).length / 220));

  const runAction = async (kind: 'save' | 'read' | 'note') => {
    if (pending) return;
    setPending(kind);
    setError('');
    try {
      await (kind === 'save' ? onToggleSave(article) : kind === 'read' ? onToggleRead(article) : onCreateNote(article));
      if (kind === 'note') onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Cette action n’a pas abouti. Réessayez.');
    } finally { setPending(null); }
  };

  return (
    <div className="dialog-backdrop reader-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="reader-panel" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="reader-toolbar">
          <div className="reader-source"><span className="reader-source-mark" aria-hidden="true">{article.feedName.trim().slice(0, 1).toLocaleUpperCase('fr')}</span><div><strong>{article.feedName}</strong><span>Langue · {article.feedLanguage === 'fr' ? 'Français' : 'Anglais'}</span></div></div>
          <button className="icon-btn reader-close" onClick={onClose} aria-label="Fermer l’article" title="Fermer (Échap)"><X size={21} aria-hidden="true" /></button>
        </header>
        <div className="reader-scroll">
          <article className="reader-article">
            <div className="reader-metadata"><time dateTime={article.pubDate}>{publishedDate(article.pubDate)}</time><span aria-hidden="true">·</span><span>{readingMinutes} min de lecture</span>{article.read && <span className="reader-read-status"><Check size={12} aria-hidden="true" /> Lu</span>}</div>
            <h1 className="reader-title" id={titleId}>{article.title}</h1>
            {article.author && <p className="reader-byline">Par <strong>{article.author}</strong></p>}
            {snippet && <p className="reader-lede">{snippet}</p>}
            {imageUrl && !imageFailed && <figure className="reader-figure">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={imageUrl} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /></figure>}
            {contentBlocks.length > 0 && <div className="reader-body">{contentBlocks.map((block, index) => block.kind === 'heading' ? <h2 key={index}>{block.text}</h2> : block.kind === 'quote' ? <blockquote key={index}>{block.text}</blockquote> : <p key={index}>{block.text}</p>)}</div>}
            <div className="reader-original"><span className="reader-original-rule" aria-hidden="true" /><p>{contentBlocks.length > 0 ? 'Texte fourni par le flux RSS. L’article original est disponible sur le site de la source.' : 'Le flux RSS fournit uniquement un extrait. Ouvrez l’article original pour lire la suite.'}</p>{originalUrl && <a href={originalUrl} target="_blank" rel="noopener noreferrer">Lire sur {article.feedName}<ArrowUpRight size={17} aria-hidden="true" /></a>}</div>
          </article>
        </div>
        <footer className="reader-footer">
          {error && <p className="dialog-message dialog-message-error" role="alert"><AlertCircle size={16} aria-hidden="true" />{error}</p>}
          <div className="reader-footer-actions"><div className="reader-utility-actions">
            <button className={`btn btn-secondary ${article.saved ? 'reader-is-saved' : ''}`} onClick={() => runAction('save')} disabled={!!pending} aria-pressed={!!article.saved}>{pending === 'save' ? <Loader2 size={16} className="dialog-spinner" aria-hidden="true" /> : <Bookmark size={16} fill={article.saved ? 'currentColor' : 'none'} aria-hidden="true" />}<span>{article.saved ? 'Enregistré' : 'Enregistrer'}</span></button>
            <button className="btn btn-ghost reader-read-action" aria-label={article.read ? 'Marquer non lu' : 'Marquer comme lu'} onClick={() => runAction('read')} disabled={!!pending} aria-pressed={!!article.read}>{pending === 'read' ? <Loader2 size={17} className="dialog-spinner" aria-hidden="true" /> : <CheckCheck size={17} aria-hidden="true" />}<span>{article.read ? 'Marquer non lu' : 'Marquer comme lu'}</span></button>
          </div><button className="btn btn-primary" onClick={() => runAction('note')} disabled={!!pending}>{pending === 'note' ? <Loader2 size={17} className="dialog-spinner" aria-hidden="true" /> : <FilePenLine size={17} aria-hidden="true" />}Créer une note</button></div>
        </footer>
      </div>
    </div>
  );
}
