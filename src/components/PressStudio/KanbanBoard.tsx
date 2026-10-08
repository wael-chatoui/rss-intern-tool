'use client';

import React from 'react';
import { SocialPost, PostStatus } from '@/types';
import {
  Calendar,
  Clock,
  Plus,
  ArrowRight,
  ArrowLeft,
  Trash2,
  Edit3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface KanbanBoardProps {
  posts: SocialPost[];
  onSelectPost: (post: SocialPost) => void;
  onUpdateStatus: (post: SocialPost, newStatus: PostStatus) => void;
  onDeletePost: (id: string) => void;
  onNewPost: () => void;
}

const COLUMNS: { id: PostStatus; title: string; hint: string }[] = [
  { id: 'idea', title: 'Idée / Veille', hint: 'Sujets repérés' },
  { id: 'in_progress', title: 'En cours', hint: 'Scripts en cours' },
  { id: 'ready', title: 'Prêt', hint: 'Contenu validé' },
  { id: 'published', title: 'Publié', hint: 'Diffusé sur les réseaux' },
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  posts,
  onSelectPost,
  onUpdateStatus,
  onDeletePost,
  onNewPost,
}) => {
  const getNextStatus = (curr: PostStatus): PostStatus | null => {
    if (curr === 'idea') return 'in_progress';
    if (curr === 'in_progress') return 'ready';
    if (curr === 'ready') return 'published';
    return null;
  };

  const getPrevStatus = (curr: PostStatus): PostStatus | null => {
    if (curr === 'published') return 'ready';
    if (curr === 'ready') return 'in_progress';
    if (curr === 'in_progress') return 'idea';
    return null;
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden text-foreground">
      {/* Top Header */}
      <div className="px-4 py-2.5 border-b border-border bg-card/60 flex items-center justify-between shrink-0">
        <div>
          <h2 className="font-semibold text-xs text-foreground tracking-tight">
            Pipeline Kanban
          </h2>
        </div>

        <Button
          size="sm"
          onClick={onNewPost}
          className="gap-1.5 h-7 text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nouveau sujet</span>
        </Button>
      </div>

      {/* Columns Grid */}
      <div className="flex-1 p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 overflow-y-auto">
        {COLUMNS.map((col) => {
          const colPosts = posts.filter((p) => p.status === col.id);

          return (
            <div
              key={col.id}
              className="flex flex-col bg-card/50 rounded-lg border border-border overflow-hidden"
            >
              {/* Column Header */}
              <div className="p-3 border-b border-border bg-card flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-xs text-foreground">
                    {col.title}
                  </span>
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 font-normal">
                    {colPosts.length}
                  </Badge>
                </div>
                <span className="text-[10px] text-muted-foreground">{col.hint}</span>
              </div>

              {/* Cards Stream */}
              <div className="p-2 space-y-2 flex-1 overflow-y-auto">
                {colPosts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-xs">
                    Aucun post
                  </div>
                ) : (
                  colPosts.map((post) => {
                    const nextStatus = getNextStatus(post.status);
                    const prevStatus = getPrevStatus(post.status);

                    return (
                      <div
                        key={post.id}
                        className="p-3 rounded-md bg-card border border-border hover:bg-accent/30 transition-colors space-y-2"
                      >
                        <div
                          onClick={() => onSelectPost(post)}
                          className="cursor-pointer space-y-1.5"
                        >
                          <h4 className="text-xs font-medium text-foreground line-clamp-2 leading-snug">
                            {post.angle}
                          </h4>

                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            {post.scheduledDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {post.scheduledDate}
                              </span>
                            )}
                            {post.scheduledTime && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {post.scheduledTime}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Move & Actions */}
                        <div className="flex items-center justify-between pt-1 border-t border-border/60">
                          <div className="flex items-center gap-1">
                            {prevStatus ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onUpdateStatus(post, prevStatus)}
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                title="Reculer"
                              >
                                <ArrowLeft className="w-3 h-3" />
                              </Button>
                            ) : (
                              <div className="w-6" />
                            )}

                            {nextStatus && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onUpdateStatus(post, nextStatus)}
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                title="Avancer"
                              >
                                <ArrowRight className="w-3 h-3" />
                              </Button>
                            )}
                          </div>

                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onSelectPost(post)}
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
                              title="Éditer"
                            >
                              <Edit3 className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onDeletePost(post.id)}
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              title="Supprimer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
