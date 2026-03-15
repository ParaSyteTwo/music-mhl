import { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, GripVertical } from 'lucide-react';
import { useMusicStore } from '@/store/musicStore';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface QueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface QueueItemProps {
  id: string;
  index: number;
  isCurrent: boolean;
  title: string;
  artist: string;
  duration: number;
  cover?: string;
  onDelete: () => void;
  onClick: () => void;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Draggable Queue Item
function QueueTrackItem({
  id,
  index,
  isCurrent,
  title,
  artist,
  duration,
  cover,
  onDelete,
  onClick,
}: QueueItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
        isCurrent
          ? 'bg-[rgba(200,240,75,0.08)] border-l-2 border-[#C8F04B]'
          : 'hover:bg-[rgba(255,255,255,0.04)]'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-[#666660] hover:text-[#A0A0A0] cursor-grab active:cursor-grabbing flex-shrink-0"
        title="Drag to reorder"
      >
        <GripVertical size={16} />
      </button>

      {/* Track Number */}
      <span className="w-6 text-center text-xs font-mono text-[#666660]">
        {index + 1}
      </span>

      {/* Cover */}
      <div
        className="w-10 h-10 rounded flex-shrink-0 bg-gradient-to-br from-[#C8F04B] to-[#8BC34A] flex items-center justify-center text-xs font-bold text-black overflow-hidden"
        onClick={onClick}
      >
        {cover ? (
          <img src={cover} alt={title} className="w-full h-full object-cover" />
        ) : (
          '♪'
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
        <p
          className={`text-sm font-dm-sans truncate ${
            isCurrent
              ? 'text-[#C8F04B] font-semibold'
              : 'text-[#F5F5F0]'
          }`}
        >
          {title}
        </p>
        <p className="text-xs text-[#666660] truncate">{artist}</p>
      </div>

      {/* Duration */}
      <span className="text-xs font-mono text-[#666660] w-12 text-right">
        {formatTime(duration)}
      </span>

      {/* Delete Button */}
      <button
        onClick={onDelete}
        className="opacity-0 hover:opacity-100 text-[#666660] hover:text-red-500 transition-all flex-shrink-0"
        title="Remove from queue"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function QueuePanel({ isOpen, onClose }: QueuePanelProps) {
  const { player, jumpToQueueItem, removeFromQueue, clearQueue } = useMusicStore();
  const { currentTrack, queue = [], queueIndex = 0 } = player;

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      distance: 8,
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const queueIds = useMemo(() => queue.map((_, idx) => `queue-${idx}`), [queue.length]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = queueIds.indexOf(active.id as string);
      const newIndex = queueIds.indexOf(over.id as string);

      if (oldIndex !== -1 && newIndex !== -1) {
        // TODO: Add reorderQueue to musicStore
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          {/* Slide-in Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute right-0 top-0 h-full w-[340px] bg-[#0f0f0f] border-l border-[rgba(255,255,255,0.08)] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{
              boxShadow:
                '-4px 0 20px rgba(0,0,0,0.5), 0 0 40px rgba(200,240,75,0.05)',
            }}
          >
            {/* Header */}
            <div className="sticky top-0 bg-[#0f0f0f] border-b border-[rgba(255,255,255,0.08)] px-4 py-4 flex items-center justify-between z-10">
              <div className="flex-1">
                <h2 className="font-syne text-lg font-bold text-[#F5F5F0]">
                  Playback Queue
                </h2>
                <p className="text-xs text-[#666660]">
                  {queue.length} track{queue.length !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="flex gap-2">
                {queue.length > 0 && (
                  <button
                    onClick={clearQueue}
                    className="px-3 py-1.5 text-xs font-dm-sans text-[#666660] hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Clear queue"
                  >
                    Clear
                  </button>
                )}

                <button
                  onClick={onClose}
                  className="p-1.5 text-[#666660] hover:text-[#F5F5F0] hover:bg-[rgba(255,255,255,0.04)] rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Queue List */}
            {queue.length > 0 ? (
              <div className="flex-1 overflow-y-auto">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={queueIds}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1 p-2">
                      {queue.map((track, index) => (
                        <QueueTrackItem
                          key={`${track.id}-${index}`}
                          id={`queue-${index}`}
                          index={index}
                          isCurrent={index === queueIndex}
                          title={track.title}
                          artist={track.artist}
                          duration={track.duration}
                          cover={track.cover}
                          onDelete={() => removeFromQueue(index)}
                          onClick={() => jumpToQueueItem(index)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center px-6 text-center space-y-3">
                <div className="text-4xl opacity-30">♪</div>
                <p className="text-[#666660] text-sm">Queue is empty</p>
                <p className="text-[#333330] text-xs">
                  Start playing to build your queue
                </p>
              </div>
            )}

            {/* Bottom padding for player */}
            <div className="h-[var(--player-height)]" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
