'use client';

import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Save,
  Trash2,
  Calendar,
  Clock,
  ExternalLink,
  Plus,
  X,
  FileText,
  Download,
  Eye,
  Edit2,
  Lightbulb,
  MoreHorizontal,
  ChevronDown,
} from 'lucide-react';
import { SocialPost, SocialPlatform, PostStatus } from '@/types';
import { SocialMockupPreview } from './SocialMockupPreview';
import { HooksInspirationModal } from './HooksInspirationModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface PostEditorProps {
  post: SocialPost | null;
  onSave: (post: SocialPost) => void;
  onDelete: (id: string) => void;
  onNewPost: () => void;
}

export const PostEditor: React.FC<PostEditorProps> = ({
  post,
  onSave,
  onDelete,
  onNewPost,
}) => {
  const [formData, setFormData] = useState<SocialPost | null>(post);
  const [activePlatformTab, setActivePlatformTab] = useState<SocialPlatform>('tiktok');
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [isHooksModalOpen, setIsHooksModalOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const actionsMenuRef = React.useRef<HTMLDivElement>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    setFormData(post);
  }, [post]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setIsActionsMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsActionsMenuOpen(false);
    };

    if (isActionsMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActionsMenuOpen]);

  if (!formData) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-background">
        <div className="w-12 h-12 rounded-lg bg-secondary border border-border flex items-center justify-center mb-3 text-muted-foreground">
          <FileText className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">
          Aucun post sélectionné
        </h3>
        <p className="text-xs text-muted-foreground max-w-sm mb-4 leading-relaxed">
          Sélectionnez un article dans le flux RSS de gauche ou créez un nouveau sujet libre.
        </p>
        <Button onClick={onNewPost} size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          <span>Nouveau post libre</span>
        </Button>
      </div>
    );
  }

  const handleCopy = (text: string, sectionKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionKey);
    setTimeout(() => setCopiedSection(null), 2500);
  };

  const generateMarkdownPack = () => {
    return `# PACK PRESSE RÉSEAUX SOCIAUX
Angle : ${formData.angle}
Tags : ${formData.tags.map((t) => `#${t}`).join(' ')}
Statut : ${formData.status}
Planification : ${formData.scheduledDate || 'Non défini'} à ${formData.scheduledTime || 'Non défini'}
Source : ${formData.sourceArticleTitle || 'N/A'} (${formData.sourceArticleLink || 'N/A'})

---
## 🎵 TIKTOK & REELS
Hook (0-3s) : ${formData.content.tiktok.hook}
Durée estimée : ${formData.content.tiktok.durationEstimate}
Notes visuelles : ${formData.content.tiktok.visualNotes}

Script :
${formData.content.tiktok.script}

---
## 📸 INSTAGRAM
Carrousel :
${formData.content.instagram.carouselSlides.map((s, i) => `Slide ${i + 1} : ${s}`).join('\n')}

Caption :
${formData.content.instagram.caption}

Hashtags :
${formData.content.instagram.hashtags.join(' ')}

---
## 💼 LINKEDIN
Titre : ${formData.content.linkedin.title}

Corps :
${formData.content.linkedin.body}

Points clés :
${formData.content.linkedin.keyTakeaways.map((t) => `- ${t}`).join('\n')}
`;
  };

  const copyFullPack = () => {
    handleCopy(generateMarkdownPack(), 'full_pack');
  };

  const downloadMarkdownFile = () => {
    const md = generateMarkdownPack();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeAngle = formData.angle.slice(0, 25).replace(/[^a-zA-Z0-9]/g, '_');
    link.href = url;
    link.download = `press-pack-${safeAngle}-${formData.scheduledDate || 'draft'}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleApplyHookFromLibrary = (hookText: string) => {
    if (activePlatformTab === 'tiktok') {
      setFormData({
        ...formData,
        angle: formData.angle ? formData.angle : hookText,
        content: {
          ...formData.content,
          tiktok: { ...formData.content.tiktok, hook: hookText },
        },
      });
    } else if (activePlatformTab === 'instagram') {
      setFormData({
        ...formData,
        angle: formData.angle ? formData.angle : hookText,
        content: {
          ...formData.content,
          instagram: {
            ...formData.content.instagram,
            caption: `${hookText}\n\n${formData.content.instagram.caption}`,
          },
        },
      });
    } else {
      setFormData({
        ...formData,
        angle: formData.angle ? formData.angle : hookText,
        content: {
          ...formData.content,
          linkedin: { ...formData.content.linkedin, title: hookText },
        },
      });
    }
  };

  const addTag = () => {
    if (!newTag.trim()) return;
    const clean = newTag.trim().replace(/^#/, '');
    if (!formData.tags.includes(clean)) {
      setFormData({
        ...formData,
        tags: [...formData.tags, clean],
      });
    }
    setNewTag('');
  };

  const removeTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter((t) => t !== tagToRemove),
    });
  };

  const addSlide = () => {
    const currentSlides = formData.content.instagram.carouselSlides || [];
    setFormData({
      ...formData,
      content: {
        ...formData.content,
        instagram: {
          ...formData.content.instagram,
          carouselSlides: [...currentSlides, `Slide ${currentSlides.length + 1} : `],
        },
      },
    });
  };

  const updateSlide = (index: number, val: string) => {
    const currentSlides = [...(formData.content.instagram.carouselSlides || [])];
    currentSlides[index] = val;
    setFormData({
      ...formData,
      content: {
        ...formData.content,
        instagram: {
          ...formData.content.instagram,
          carouselSlides: currentSlides,
        },
      },
    });
  };

  const removeSlide = (index: number) => {
    const currentSlides = formData.content.instagram.carouselSlides.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      content: {
        ...formData.content,
        instagram: {
          ...formData.content.instagram,
          carouselSlides: currentSlides,
        },
      },
    });
  };

  const addTakeaway = () => {
    const current = formData.content.linkedin.keyTakeaways || [];
    setFormData({
      ...formData,
      content: {
        ...formData.content,
        linkedin: {
          ...formData.content.linkedin,
          keyTakeaways: [...current, 'Nouveau point clé'],
        },
      },
    });
  };

  const updateTakeaway = (index: number, val: string) => {
    const current = [...(formData.content.linkedin.keyTakeaways || [])];
    current[index] = val;
    setFormData({
      ...formData,
      content: {
        ...formData.content,
        linkedin: {
          ...formData.content.linkedin,
          keyTakeaways: current,
        },
      },
    });
  };

  const removeTakeaway = (index: number) => {
    const current = formData.content.linkedin.keyTakeaways.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      content: {
        ...formData.content,
        linkedin: {
          ...formData.content.linkedin,
          keyTakeaways: current,
        },
      },
    });
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      {/* Top Bar Metadata */}
      <div className="p-3 sm:p-4 border-b border-border bg-card/60 space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-foreground tracking-tight">
              Rédaction
            </span>
            <Badge variant="outline" className="text-[10px] font-normal py-0 px-1.5 h-4">
              {formData.status === 'idea' && 'Idée'}
              {formData.status === 'in_progress' && 'En cours'}
              {formData.status === 'ready' && 'Prêt'}
              {formData.status === 'published' && 'Publié'}
            </Badge>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Primary Save Button */}
            <Button
              variant="default"
              size="sm"
              onClick={() => onSave(formData)}
              className="gap-1.5 h-7 text-xs font-normal"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Enregistrer</span>
            </Button>

            {/* Actions Menu */}
            <div className="relative" ref={actionsMenuRef}>
              <Button
                variant={isActionsMenuOpen ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setIsActionsMenuOpen(!isActionsMenuOpen)}
                className="gap-1.5 h-7 text-xs font-normal"
                aria-haspopup="true"
                aria-expanded={isActionsMenuOpen}
              >
                <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">Actions</span>
                <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${isActionsMenuOpen ? 'rotate-180' : ''}`} />
              </Button>

              {isActionsMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-56 rounded-md bg-popover border border-border shadow-md py-1 z-50 text-xs text-popover-foreground animate-modal-pop">
                  <button
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      setIsHooksModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left transition-colors"
                  >
                    <Lightbulb className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Idées de Hooks (20)</span>
                  </button>

                  <button
                    onClick={() => {
                      copyFullPack();
                      setIsActionsMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{copiedSection === 'full_pack' ? 'Pack copié !' : 'Copier tout le pack'}</span>
                  </button>

                  <button
                    onClick={() => {
                      downloadMarkdownFile();
                      setIsActionsMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Télécharger en .md</span>
                  </button>

                  <Separator className="my-1" />

                  <button
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      onNewPost();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Nouveau sujet libre</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      if (window.confirm('Voulez-vous supprimer ce sujet éditorial ?')) {
                        onDelete(formData.id);
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-destructive hover:bg-destructive/10 text-left transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    <span>Supprimer ce post</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Source article chip if linked */}
        {formData.sourceArticleTitle && (
          <div className="px-2.5 py-1 rounded-md bg-secondary/60 border border-border flex items-center justify-between text-xs text-muted-foreground">
            <div className="truncate flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-foreground">Source:</span>
              <span className="truncate">{formData.sourceArticleTitle}</span>
            </div>
            {formData.sourceArticleLink && (
              <a
                href={formData.sourceArticleLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground ml-2 shrink-0"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* Editorial Angle */}
        <div>
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">
            Angle éditorial / Titre
          </label>
          <Input
            type="text"
            value={formData.angle}
            onChange={(e) => setFormData({ ...formData, angle: e.target.value })}
            placeholder="ex: Le retour du tailoring minimaliste..."
            className="h-8 text-xs bg-background"
          />
        </div>

        {/* Status, Date, Time Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">
              Statut
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as PostStatus })}
              className="w-full h-8 px-2 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="idea">Idée</option>
              <option value="in_progress">En cours</option>
              <option value="ready">Prêt à publier</option>
              <option value="published">Publié</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">
              Date
            </label>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                type="date"
                value={formData.scheduledDate || ''}
                onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                className="pl-8 h-8 text-xs bg-background"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">
              Heure
            </label>
            <div className="relative">
              <Clock className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                type="time"
                value={formData.scheduledTime || '18:00'}
                onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                className="pl-8 h-8 text-xs bg-background"
              />
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span className="text-[11px] text-muted-foreground mr-1">Tags:</span>
          {formData.tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="gap-1 font-normal text-[10px] py-0 px-1.5 h-5"
            >
              #{tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="hover:text-destructive"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </Badge>
          ))}
          <div className="inline-flex items-center">
            <input
              type="text"
              placeholder="+ tag"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              className="w-16 h-5 px-1.5 text-[10px] rounded bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      {/* Platform Tabs & View Mode */}
      <div className="px-3 border-b border-border bg-card/40 flex items-center justify-between shrink-0 h-10">
        <div className="flex items-center gap-1">
          <Button
            variant={activePlatformTab === 'tiktok' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActivePlatformTab('tiktok')}
            className="h-7 text-xs font-normal"
          >
            TikTok
          </Button>
          <Button
            variant={activePlatformTab === 'instagram' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActivePlatformTab('instagram')}
            className="h-7 text-xs font-normal"
          >
            Instagram
          </Button>
          <Button
            variant={activePlatformTab === 'linkedin' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActivePlatformTab('linkedin')}
            className="h-7 text-xs font-normal"
          >
            LinkedIn
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-secondary/60 p-0.5 rounded-md border border-border">
            <button
              onClick={() => setViewMode('edit')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
                viewMode === 'edit'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Edit2 className="w-3 h-3" />
              <span>Éditer</span>
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
                viewMode === 'preview'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>Aperçu</span>
            </button>
          </div>

          {activePlatformTab === 'tiktok' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy(formData.content.tiktok.script, 'tiktok')}
              className="h-7 px-2 text-[11px] font-normal"
            >
              {copiedSection === 'tiktok' ? <Check className="w-3 h-3 text-emerald-500 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              <span>{copiedSection === 'tiktok' ? 'Copié' : 'Copier script'}</span>
            </Button>
          )}

          {activePlatformTab === 'instagram' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const igText = `${formData.content.instagram.caption}\n\n${formData.content.instagram.hashtags.join(' ')}`;
                handleCopy(igText, 'instagram');
              }}
              className="h-7 px-2 text-[11px] font-normal"
            >
              {copiedSection === 'instagram' ? <Check className="w-3 h-3 text-emerald-500 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              <span>{copiedSection === 'instagram' ? 'Copié' : 'Copier'}</span>
            </Button>
          )}

          {activePlatformTab === 'linkedin' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const liText = `${formData.content.linkedin.title}\n\n${formData.content.linkedin.body}\n\nPoints clés :\n${formData.content.linkedin.keyTakeaways.map((t) => `• ${t}`).join('\n')}`;
                handleCopy(liText, 'linkedin');
              }}
              className="h-7 px-2 text-[11px] font-normal"
            >
              {copiedSection === 'linkedin' ? <Check className="w-3 h-3 text-emerald-500 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              <span>{copiedSection === 'linkedin' ? 'Copié' : 'Copier'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Editor or Preview Mode Body */}
      {viewMode === 'preview' ? (
        <div className="flex-1 overflow-y-auto">
          <SocialMockupPreview post={formData} platform={activePlatformTab} />
        </div>
      ) : (
        <div className="p-3 sm:p-4 space-y-4 flex-1">
          {/* TIKTOK EDITOR */}
          {activePlatformTab === 'tiktok' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-foreground">
                    Hook (0-3s)
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    {formData.content.tiktok.hook.length} car.
                  </span>
                </div>
                <Input
                  type="text"
                  value={formData.content.tiktok.hook}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      content: {
                        ...formData.content,
                        tiktok: { ...formData.content.tiktok, hook: e.target.value },
                      },
                    })
                  }
                  placeholder="ex: Vous avez sûrement raté ce détail..."
                  className="h-8 text-xs bg-background"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">
                    Durée cible
                  </label>
                  <select
                    value={formData.content.tiktok.durationEstimate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        content: {
                          ...formData.content,
                          tiktok: { ...formData.content.tiktok, durationEstimate: e.target.value },
                        },
                      })
                    }
                    className="w-full h-8 px-2 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="15s-30s">Ultra court (15s - 30s)</option>
                    <option value="30s-45s">Standard (30s - 45s)</option>
                    <option value="45s-60s">Moyen (45s - 60s)</option>
                    <option value="60s+">Long (60s+)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">
                    Direction visuelle / B-Rolls
                  </label>
                  <Input
                    type="text"
                    value={formData.content.tiktok.visualNotes}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        content: {
                          ...formData.content,
                          tiktok: { ...formData.content.tiktok, visualNotes: e.target.value },
                        },
                      })
                    }
                    placeholder="Plans de la robe, zoom coutures..."
                    className="h-8 text-xs bg-background"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-foreground">
                    Script détaillé
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    {formData.content.tiktok.script.split(/\s+/).filter(Boolean).length} mots
                  </span>
                </div>
                <textarea
                  rows={9}
                  value={formData.content.tiktok.script}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      content: {
                        ...formData.content,
                        tiktok: { ...formData.content.tiktok, script: e.target.value },
                      },
                    })
                  }
                  placeholder={`[0:00 - 0:03] Hook : ...
