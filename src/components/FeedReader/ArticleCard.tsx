'use client';

import React from 'react';
import { Bookmark, ExternalLink, Calendar, ArrowRight, Eye, CheckCircle2 } from 'lucide-react';
import { RSSArticle } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ArticleCardProps {
  article: RSSArticle;
  onSelect: (article: RSSArticle) => void;
  onToggleSave: (article: RSSArticle) => void;
  onToggleRead?: (article: RSSArticle) => void;
  onCreatePost: (article: RSSArticle) => void;
}

export const ArticleCard: React.FC<ArticleCardProps> = ({
  article,
  onSelect,
  onToggleSave,
  onToggleRead,
  onCreatePost,
}) => {
  let timeAgo = '';
  try {
    timeAgo = formatDistanceToNow(new Date(article.pubDate), { addSuffix: true, locale: fr });
  } catch {
    timeAgo = '';
  }

  return (
    <article
      className={`group bg-card hover:bg-accent/40 border rounded-lg overflow-hidden transition-colors flex flex-col justify-between ${
        article.read
          ? 'border-border/60 opacity-75 hover:opacity-100'
          : 'border-border hover:border-border'
      }`}
    >
      <div className="p-3.5 sm:p-4 flex-1 flex flex-col">
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="secondary" className="font-normal text-[10px] px-1.5 py-0">
              {article.feedName}
            </Badge>
            <Badge variant="outline" className="font-normal text-[10px] px-1.5 py-0 text-muted-foreground">
              {article.feedLanguage === 'fr' ? 'FR' : 'EN'}
            </Badge>
            {article.category && (
              <span className="text-[10px] text-muted-foreground capitalize hidden sm:inline">
                • {article.category}
              </span>
            )}
            {article.read && (
              <span className="text-[10px] text-muted-foreground/60">
                (lu)
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
            <Calendar className="w-3 h-3 text-muted-foreground/70" />
            <span>{timeAgo}</span>
          </div>
        </div>

        {/* Image preview (if any) */}
        {article.imageUrl && (
          <div
            onClick={() => onSelect(article)}
            className="w-full h-36 mb-2.5 rounded-md overflow-hidden relative cursor-pointer bg-muted/40 border border-border/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.imageUrl}
              alt={article.title}
              className="w-full h-full object-cover group-hover:opacity-95 transition-opacity"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Title */}
        <h3
          onClick={() => onSelect(article)}
          className={`text-sm font-semibold leading-snug line-clamp-2 cursor-pointer mb-1.5 transition-colors ${
            article.read ? 'text-muted-foreground' : 'text-foreground hover:text-foreground/80'
          }`}
        >
          {article.title}
        </h3>

        {/* Snippet */}
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed flex-1">
          {article.snippet}
        </p>

        {/* Author / Metadata */}
        {article.author && (
          <div className="mt-2 text-[10px] text-muted-foreground/70">
            Par {article.author}
          </div>
        )}
      </div>

      {/* Card Footer Actions */}
      <div className="px-3.5 py-2 border-t border-border/70 bg-card/50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSelect(article)}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Aperçu rapide"
          >
            <Eye className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onToggleSave(article)}
            className={`h-7 w-7 ${
              article.saved
                ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title={article.saved ? 'Retirer des favoris' : 'Enregistrer'}
          >
            <Bookmark className={`w-3.5 h-3.5 ${article.saved ? 'fill-current' : ''}`} />
          </Button>

          {onToggleRead && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onToggleRead(article)}
              className={`h-7 w-7 ${
                article.read
                  ? 'text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={article.read ? 'Marquer comme non lu' : 'Marquer comme lu'}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </Button>
          )}

          <a
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Lien original"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => onCreatePost(article)}
          className="h-7 px-2.5 text-xs font-normal gap-1 text-foreground"
        >
          <span>Créer post</span>
          <ArrowRight className="w-3 h-3 text-muted-foreground" />
        </Button>
      </div>
    </article>
  );
};
