'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Newspaper,
  RefreshCw,
  Rss,
  Columns,
  PanelLeft,
  PanelRight,
  Plus,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';
import { LayoutMode } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface HeaderProps {
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenManageFeeds: () => void;
  onOpenAddFeed: () => void;
  layoutMode: LayoutMode;
  onLayoutChange: (mode: LayoutMode) => void;
  onResetSplit?: () => void;
  onNewPost?: () => void;
  stats: {
    activeFeeds: number;
    totalArticles: number;
    savedArticles: number;
    readyPosts: number;
  };
}

export const Header: React.FC<HeaderProps> = ({
  onRefresh,
  isRefreshing,
  onOpenManageFeeds,
  onOpenAddFeed,
  layoutMode,
  onLayoutChange,
  onResetSplit,
  onNewPost,
  stats,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-40 shrink-0">
      <div className="max-w-[1920px] mx-auto px-4 h-13 flex items-center justify-between gap-4 py-2">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-secondary border border-border flex items-center justify-center text-foreground">
            <Newspaper className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm tracking-tight text-foreground">
              Fashion Press
            </span>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
              v1.0
            </Badge>
          </div>
        </div>

        {/* Minimalist Muted Status Badges */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
            <span>{stats.activeFeeds} sources</span>
          </div>
          <span>•</span>
          <span>{stats.totalArticles} articles</span>
          <span>•</span>
          <span>{stats.readyPosts} posts prêts</span>
        </div>

        {/* Actions & Menu */}
        <div className="flex items-center gap-2">
          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="gap-1.5 h-8 text-xs font-normal"
            title="Actualiser les flux RSS"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`}
            />
            <span className="hidden sm:inline">
              {isRefreshing ? 'Actualisation...' : 'Actualiser'}
            </span>
          </Button>

          {/* Quick New Post Trigger */}
          {onNewPost && (
            <Button
              variant="default"
              size="sm"
              onClick={onNewPost}
              className="gap-1.5 h-8 text-xs"
              title="Créer un nouveau post"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Nouveau</span>
            </Button>
          )}

          {/* Options Dropdown Menu */}
          <div className="relative" ref={menuRef}>
            <Button
              variant={isMenuOpen ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="gap-1.5 h-8 text-xs font-normal"
              aria-haspopup="true"
              aria-expanded={isMenuOpen}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">Options</span>
              <ChevronDown
                className={`w-3 h-3 text-muted-foreground transition-transform ${
                  isMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </Button>

            {/* Menu Popover */}
            {isMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-60 rounded-md bg-popover border border-border shadow-md py-1 z-50 text-xs text-popover-foreground animate-modal-pop">
                <div className="px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Sources RSS
                </div>

                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenAddFeed();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent text-left transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Ajouter une source</span>
                </button>

                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenManageFeeds();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent text-left transition-colors"
                >
                  <Rss className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Gérer les sources ({stats.activeFeeds})</span>
                </button>

                <Separator className="my-1" />

                <div className="px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Disposition
                </div>

                <div className="px-2 py-1 grid grid-cols-3 gap-1">
                  <Button
                    variant={layoutMode === 'feed-focused' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => {
                      onLayoutChange('feed-focused');
                      setIsMenuOpen(false);
                    }}
                    className="flex-col h-auto py-1 px-1 text-[11px]"
                  >
                    <PanelLeft className="w-3.5 h-3.5 mb-0.5 text-muted-foreground" />
                    <span>Veille</span>
                  </Button>

                  <Button
                    variant={layoutMode === 'split' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => {
                      onLayoutChange('split');
                      if (onResetSplit) onResetSplit();
                      setIsMenuOpen(false);
                    }}
                    className="flex-col h-auto py-1 px-1 text-[11px]"
                  >
                    <Columns className="w-3.5 h-3.5 mb-0.5 text-muted-foreground" />
                    <span>50 / 50</span>
                  </Button>

                  <Button
                    variant={layoutMode === 'studio-focused' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => {
                      onLayoutChange('studio-focused');
                      setIsMenuOpen(false);
                    }}
                    className="flex-col h-auto py-1 px-1 text-[11px]"
                  >
                    <PanelRight className="w-3.5 h-3.5 mb-0.5 text-muted-foreground" />
                    <span>Studio</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