[0:03 - 0:15] Contexte : ...
[0:15 - 0:35] Explication & détails : ...
[0:35 - 0:45] CTA final : ...`}
                  className="w-full px-3 py-2 text-xs font-mono rounded-md bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* INSTAGRAM EDITOR */}
          {activePlatformTab === 'instagram' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-foreground">
                    Légende Instagram
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    {formData.content.instagram.caption.length} / 2 200 car.
                  </span>
                </div>
                <textarea
                  rows={7}
                  value={formData.content.instagram.caption}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      content: {
                        ...formData.content,
                        instagram: { ...formData.content.instagram, caption: e.target.value },
                      },
                    })
                  }
                  placeholder="Rédigez votre légende..."
                  className="w-full px-3 py-2 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring leading-relaxed"
                />
              </div>

              {/* Carousel Slides */}
              <div className="p-3 rounded-md bg-card border border-border space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground">
                    Carrousel (slides)
                  </label>
                  <button
                    onClick={addSlide}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Ajouter</span>
                  </button>
                </div>

                {formData.content.instagram.carouselSlides.map((slide, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground w-12 shrink-0">
                      Slide {idx + 1}
                    </span>
                    <Input
                      type="text"
                      value={slide}
                      onChange={(e) => updateSlide(idx, e.target.value)}
                      placeholder="Contenu slide..."
                      className="h-7 text-xs bg-background flex-1"
                    />
                    <button
                      onClick={() => removeSlide(idx)}
                      className="text-muted-foreground hover:text-destructive p-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Hashtags */}
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">
                  Hashtags
                </label>
                <Input
                  type="text"
                  value={formData.content.instagram.hashtags.join(' ')}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      content: {
                        ...formData.content,
                        instagram: {
                          ...formData.content.instagram,
                          hashtags: e.target.value.split(/\s+/).filter(Boolean),
                        },
                      },
                    })
                  }
                  placeholder="#FashionWeek #HauteCouture #Trends"
                  className="h-8 text-xs bg-background"
                />
              </div>
            </div>
          )}

          {/* LINKEDIN EDITOR */}
          {activePlatformTab === 'linkedin' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Titre du post
                </label>
                <Input
                  type="text"
                  value={formData.content.linkedin.title}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      content: {
                        ...formData.content,
                        linkedin: { ...formData.content.linkedin, title: e.target.value },
                      },
                    })
                  }
                  placeholder="ex: Décryptage stratégie..."
                  className="h-8 text-xs bg-background"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-foreground">
                    Corps de texte
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    {formData.content.linkedin.body.length} / 3 000 car.
                  </span>
                </div>
                <textarea
                  rows={8}
                  value={formData.content.linkedin.body}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      content: {
                        ...formData.content,
                        linkedin: { ...formData.content.linkedin, body: e.target.value },
                      },
                    })
                  }
                  placeholder="Rédigez l'analyse..."
                  className="w-full px-3 py-2 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring leading-relaxed"
                />
              </div>

              {/* Key takeaways */}
              <div className="p-3 rounded-md bg-card border border-border space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground">
                    Points clés
                  </label>
                  <button
                    onClick={addTakeaway}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Ajouter</span>
                  </button>
                </div>

                {formData.content.linkedin.keyTakeaways.map((takeaway, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">•</span>
                    <Input
                      type="text"
                      value={takeaway}
                      onChange={(e) => updateTakeaway(idx, e.target.value)}
                      placeholder="Point clé..."
                      className="h-7 text-xs bg-background flex-1"
                    />
                    <button
                      onClick={() => removeTakeaway(idx)}
                      className="text-muted-foreground hover:text-destructive p-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hooks Modal */}
      <HooksInspirationModal
        isOpen={isHooksModalOpen}
        onClose={() => setIsHooksModalOpen(false)}
        onSelectHook={handleApplyHookFromLibrary}
      />
    </div>
  );
};
