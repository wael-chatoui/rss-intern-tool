'use client';

import React, { useState } from 'react';
import { SocialPost } from '@/types';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Plus,
  ArrowRight,
} from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface CalendarViewProps {
  posts: SocialPost[];
  onSelectPost: (post: SocialPost) => void;
  onNewPostWithDate: (dateStr: string) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  posts,
  onSelectPost,
  onNewPostWithDate,
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const postsOnSelectedDate = posts.filter(
    (p) => p.scheduledDate === selectedDateStr
  );

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden text-foreground">
      {/* Top Header */}
      <div className="px-4 py-2.5 border-b border-border bg-card/60 flex items-center justify-between shrink-0">
        <div>
          <h2 className="font-semibold text-xs text-foreground tracking-tight">
            Calendrier éditorial
          </h2>
        </div>

        {/* Month Navigator */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <span className="text-xs font-medium text-foreground capitalize min-w-[120px] text-center">
            {format(currentMonth, 'MMMM yyyy', { locale: fr })}
          </span>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const now = new Date();
              setCurrentMonth(now);
              setSelectedDate(now);
            }}
            className="h-7 px-2 text-[11px]"
          >
            Aujourd'hui
          </Button>
        </div>
      </div>

      {/* Main Content: Split Grid + Day inspector */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Monthly Calendar Grid */}
        <div className="flex-1 p-3 sm:p-4 overflow-y-auto border-r border-border">
          {/* Days of Week Headers */}
          <div className="grid grid-cols-7 gap-1 mb-1 text-center">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
              <div
                key={d}
                className="text-[10px] font-medium text-muted-foreground uppercase py-1"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Days Grid Cells */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, idx) => {
              const dayStr = format(day, 'yyyy-MM-dd');
              const dayPosts = posts.filter((p) => p.scheduledDate === dayStr);
              const isSelected = isSameDay(day, selectedDate);
              const isCurrentMonth = isSameMonth(day, currentMonth);

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDate(day)}
                  className={`min-h-[70px] sm:min-h-[80px] p-1.5 rounded-md border transition-colors cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'border-primary bg-accent/40 shadow-sm'
                      : isCurrentMonth
                      ? 'border-border bg-card hover:bg-accent/20'
                      : 'border-transparent bg-muted/20 opacity-40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-medium ${
                        isSelected ? 'text-foreground' : isCurrentMonth ? 'text-foreground/90' : 'text-muted-foreground'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    {dayPosts.length > 0 && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                        {dayPosts.length}
                      </Badge>
                    )}
                  </div>

                  {/* Badges in day cell */}
                  <div className="space-y-1 mt-1 overflow-hidden">
                    {dayPosts.slice(0, 2).map((p) => (
                      <div
                        key={p.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPost(p);
                        }}
                        className="text-[10px] truncate px-1 py-0.5 rounded bg-secondary text-secondary-foreground border border-border"
                        title={p.angle}
                      >
                        {p.angle}
                      </div>
                    ))}
                    {dayPosts.length > 2 && (
                      <div className="text-[9px] text-muted-foreground text-right">
                        +{dayPosts.length - 2}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Selected Day Schedule Inspector */}
        <div className="w-full lg:w-72 xl:w-80 p-3 sm:p-4 bg-card/40 flex flex-col shrink-0 overflow-y-auto">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
            <div>
              <span className="text-[10px] uppercase text-muted-foreground font-medium">
                Jour sélectionné
              </span>
              <h3 className="text-xs font-semibold text-foreground capitalize">
                {format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })}
              </h3>
            </div>

            <Button
              size="sm"
              onClick={() => onNewPostWithDate(selectedDateStr)}
              className="gap-1 h-7 text-xs"
            >
              <Plus className="w-3 h-3" />
              <span>Planifier</span>
            </Button>
          </div>

          {/* Posts scheduled for this date */}
          <div className="space-y-2.5 flex-1">
            {postsOnSelectedDate.length === 0 ? (
              <div className="text-center py-12 px-4">
                <CalendarIcon className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Aucun post programmé.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNewPostWithDate(selectedDateStr)}
                  className="mt-2 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Créer pour ce jour
                </Button>
              </div>
            ) : (
              postsOnSelectedDate.map((post) => (
                <div
                  key={post.id}
                  onClick={() => onSelectPost(post)}
                  className="p-3 rounded-md bg-card border border-border hover:bg-accent/40 cursor-pointer transition-colors space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {post.scheduledTime || '18:00'}
                    </span>
                    <Badge variant="outline" className="text-[9px] py-0 px-1 font-normal">
                      {post.status}
                    </Badge>
                  </div>

                  <h4 className="text-xs font-medium text-foreground leading-snug">
                    {post.angle}
                  </h4>

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/60">
                    <span>TikTok • IG • LinkedIn</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
