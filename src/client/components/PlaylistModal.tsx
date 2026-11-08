import React from 'react';
import { ListVideo, Film, X, PlaySquare } from 'lucide-react';

interface PlaylistModalProps {
  isOpen: boolean;
  playlistTitle?: string;
  itemCount?: number;
  onConfirmAll: () => void;
  onConfirmSingle: () => void;
  onCancel: () => void;
}

export const PlaylistModal: React.FC<PlaylistModalProps> = ({
  isOpen,
  playlistTitle = 'YouTube Playlist',
  itemCount,
  onConfirmAll,
  onConfirmSingle,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 text-slate-900 dark:text-slate-100 relative">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500">
            <ListVideo className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Playlist Detected</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {itemCount ? `${itemCount} videos in playlist` : 'Multiple videos found in this URL'}
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 my-4 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800">
          <strong className="block text-slate-800 dark:text-slate-200 mb-0.5">{playlistTitle}</strong>
          Would you like to enqueue every video in this playlist in order, or only download this single video?
        </p>

        <div className="flex flex-col gap-2.5 mt-5">
          <button
            onClick={onConfirmAll}
            className="flex items-center justify-center gap-2.5 w-full py-2.5 px-4 rounded-xl font-semibold text-sm bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20 transition-all active:scale-[0.99]"
          >
            <ListVideo className="w-4 h-4" />
            <span>Add Entire Playlist {itemCount ? `(${itemCount} videos)` : ''}</span>
          </button>

          <button
            onClick={onConfirmSingle}
            className="flex items-center justify-center gap-2.5 w-full py-2.5 px-4 rounded-xl font-semibold text-sm bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-all active:scale-[0.99]"
          >
            <Film className="w-4 h-4" />
            <span>Add Single Video Only</span>
          </button>

          <button
            onClick={onCancel}
            className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

