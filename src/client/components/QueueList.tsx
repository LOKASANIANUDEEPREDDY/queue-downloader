import React from 'react';
import { Layers, Play } from 'lucide-react';
import { QueueItem } from '../../shared/types.js';
import { QueueItemRow } from './QueueItemRow.js';

interface QueueListProps {
  items: QueueItem[];
  activeItemId: string | null;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onDownloadAll?: () => void;
}

export const QueueList: React.FC<QueueListProps> = ({
  items,
  activeItemId,
  onCancel,
  onRetry,
  onRemove,
  onDownloadAll,
}) => {
  if (items.length === 0) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-12 text-center my-8 bg-white/40 dark:bg-slate-900/40">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center text-slate-400 dark:text-slate-500">
          <Layers className="w-8 h-8 stroke-[1.5]" />
        </div>
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
          The download queue is empty
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
          Paste a YouTube link to start. Downloads process strictly one-by-one automatically.
        </p>
      </div>
    );
  }

  const queuedCount = items.filter((i) => i.status === 'Queued' || i.status === 'Failed').length;
  const inProgressCount = items.filter((i) => i.status === 'Fetching info' || i.status === 'Downloading' || i.status === 'Converting').length;
  const completedCount = items.filter((i) => i.status === 'Done').length;

  return (
    <div className="space-y-4 my-6">
      {/* Subheader summary & Download All button */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 px-1 font-medium">
        <div className="flex items-center gap-2">
          <span>{items.length} {items.length === 1 ? 'item' : 'items'} in queue</span>
          {inProgressCount > 0 && (
            <span className="text-indigo-600 dark:text-indigo-400">• {inProgressCount} active</span>
          )}
          {queuedCount > 0 && (
            <span>• {queuedCount} waiting</span>
          )}
          {completedCount > 0 && (
            <span className="text-emerald-600 dark:text-emerald-400">• {completedCount} finished</span>
          )}
        </div>

        {onDownloadAll && queuedCount > 0 && (
          <button
            onClick={onDownloadAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all active:scale-95"
            title="Download all queued videos sequentially one by one"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Download All ({queuedCount})</span>
          </button>
        )}
      </div>

      {/* Item rows */}
      <div className="space-y-3">
        {items.map((item) => (
          <QueueItemRow
            key={item.id}
            item={item}
            isActive={item.id === activeItemId}
            onCancel={onCancel}
            onRetry={onRetry}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
};

