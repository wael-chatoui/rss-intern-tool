'use client';

import React, { useState } from 'react';
import { X, Plus, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { FashionCategory, FeedSource } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AddFeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFeedAdded: (feed: FeedSource) => void;
}

export const AddFeedModal: React.FC<AddFeedModalProps> = ({
  isOpen,
  onClose,
  onFeedAdded,
}) => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState<FashionCategory>('trends');
  const [language, setLanguage] = useState<'fr' | 'en'>('fr');
  const [website, setWebsite] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          url,
          category,
          language,
          website: website || url,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de l\'ajout du flux');
      }

      onFeedAdded(data.feed);
      setName('');
      setUrl('');
      setWebsite('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-lg w-full max-w-md overflow-hidden shadow-lg animate-modal-pop relative text-card-foreground"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Plus className="w-4 h-4 text-muted-foreground" />
            <span>Ajouter une source RSS</span>
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && (
            <div className="p-2.5 rounded-md bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">
              Nom de la source *
            </label>
            <Input
              type="text"
              required
              placeholder="ex: Vogue, Hypebeast, BOF..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-xs bg-background"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">
              URL du flux RSS (XML) *
            </label>
            <Input
              type="url"
              required
              placeholder="https://example.com/feed.xml"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-8 text-xs bg-background"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Le flux sera validé avant enregistrement.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                Catégorie
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as FashionCategory)}
                className="w-full h-8 px-2 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="haute-couture">Haute Couture</option>
                <option value="business">Business</option>
                <option value="streetwear">Streetwear</option>
                <option value="trends">Tendances</option>
                <option value="sustainability">RSE</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                Langue
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'fr' | 'en')}
                className="w-full h-8 px-2 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="fr">Français (FR)</option>
                <option value="en">Anglais (EN)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">
              Site web principal (facultatif)
            </label>
            <Input
              type="url"
              placeholder="https://example.com"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="h-8 text-xs bg-background"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isLoading}
              className="text-xs"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isLoading}
              className="gap-1.5 text-xs"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Validation...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Enregistrer</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
