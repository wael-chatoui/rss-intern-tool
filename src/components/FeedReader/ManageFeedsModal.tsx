'use client';

import React, { useState } from 'react';
import { X, Rss, Trash2, ExternalLink, Power, Plus } from 'lucide-react';
import { FeedSource } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface ManageFeedsModalProps {
  isOpen: boolean;
  onClose: () => void;
  feeds: FeedSource[];
  onToggleFeed: (id: string, currentEnabled: boolean) => void;
  onDeleteFeed: (id: string) => void;
  onOpenAddModal: () => void;
}

export const ManageFeedsModal: React.FC<ManageFeedsModalProps> = ({
  isOpen,
  onClose,
  feeds,
  onToggleFeed,
  onDeleteFeed,
  onOpenAddModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredFeeds = feeds.filter(
    (f) =>
      f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-lg w-full max-w-xl overflow-hidden shadow-lg flex flex-col max-h-[85vh] animate-modal-pop relative text-card-foreground"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Rss className="w-4 h-4 text-muted-foreground" />
              <span>Gestion des sources RSS ({feeds.length})</span>
            </h2>
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

        {/* Search & Actions Bar */}
        <div className="px-5 py-2.5 border-b border-border bg-card/60 flex items-center justify-between gap-2.5 shrink-0">
          <Input
            type="text"
            placeholder="Filtrer les sources..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 text-xs bg-background flex-1"
          />
          <Button
            size="sm"
            onClick={() => {
              onClose();
              onOpenAddModal();
            }}
            className="gap-1 h-8 text-xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ajouter</span>
          </Button>
        </div>

        {/* Feeds list */}
        <div className="overflow-y-auto p-5 space-y-2 flex-1 divide-y divide-border">
          {filteredFeeds.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">
              Aucun flux ne correspond à votre recherche.
            </p>
          ) : (
            filteredFeeds.map((feed) => (
              <div
                key={feed.id}
                className="pt-2 first:pt-0 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    onClick={() => onToggleFeed(feed.id, feed.enabled)}
                    title={feed.enabled ? 'Désactiver' : 'Activer'}
                    className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
                      feed.enabled
                        ? 'bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    <Power className="w-3 h-3" />
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-xs font-medium truncate ${feed.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {feed.name}
                      </span>
                      <Badge variant="outline" className="text-[10px] py-0 px-1 font-normal">
                        {feed.language.toUpperCase()}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] py-0 px-1 font-normal">
                        {feed.category}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate max-w-sm">
                      {feed.url}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {feed.website && (
                    <a
                      href={feed.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                      title="Visiter le site"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => onDeleteFeed(feed.id)}
                    className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-border bg-card/60 flex justify-end shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs"
          >
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
};
