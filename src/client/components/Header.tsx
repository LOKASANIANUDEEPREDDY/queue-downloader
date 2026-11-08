import React from 'react';
import { Play, Pause, Trash2, Sun, Moon, ArrowDownToLine, RefreshCw, FolderOpen } from 'lucide-react';
import { QueueState } from '../../shared/types.js';
import { toast } from './Toast.js';

interface HeaderProps {
  queueState: QueueState;
  isConnected: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onPause: () => void;
  onResume: () => void;
  onClearCompleted: () => void;
  onOpenSystemModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  queueState,
  isConnected,
  theme,
  onToggleTheme,
  onPause,
  onResume,
  onClearCompleted,
  onOpenSystemModal,
}) => {
  const completedCount = queueState.items.filter((i) => i.status === 'Done').length;
  const activeItem = queueState.items.find((i) => i.id === queueState.activeItemId);

  const handleOpenFolder = async () => {
    try {
      await fetch('/api/downloads/open-folder', { method: 'POST' });
      toast.info('Opened downloads folder in Finder', 'File Explorer');
    } catch {
      toast.error('Failed to open downloads folder');
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Connection */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-red-500 flex items-center justify-center text-white shadow-md shadow-rose-500/20">
            <ArrowDownToLine className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg sm:text-xl tracking-tight text-slate-900 dark:text-white">
                Queue Downloader
              </h1>
              {/* Connection & status indicator */}
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${
                  !isConnected
                    ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/60'
                    : queueState.isPaused
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/60'
                    : activeItem
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    !isConnected
                      ? 'bg-rose-500'
                      : queueState.isPaused
                      ? 'bg-amber-500'
                      : activeItem
                      ? 'bg-emerald-500 animate-pulse'
                      : 'bg-slate-400'
                  }`}
                />
                {!isConnected
                  ? 'Connecting...'
                  : queueState.isPaused
                  ? 'Queue Paused'
                  : activeItem
                  ? 'Processing'
                  : 'Idle'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
              One-by-one sequential YouTube downloader
            </p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2">
          {/* Pause / Resume */}
          {queueState.isPaused ? (
            <button
              onClick={onResume}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all active:scale-95"
              title="Resume automatic sequential downloading"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Resume Queue</span>
            </button>
          ) : (
            <button
              onClick={onPause}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all active:scale-95"
              title="Pause queue (current item finishes, next will wait)"
            >
              <Pause className="w-4 h-4" />
              <span>Pause Queue</span>
            </button>
          )}

          {/* Clear Completed */}
          {completedCount > 0 && (
            <button
              onClick={onClearCompleted}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/40 transition-colors"
              title="Remove finished items from list"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden md:inline">Clear Completed ({completedCount})</span>
            </button>
          )}

          {/* Open Downloads Folder */}
          <button
            onClick={handleOpenFolder}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Open downloads folder in Finder"
          >
            <FolderOpen className="w-4 h-4 text-amber-500" />
            <span className="hidden sm:inline">Downloads Folder</span>
          </button>

          {/* yt-dlp Tools Check */}
          {onOpenSystemModal && (
            <button
              onClick={onOpenSystemModal}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="yt-dlp and ffmpeg tools status & updates"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          {/* Dark / Light Toggle */}
          <button
            onClick={onToggleTheme}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};

