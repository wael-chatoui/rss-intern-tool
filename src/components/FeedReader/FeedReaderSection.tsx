'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Filter,
  Bookmark,
  RefreshCw,
  Layers,
  X,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { FashionCategory, FeedSource, Language, RSSArticle } from '@/types';
import { ArticleCard } from './ArticleCard';
import { ArticleModal } from './ArticleModal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface FeedReaderSectionProps {
  articles: RSSArticle[];
  feeds: FeedSource[];
  isLoading: boolean;
  selectedCategory: FashionCategory;
  onSelectCategory: (cat: FashionCategory) => void;
  selectedLanguage: Language;
  onSelectLanguage: (lang: Language) => void;
  selectedFeedId: string;
  onSelectFeedId: (id: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showSavedOnly: boolean;
  onToggleShowSavedOnly: () => void;
  onToggleSaveArticle: (article: RSSArticle) => void;
  onToggleReadArticle?: (article: RSSArticle) => void;
  onCreatePostFromArticle: (article: RSSArticle) => void;
}

const CATEGORIES: { id: FashionCategory; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'haute-couture', label: 'Haute Couture' },
  { id: 'business', label: 'Business' },
  { id: 'streetwear', label: 'Streetwear' },
  { id: 'trends', label: 'Tendances' },
  { id: 'sustainability', label: 'RSE' },
];

export const FeedReaderSection: React.FC<FeedReaderSectionProps> = ({
  articles,
  feeds,
  isLoading,
  selectedCategory,
  onSelectCategory,
  selectedLanguage,
  onSelectLanguage,
  selectedFeedId,
  onSelectFeedId,
  searchQuery,
  onSearchChange,
  showSavedOnly,
  onToggleShowSavedOnly,
  onToggleSaveArticle,
  onToggleReadArticle,
  onCreatePostFromArticle,
}) => {
  const [activeArticle, setActiveArticle] = useState<RSSArticle | null>(null);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setIsFilterMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFilterMenuOpen(false);
    };

    if (isFilterMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFilterMenuOpen]);

  const activeFiltersCount =
    (selectedLanguage !== 'all' ? 1 : 0) +
    (selectedFeedId !== 'all' ? 1 : 0) +
    (showSavedOnly ? 1 : 0);

  const resetAllFilters = () => {
    onSelectLanguage('all');
    onSelectFeedId('all');
    onSelectCategory('all');
    if (showSavedOnly) onToggleShowSavedOnly();
    onSearchChange('');
    setIsFilterMenuOpen(false);
  };

  const displayedArticles = showSavedOnly
    ? articles.filter((a) => a.saved)
    : articles;

  const savedCount = articles.filter((a) => a.saved).length;

  return (
    <section className="flex flex-col h-full bg-background border-r border-border">
      {/* Top Filter Bar */}
      <div className="p-3 border-b border-border bg-card/60 space-y-2.5 shrink-0">
        {/* Row 1: Search + Filters Popover + Favorites */}
        <div className="flex items-center gap-2">
          {/* Integrated Search Input */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              type="text"
              placeholder="Rechercher marque, tendance, défilé..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-8 pr-7 h-8 text-xs bg-background"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title="Effacer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filters Menu Button */}
          <div className="relative" ref={filterMenuRef}>
            <Button
              variant={isFilterMenuOpen || activeFiltersCount > 0 ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
              className="gap-1.5 h-8 text-xs font-normal"
            >
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">Filtres</span>
              {activeFiltersCount > 0 && (
                <Badge variant="default" className="h-4 px-1 text-[9px]">
                  {activeFiltersCount}
                </Badge>
              )}
              <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${isFilterMenuOpen ? 'rotate-180' : ''}`} />
            </Button>

            {/* Filter Popover */}
            {isFilterMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-64 rounded-md bg-popover border border-border shadow-md p-3 z-50 text-xs space-y-3 animate-modal-pop text-popover-foreground">
                <div className="flex items-center justify-between pb-1 border-b border-border">
                  <span className="font-medium text-xs">Filtres</span>
                  {activeFiltersCount > 0 && (
                    <button
                      onClick={resetAllFilters}
                      className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Réinitialiser</span>
                    </button>
                  )}
                </div>

                {/* Filter: Language */}
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">
                    Langue
                  </label>
                  <div className="grid grid-cols-3 gap-1 bg-secondary/50 p-0.5 rounded-md border border-border">
                    <button
                      onClick={() => onSelectLanguage('all')}
                      className={`py-1 rounded text-[11px] transition-colors ${
                        selectedLanguage === 'all'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Toutes
                    </button>
                    <button
                      onClick={() => onSelectLanguage('fr')}
                      className={`py-1 rounded text-[11px] transition-colors ${
                        selectedLanguage === 'fr'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      FR
                    </button>
                    <button
                      onClick={() => onSelectLanguage('en')}
                      className={`py-1 rounded text-[11px] transition-colors ${
                        selectedLanguage === 'en'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      EN
                    </button>
                  </div>
                </div>

                {/* Filter: Source Feed */}
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">
                    Source
                  </label>
                  <select
                    value={selectedFeedId}
                    onChange={(e) => onSelectFeedId(e.target.value)}
                    className="w-full h-8 px-2 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="all">Toutes ({feeds.length})</option>
                    {feeds.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.language.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Bookmarks Toggle */}
          <Button
            variant={showSavedOnly ? 'secondary' : 'outline'}
            size="sm"
            onClick={onToggleShowSavedOnly}
            className="gap-1.5 h-8 text-xs font-normal shrink-0"
            title="Favoris"
          >
            <Bookmark className={`w-3.5 h-3.5 ${showSavedOnly ? 'fill-current text-amber-400' : 'text-muted-foreground'}`} />
            <span className="hidden sm:inline">Favoris</span>
            {savedCount > 0 && (
              <Badge variant="outline" className="h-4 px-1 text-[9px]">
                {savedCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Row 2: Category Chips */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 pt-0.5 no-scrollbar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`shrink-0 px-2 py-0.5 rounded text-[11px] transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-secondary text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Articles Feed Stream */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin mb-2" />
            <p className="text-xs font-medium text-foreground">
              Chargement des flux...
            </p>
          </div>
        ) : displayedArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center px-4">
            <div className="w-10 h-10 rounded-md bg-secondary border border-border flex items-center justify-center mb-2 text-muted-foreground">
              <Layers className="w-5 h-5" />
            </div>
            <p className="text-xs font-medium text-foreground">
              {showSavedOnly ? 'Aucun article favori' : 'Aucun article trouvé'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
              {showSavedOnly
                ? 'Enregistrez des articles en favoris pour les retrouver ici.'
                : 'Modifiez vos filtres ou effectuez une autre recherche.'}
            </p>
            {(activeFiltersCount > 0 || searchQuery || selectedCategory !== 'all') && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetAllFilters}
                className="mt-3 text-xs"
              >
                Réinitialiser les filtres
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {displayedArticles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                onSelect={(art) => setActiveArticle(art)}
                onToggleSave={onToggleSaveArticle}
                onToggleRead={onToggleReadArticle}
                onCreatePost={onCreatePostFromArticle}
              />
            ))}
          </div>
        )}
      </div>

      {/* Full Article Reader Modal */}
      <ArticleModal
        article={activeArticle}
        isOpen={!!activeArticle}
        onClose={() => setActiveArticle(null)}
        onToggleSave={onToggleSaveArticle}
        onCreatePostFromArticle={onCreatePostFromArticle}
      />
    </section>
  );
};
