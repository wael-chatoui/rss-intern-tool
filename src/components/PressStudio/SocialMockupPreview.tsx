'use client';

import React, { useState } from 'react';
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Music,
  ThumbsUp,
  Repeat2,
  Send,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { SocialPost, SocialPlatform } from '@/types';

interface SocialMockupPreviewProps {
  post: SocialPost;
  platform: SocialPlatform;
}

export const SocialMockupPreview: React.FC<SocialMockupPreviewProps> = ({
  post,
  platform,
}) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isLinkedInExpanded, setIsLinkedInExpanded] = useState(false);

  // 1. TIKTOK / REELS PHONE PREVIEW
  if (platform === 'tiktok') {
    const { hook, script, durationEstimate, visualNotes } = post.content.tiktok;

    return (
      <div className="flex flex-col items-center justify-center p-4">
        {/* Phone Frame */}
        <div className="w-[320px] h-[580px] bg-black rounded-[40px] border-4 border-neutral-700 shadow-2xl relative overflow-hidden flex flex-col justify-between text-white p-4 select-none">
          {/* Top Camera Notch */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-4 bg-neutral-900 rounded-full z-30 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-neutral-700" />
          </div>

          {/* Top Feed Tabs */}
          <div className="pt-3 flex justify-center items-center gap-4 text-xs font-semibold z-20 opacity-80">
            <span className="text-neutral-400">Abonnements</span>
            <span className="border-b-2 border-white pb-0.5">Pour toi</span>
          </div>

          {/* Background Video Simulation */}
          <div className="absolute inset-0 bg-gradient-to-b from-neutral-950 via-[#181a24] to-black z-0 flex items-center justify-center p-6 text-center">
            <div className="space-y-3">
              <span className="text-[10px] uppercase font-medium tracking-wider text-muted-foreground px-2 py-0.5 rounded-full bg-secondary border border-border">
                {durationEstimate || '30s-45s'}
              </span>
              <div className="text-base font-semibold text-white drop-shadow-md px-3 py-2 bg-black/60 backdrop-blur-sm rounded-lg border border-white/10">
                "{hook || 'Votre accroche TikTok apparaîtra ici...'}"
              </div>
              {visualNotes && (
                <p className="text-[10px] text-neutral-400 italic bg-black/40 p-2 rounded-lg">
                  Direction visuelle : {visualNotes}
                </p>
              )}
            </div>
          </div>

          {/* Right Floating Interaction Buttons */}
          <div className="absolute right-3 bottom-24 flex flex-col items-center gap-3.5 z-20">
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-10 h-10 rounded-full bg-neutral-800/80 backdrop-blur-sm flex items-center justify-center hover:scale-110 transition-transform">
                <Heart className="w-5 h-5 fill-red-500 text-red-500" />
              </div>
              <span className="text-[10px] font-semibold">24.5k</span>
            </div>

            <div className="flex flex-col items-center gap-0.5">
              <div className="w-10 h-10 rounded-full bg-neutral-800/80 backdrop-blur-sm flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] font-semibold">412</span>
            </div>

            <div className="flex flex-col items-center gap-0.5">
              <div className="w-10 h-10 rounded-full bg-neutral-800/80 backdrop-blur-sm flex items-center justify-center">
                <Bookmark className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] font-semibold">1.8k</span>
            </div>

            <div className="flex flex-col items-center gap-0.5">
              <div className="w-10 h-10 rounded-full bg-neutral-800/80 backdrop-blur-sm flex items-center justify-center">
                <Share2 className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] font-semibold">Partager</span>
            </div>

            {/* Rotating Sound Disc */}
            <div className="w-9 h-9 rounded-full bg-neutral-800 border-2 border-neutral-600 flex items-center justify-center animate-spin">
              <Music className="w-4 h-4 text-white" />
            </div>
          </div>

          {/* Bottom Caption & Audio */}
          <div className="z-20 pr-14 space-y-1 pb-2">
            <div className="font-semibold text-xs flex items-center gap-1.5">
              <span>@fashion_cockpit</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-700 font-medium">Suivre</span>
            </div>
            <p className="text-[11px] text-neutral-200 line-clamp-2 leading-snug">
              {hook} {post.tags.map(t => `#${t}`).join(' ')}
            </p>
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
              <Music className="w-3 h-3 text-neutral-300" />
              <span className="truncate">Son original - Fashion Press</span>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-neutral-500 mt-2">
          Aperçu simulation rendu TikTok / Reels (Format 9:16)
        </p>
      </div>
    );
  }

  // 2. INSTAGRAM POST & CAROUSEL PREVIEW
  if (platform === 'instagram') {
    const { caption, carouselSlides, hashtags } = post.content.instagram;
    const slides = carouselSlides && carouselSlides.length > 0 ? carouselSlides : ['Slide 1 : Aperçu visuel'];

    return (
      <div className="flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[360px] bg-[#12141A] rounded-2xl border border-[#272D3D] shadow-xl overflow-hidden text-neutral-100">
          {/* Top Post Header */}
          <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center font-semibold text-[10px] text-foreground">
                FP
              </div>
              <div>
                <div className="font-semibold text-xs leading-none">fashion.press.daily</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Paris, France</div>
              </div>
            </div>
            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
          </div>

          {/* Carousel Slide Media Area (Animated Sliding Track) */}
          <div className="w-full h-72 relative overflow-hidden bg-card border-b border-border">
            <div
              className="flex h-full transition-transform duration-300"
              style={{ transform: `translateX(-${currentSlideIndex * 100}%)` }}
            >
              {slides.map((slideText, idx) => (
                <div
                  key={idx}
                  className="w-full h-full shrink-0 flex flex-col justify-center items-center p-6 text-center select-none"
                >
                  <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase mb-2">
                    Slide {idx + 1} sur {slides.length}
                  </span>
                  <p className="text-sm font-semibold text-foreground leading-snug px-4">
                    {slideText || 'Contenu de la slide...'}
                  </p>
                </div>
              ))}
            </div>

            {/* Navigation arrows */}
            {slides.length > 1 && (
              <>
                <button
                  onClick={() => setCurrentSlideIndex(Math.max(0, currentSlideIndex - 1))}
                  disabled={currentSlideIndex === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center disabled:opacity-20 transition-all z-10"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentSlideIndex(Math.min(slides.length - 1, currentSlideIndex + 1))}
                  disabled={currentSlideIndex === slides.length - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center disabled:opacity-20 transition-all z-10"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}

            {/* Pagination dots */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
              {slides.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === currentSlideIndex ? 'bg-foreground w-3' : 'bg-muted-foreground/40 w-1.5'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Action Row */}
          <div className="px-3.5 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Heart className="w-5 h-5 text-neutral-200 hover:text-red-500 cursor-pointer" />
              <MessageCircle className="w-5 h-5 text-neutral-200" />
              <Send className="w-5 h-5 text-neutral-200" />
            </div>
            <Bookmark className="w-5 h-5 text-neutral-200" />
          </div>

          {/* Likes & Caption */}
          <div className="px-3.5 pb-4 space-y-1 text-xs">
            <div className="font-semibold text-[11px]">Aimé par voguefrance et 1 420 autres personnes</div>
            <div className="leading-relaxed">
              <span className="font-semibold mr-1.5">fashion.press.daily</span>
              <span className="text-neutral-300 whitespace-pre-wrap">{caption || 'Votre légende ici...'}</span>
            </div>
            {hashtags && hashtags.length > 0 && (
              <div className="text-[11px] text-blue-400 font-medium pt-1">
                {hashtags.join(' ')}
              </div>
            )}
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground mt-2">
          Aperçu simulation rendu Instagram Feed & Carrousel (Format 4:5)
        </p>
      </div>
    );
  }

  // 3. LINKEDIN DESKTOP FEED PREVIEW
  if (platform === 'linkedin') {
    const { title, body, keyTakeaways } = post.content.linkedin;

    return (
      <div className="flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[440px] bg-card rounded-lg border border-border shadow-md p-4 text-foreground space-y-3">
          {/* Author Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center font-bold text-xs text-foreground">
                FP
              </div>
              <div>
                <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                  <span>Fashion Press Cockpit</span>
                  <span className="text-[10px] text-muted-foreground font-normal">• 1er</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Veille Stratégique & Décryptage Industrie de la Mode
                </div>
                <div className="text-[9px] text-muted-foreground">1 h • Modifié</div>
              </div>
            </div>
            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
          </div>

          {/* Title */}
          {title && (
            <h4 className="font-semibold text-sm text-foreground leading-snug">
              {title}
            </h4>
          )}

          {/* Post Body with "...voir plus" cut */}
          <div className="text-xs text-muted-foreground leading-relaxed">
            {isLinkedInExpanded ? (
              <div className="space-y-2 whitespace-pre-wrap">
                <p className="text-foreground/90">{body || 'Votre texte d\'analyse LinkedIn...'}</p>
                {keyTakeaways && keyTakeaways.length > 0 && (
                  <div className="pt-2 border-t border-border space-y-1">
                    <span className="text-[11px] font-medium text-foreground">Points clés :</span>
                    {keyTakeaways.map((t, idx) => (
                      <div key={idx} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <span>•</span>
                        <span>{t}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setIsLinkedInExpanded(false)}
                  className="text-foreground font-medium text-[11px] hover:underline block pt-1"
                >
                  Voir moins
                </button>
              </div>
            ) : (
              <div>
                <p className="line-clamp-3">
                  {body || 'Votre texte d\'analyse LinkedIn...'}
                </p>
                <button
                  onClick={() => setIsLinkedInExpanded(true)}
                  className="text-neutral-400 hover:text-white font-semibold text-[11px] hover:underline pt-0.5"
                >
                  ...voir plus
                </button>
              </div>
            )}
          </div>

          {/* Engagement Counter */}
          <div className="pt-2 border-t border-[#202534] flex items-center justify-between text-[10px] text-neutral-500">
            <div className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 rounded-full bg-blue-600 flex items-center justify-center text-[8px] text-white">👍</span>
              <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 flex items-center justify-center text-[8px] text-white">👏</span>
              <span className="ml-1 text-neutral-400 font-medium">186 réactions</span>
            </div>
            <span>34 commentaires</span>
          </div>

          {/* Engagement Bar */}
          <div className="pt-2 border-t border-[#202534] grid grid-cols-4 gap-1 text-center text-xs text-neutral-400">
            <button className="flex items-center justify-center gap-1 py-1 rounded hover:bg-white/5">
              <ThumbsUp className="w-3.5 h-3.5" />
              <span className="text-[10px]">J'aime</span>
            </button>
            <button className="flex items-center justify-center gap-1 py-1 rounded hover:bg-white/5">
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="text-[10px]">Commenter</span>
            </button>
            <button className="flex items-center justify-center gap-1 py-1 rounded hover:bg-white/5">
              <Repeat2 className="w-3.5 h-3.5" />
              <span className="text-[10px]">Republier</span>
            </button>
            <button className="flex items-center justify-center gap-1 py-1 rounded hover:bg-white/5">
              <Send className="w-3.5 h-3.5" />
              <span className="text-[10px]">Envoyer</span>
            </button>
          </div>
        </div>

        <p className="text-[11px] text-neutral-500 mt-2">
          Aperçu simulation rendu LinkedIn Desktop avec césure "...voir plus"
        </p>
      </div>
    );
  }

  return null;
};
