'use client';

import React from 'react';
import { Edit3, Kanban, Calendar as CalendarIcon, Sparkles } from 'lucide-react';
import { SocialPost, PostStatus } from '@/types';
import { PostEditor } from './PostEditor';
import { KanbanBoard } from './KanbanBoard';
import { CalendarView } from './CalendarView';
import { AiStudioPlaceholder } from './AiStudioPlaceholder';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export type StudioTab = 'editor' | 'kanban' | 'calendar' | 'ai';

interface PressStudioSectionProps {
  posts: SocialPost[];
  currentPost: SocialPost | null;
  activeTab: StudioTab;
  onTabChange: (tab: StudioTab) => void;
  onSavePost: (post: SocialPost) => void;
  onDeletePost: (id: string) => void;
  onNewPost: () => void;
  onSelectPost: (post: SocialPost) => void;
  onUpdateStatus: (post: SocialPost, newStatus: PostStatus) => void;
  onNewPostWithDate: (dateStr: string) => void;
}

export const PressStudioSection: React.FC<PressStudioSectionProps> = ({
  posts,
  currentPost,
  activeTab,
  onTabChange,
  onSavePost,
  onDeletePost,
  onNewPost,
  onSelectPost,
  onUpdateStatus,
  onNewPostWithDate,
}) => {
  return (
    <section className="flex flex-col h-full bg-background">
      {/* Studio Top Navigation Bar */}
      <div className="px-3 border-b border-border bg-card/60 flex items-center justify-between shrink-0 h-11">
        <div className="flex items-center gap-1">
          <Button
            variant={activeTab === 'editor' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onTabChange('editor')}
            className="gap-1.5 h-7 text-xs font-normal"
          >
            <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Rédaction</span>
          </Button>

          <Button
            variant={activeTab === 'kanban' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onTabChange('kanban')}
            className="gap-1.5 h-7 text-xs font-normal"
          >
            <Kanban className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Kanban</span>
            <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal">
              {posts.length}
            </Badge>
          </Button>

          <Button
            variant={activeTab === 'calendar' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onTabChange('calendar')}
            className="gap-1.5 h-7 text-xs font-normal"
          >
            <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Calendrier</span>
          </Button>

          <Button
            variant={activeTab === 'ai' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onTabChange('ai')}
            className="gap-1.5 h-7 text-xs font-normal"
          >
            <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Assistant IA</span>
          </Button>
        </div>

        {activeTab !== 'editor' && currentPost && (
          <button
            onClick={() => onTabChange('editor')}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            Éditer le post →
          </button>
        )}
      </div>

      {/* Main Tab View */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'editor' && (
          <PostEditor
            post={currentPost}
            onSave={onSavePost}
            onDelete={onDeletePost}
            onNewPost={onNewPost}
          />
        )}

        {activeTab === 'kanban' && (
          <KanbanBoard
            posts={posts}
            onSelectPost={(p) => {
              onSelectPost(p);
              onTabChange('editor');
            }}
            onUpdateStatus={onUpdateStatus}
            onDeletePost={onDeletePost}
            onNewPost={onNewPost}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarView
            posts={posts}
            onSelectPost={(p) => {
              onSelectPost(p);
              onTabChange('editor');
            }}
            onNewPostWithDate={onNewPostWithDate}
          />
        )}

        {activeTab === 'ai' && <AiStudioPlaceholder />}
      </div>
    </section>
  );
};
