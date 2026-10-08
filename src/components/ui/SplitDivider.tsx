'use client';

import React, { useState } from 'react';
import { GripVertical } from 'lucide-react';

interface SplitDividerProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  isDragging: boolean;
  splitPercentage: number;
}

export const SplitDivider: React.FC<SplitDividerProps> = ({
  onMouseDown,
  onDoubleClick,
  isDragging,
  splitPercentage,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`hidden md:flex relative z-30 shrink-0 w-2 -mx-1 items-center justify-center cursor-col-resize select-none transition-colors group ${
        isDragging ? 'bg-accent/40' : 'hover:bg-accent/20'
      }`}
      title="Glisser pour redimensionner • Double-clic pour rééquilibrer (50/50)"
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={Math.round(splitPercentage)}
    >
      {/* Visual thin line */}
      <div
        className={`w-[1px] h-full transition-colors ${
          isDragging
            ? 'bg-foreground/60'
            : isHovered
            ? 'bg-foreground/40'
            : 'bg-border'
        }`}
      />

      {/* Center grip handle capsule */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-8 rounded-full transition-all ${
          isDragging
            ? 'bg-secondary border border-border text-foreground shadow-sm scale-105'
            : isHovered
            ? 'bg-secondary border border-border text-foreground/80'
            : 'bg-card border border-border/80 text-muted-foreground/60 opacity-60 group-hover:opacity-100'
        }`}
      >
        <GripVertical className="w-3 h-3" />
      </div>

      {/* Floating Ratio Tooltip while dragging */}
      {isDragging && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none px-2 py-0.5 rounded border border-border bg-popover text-[11px] font-mono text-muted-foreground shadow-md whitespace-nowrap z-50">
          {Math.round(splitPercentage)}% / {100 - Math.round(splitPercentage)}%
        </div>
      )}
    </div>
  );
};
