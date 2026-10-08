'use client';

import React from 'react';
import { X, ExternalLink, Calendar, Bookmark, Send } from 'lucide-react';
import { RSSArticle } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ArticleModalProps {
  article: RSSArticle | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleSave: (article: RSSArticle) => void;
  onCreatePostFromArticle: (article: RSSArticle) => void;
}

export const ArticleModal: React.FC<ArticleModalProps> = ({
  article,
  isOpen,
  onClose,
  onToggleSave,
  onCreatePostFromArticle,
}) => {
  if (!isOpen || !article) return null;

  let timeAgo = '';
  try {
    timeAgo = formatDistanceToNow(new Date(article.pubDate), { addSuffix: true, locale: fr });
  } catch {
    timeAgo = article.pubDate;
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-lg w-full max-w-xl overflow-hidden shadow-lg flex flex-col max-h-[85vh] animate-modal-pop relative"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[11px] font-normal">
              {article.feedName}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {article.feedLanguage === 'fr' ? 'FR' : 'EN'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto p-5 space-y-3.5 flex-1">
          {article.imageUrl && (
            <div className="relative w-full h-56 rounded-md overflow-hidden border border-border/60 bg-muted/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={article.imageUrl}
                alt={article.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span>{timeAgo}</span>
              {article.author && <span>• Par {article.author}</span>}
            </div>
            <h1 className="text-base sm:text-lg font-semibold text-foreground leading-snug">
              {article.title}
            </h1>
          </div>

          <div className="text-xs text-muted-foreground leading-relaxed bg-secondary/40 p-3.5 rounded-md border border-border/60">
            {article.snippet}
          </div>

          <div className="pt-1">
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-foreground hover:underline"
            >
              <span>Consulter l'article original sur {article.feedName}</span>
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
            </a>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-border bg-card/60 flex items-center justify-between shrink-0">
          <Button
            variant={article.saved ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => onToggleSave(article)}
            className="gap-1.5 text-xs"
          >
            <Bookmark className={`w-3.5 h-3.5 ${article.saved ? 'fill-current text-amber-400' : 'text-muted-foreground'}`} />
            <span>{article.saved ? 'Favori' : 'Enregistrer'}</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => {
              onCreatePostFromArticle(article);
              onClose();
            }}
            className="gap-1.5 text-xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Créer un post</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
