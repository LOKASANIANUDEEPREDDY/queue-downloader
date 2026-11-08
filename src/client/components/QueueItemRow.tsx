import React, { useState } from 'react';
import {
  Download,
  RotateCcw,
  XCircle,
  Trash2,
  Clock,
  User,
  Music,
  Video,
  AlertCircle,
  CheckCircle2,
  Loader2,
  HardDriveDownload,
  FolderOpen,
} from 'lucide-react';
import { QueueItem, ItemStatus } from '../../shared/types.js';
import { toast } from './Toast.js';

interface QueueItemRowProps {
  item: QueueItem;
  isActive: boolean;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '--:--';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

export const QueueItemRow: React.FC<QueueItemRowProps> = ({
  item,
  isActive,
  onCancel,
  onRetry,
  onRemove,
}) => {
  const percent = item.progress?.percent ?? 0;
  const speed = item.progress?.speed ?? '';
  const eta = item.progress?.eta ?? '';
  const isAudio = item.format === 'mp3';

  // Status Badge UI
  const getStatusBadge = (status: ItemStatus) => {
    switch (status) {
      case 'Queued':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <Clock className="w-3 h-3 text-slate-400" />
            Queued
          </span>
        );
      case 'Fetching info':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin text-blue-600 dark:text-blue-400" />
            Fetching info
          </span>
        );
      case 'Downloading':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            <HardDriveDownload className="w-3 h-3 animate-bounce text-indigo-600 dark:text-indigo-400" />
            Downloading
          </span>
        );
      case 'Converting':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Loader2 className="w-3 h-3 animate-spin text-amber-600 dark:text-amber-400" />
            Converting
          </span>
        );
      case 'Done':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            Done
          </span>
        );
      case 'Failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
            Failed
          </span>
        );
      case 'Cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            <XCircle className="w-3 h-3 text-slate-400" />
            Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  const isDownloading = item.status === 'Downloading';
  const isConverting = item.status === 'Converting';
  const isDone = item.status === 'Done';
  const isFailed = item.status === 'Failed';
  const isCancelled = item.status === 'Cancelled';
  const canCancel = item.status === 'Queued' || item.status === 'Fetching info' || isDownloading || isConverting;

  const [imgError, setImgError] = useState(false);

  const handleSaveFile = () => {
    const link = document.createElement('a');
    link.href = `/api/downloads/${item.id}/file`;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('File download started in browser', 'Saved to Downloads');
  };

  const handleRevealInFinder = async () => {
    try {
      const res = await fetch(`/api/downloads/${item.id}/reveal`, { method: 'POST' });
      if (res.ok) {
        toast.info('Opened file location in Finder', 'Finder');
      } else {
        toast.error('File location could not be opened');
      }
    } catch {
      toast.error('Failed to communicate with local server');
    }
  };

  return (
    <div
      className={`group relative rounded-2xl border transition-all duration-200 p-3.5 sm:p-4 bg-white dark:bg-slate-900 ${
        isActive
          ? 'border-indigo-400/60 dark:border-indigo-500/50 shadow-md shadow-indigo-500/5 ring-1 ring-indigo-500/20'
          : 'border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm'
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3.5">
        {/* Thumbnail with overlay duration & format */}
        <div className="relative w-full sm:w-36 h-28 sm:h-20 shrink-0 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-800">
          {item.thumbnail && !imgError ? (
            <img
              src={item.thumbnail}
              alt={item.title || 'Video thumbnail'}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              {isAudio ? <Music className="w-8 h-8" /> : <Video className="w-8 h-8" />}
            </div>
          )}

          {/* Duration Badge */}
          {item.duration !== null && (
            <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/80 text-[11px] font-mono font-medium text-white shadow">
              {formatDuration(item.duration)}
            </div>
          )}

          {/* Format / Quality Tag */}
          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/75 text-[10px] font-bold text-white uppercase tracking-wider shadow">
            {isAudio ? 'MP3' : item.quality}
          </div>
        </div>

        {/* Video Info & Status */}
        <div className="flex-1 min-w-0 w-full">
          <div className="flex items-start justify-between gap-2">
            <h4
              className="font-semibold text-sm sm:text-base text-slate-900 dark:text-slate-100 line-clamp-1 leading-snug"
              title={item.title || item.url}
            >
              {item.title || item.url}
            </h4>
            <div className="shrink-0">{getStatusBadge(item.status)}</div>
          </div>

          {/* Channel & Details */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
            {item.channel && (
              <span className="flex items-center gap-1 font-medium truncate max-w-[200px]">
                <User className="w-3 h-3 shrink-0" />
                {item.channel}
              </span>
            )}
            {item.fileSize && (
              <span>• {formatBytes(item.fileSize)}</span>
            )}
            {item.retryCount > 0 && !isDone && (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                • Retries: {item.retryCount}/2
              </span>
            )}
          </div>

          {/* Error Message if Failed */}
          {item.error && isFailed && (
            <div className="mt-2 text-xs text-rose-600 dark:text-rose-400 font-medium bg-rose-50 dark:bg-rose-950/40 p-2 rounded-lg border border-rose-200 dark:border-rose-900/50 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="break-words">{item.error}</span>
            </div>
          )}

          {/* Progress Bar (Visible during Downloading or Converting or Done) */}
          {(isDownloading || isConverting) && (
            <div className="mt-2.5 space-y-1.5">
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    isConverting
                      ? 'bg-amber-500 w-full animate-pulse'
                      : 'bg-gradient-to-r from-rose-500 to-indigo-600'
                  }`}
                  style={{ width: isConverting ? '100%' : `${percent}%` }}
                />
              </div>

              {/* Progress metrics */}
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
                <span>
                  {isConverting ? 'Processing with FFmpeg...' : `${percent.toFixed(1)}%`}
                </span>
                <div className="flex items-center gap-3">
                  {speed && <span>{speed}</span>}
                  {eta && <span>ETA {eta}</span>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 shrink-0 w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
          {/* Save File Button */}
          {isDone && item.filePath && (
            <>
              <button
                onClick={handleSaveFile}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all active:scale-95"
                title="Save file to your browser's Downloads folder"
              >
                <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Save file</span>
              </button>

              <button
                onClick={handleRevealInFinder}
                className="p-1.5 rounded-xl text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Show in Finder"
                aria-label="Show in Finder"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Retry Button */}
          {(isFailed || isCancelled) && (
            <button
              onClick={() => onRetry(item.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Retry download"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          )}

          {/* Cancel Button */}
          {canCancel && (
            <button
              onClick={() => onCancel(item.id)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              title="Cancel download"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          )}

          {/* Remove Button */}
          <button
            onClick={() => onRemove(item.id)}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Remove from queue"
            aria-label="Remove item"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

