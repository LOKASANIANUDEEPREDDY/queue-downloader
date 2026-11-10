import React, { useState } from 'react';
import { Plus, Video, Music, Clipboard, Loader2, ListVideo } from 'lucide-react';
import { DownloadFormat, VideoQuality, AddUrlsResponse } from '../../shared/types.js';
import { toast } from './Toast.js';
import { PlaylistModal } from './PlaylistModal.js';
import { safeFetchJson } from '../utils/api.js';

interface UrlInputProps {
  onAddSuccess?: (response: AddUrlsResponse) => void;
}

export const UrlInput: React.FC<UrlInputProps> = ({ onAddSuccess }) => {
  const [inputText, setInputText] = useState('');
  const [format, setFormat] = useState<DownloadFormat>('mp4');
  const [quality, setQuality] = useState<VideoQuality>('best');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoExpandPlaylist, setAutoExpandPlaylist] = useState(true);

  // Detect if any URL in input looks like a playlist
  const hasPlaylistUrl = inputText.includes('list=') || inputText.includes('/playlist');

  // Playlist inspection modal state
  const [playlistModalData, setPlaylistModalData] = useState<{
    isOpen: boolean;
    url: string;
    title?: string;
    itemCount?: number;
    pendingUrls: string[];
  }>({
    isOpen: false,
    url: '',
    pendingUrls: [],
  });

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputText((prev) => (prev ? `${prev}\n${text}` : text));
      }
    } catch {
      toast.warning('Clipboard access denied. Please paste manually.');
    }
  };

  const submitUrls = async (urls: string[], expandPlaylists: boolean) => {
    try {
      setIsSubmitting(true);
      const result = await safeFetchJson<AddUrlsResponse>('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls,
          format,
          quality,
          expandPlaylists,
        }),
      });

      if (!result.ok || !result.data) {
        toast.error(result.error || 'Failed to add items to queue');
        return;
      }

      const data = result.data;

      // Show toast confirmations
      if (data.added.length > 0) {
        const itemText = data.added.length === 1 ? '1 video' : `${data.added.length} videos`;
        toast.success(`Added ${itemText} to download queue`, 'Queue Updated');
      }

      // Show notices for skipped duplicates
      if (data.duplicates.length > 0) {
        for (const dup of data.duplicates) {
          toast.info(dup.reason, 'Duplicate Skipped', 4500);
        }
      }

      // Show errors for any invalid links
      if (data.errors.length > 0) {
        for (const err of data.errors) {
          toast.error(`${err.url}: ${err.error}`, 'Invalid Link');
        }
      }

      setInputText('');
      onAddSuccess?.(data);
    } catch (err: any) {
      toast.error(err?.message || 'Network error while adding to queue');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadEntirePlaylist = async () => {
    if (!inputText.trim() || isSubmitting) return;

    const urls = inputText
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);

    if (urls.length === 0) return;

    toast.info('Fetching playlist tracks and adding to queue...', '1-Click Playlist Download', 4000);
    await submitUrls(urls, true);
  };

  const handleAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSubmitting) return;

    const urls = inputText
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);

    if (urls.length === 0) return;

    // Check if any link is a playlist
    const firstPlaylist = urls.find((u) => u.includes('list=') || u.includes('/playlist'));
    
    // If 1-click full playlist mode is enabled, immediately submit with expandPlaylists = true
    if (firstPlaylist && autoExpandPlaylist) {
      toast.info('Fetching playlist tracks and adding to queue...', '1-Click Playlist Download', 4000);
      await submitUrls(urls, true);
      return;
    }

    if (firstPlaylist) {
      try {
        setIsSubmitting(true);
        const inspectRes = await safeFetchJson<{ isPlaylist: boolean; title?: string; itemCount?: number }>('/api/urls/inspect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: firstPlaylist }),
        });

        if (inspectRes.ok && inspectRes.data?.isPlaylist) {
          setPlaylistModalData({
            isOpen: true,
            url: firstPlaylist,
            title: inspectRes.data.title,
            itemCount: inspectRes.data.itemCount,
            pendingUrls: urls,
          });
          setIsSubmitting(false);
          return;
        }
      } catch {
        // Fallback to normal submission if inspection fails
      }
    }

    // Normal submission (single or multiple links)
    await submitUrls(urls, false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter without shift key
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 transition-all">
        <form onSubmit={handleAdd} className="space-y-3.5">
          {/* Input Box */}
          <div className="relative">
            <textarea
              rows={inputText.includes('\n') ? 3 : 1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Paste a YouTube link here (or multiple links, one per line) and press Enter..."
              className="w-full px-4 py-3 pr-24 rounded-xl text-sm sm:text-base bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500 transition-all resize-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-normal leading-relaxed"
            />
            <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                title="Paste from clipboard"
              >
                <Clipboard className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Controls Bar: Format, Quality, and Add button */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {/* Format selection */}
            <div className="flex items-center gap-2">
              <div className="flex p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80">
                <button
                  type="button"
                  onClick={() => setFormat('mp4')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    format === 'mp4'
                      ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>MP4 Video</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('mp3')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    format === 'mp3'
                      ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Music className="w-3.5 h-3.5" />
                  <span>MP3 Audio</span>
                </button>
              </div>

              {/* Video Quality picker (only visible when MP4 format selected) */}
              {format === 'mp4' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400 hidden sm:inline">Quality:</span>
                  <select
                    value={quality}
                    onChange={(e) => setQuality(e.target.value as VideoQuality)}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-rose-500 cursor-pointer"
                  >
                    <option value="best">Best Available</option>
                    <option value="1080p">1080p (Full HD)</option>
                    <option value="720p">720p (HD)</option>
                    <option value="480p">480p (SD)</option>
                    <option value="360p">360p</option>
                  </select>
                </div>
              )}
              {/* 1-Click Playlist Toggle */}
              <label
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                title="When enabled, playlist links will automatically expand and download all videos in 1 click without extra prompts"
              >
                <input
                  type="checkbox"
                  checked={autoExpandPlaylist}
                  onChange={(e) => setAutoExpandPlaylist(e.target.checked)}
                  className="rounded text-rose-600 focus:ring-rose-500 w-3.5 h-3.5"
                />
                <ListVideo className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="hidden sm:inline">1-Click Playlist</span>
                <span className="sm:hidden">Playlist</span>
              </label>
            </div>

            {/* Action Buttons: 1-Click Playlist Download & Standard Add */}
            <div className="flex items-center gap-2 ml-auto">
              {hasPlaylistUrl && (
                <button
                  type="button"
                  onClick={handleDownloadEntirePlaylist}
                  disabled={!inputText.trim() || isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-700 hover:to-amber-700 disabled:opacity-50 text-white shadow-sm transition-all active:scale-[0.98]"
                  title="Download all videos from this playlist in sequential order"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ListVideo className="w-4 h-4" />
                  )}
                  <span>Download Entire Playlist</span>
                </button>
              )}

              <button
                type="submit"
                disabled={!inputText.trim() || isSubmitting}
                className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white shadow-sm transition-all active:scale-[0.98] disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span>{hasPlaylistUrl && !autoExpandPlaylist ? 'Add Single Video' : 'Add to Queue'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Playlist Choice Modal */}
      <PlaylistModal
        isOpen={playlistModalData.isOpen}
        playlistTitle={playlistModalData.title}
        itemCount={playlistModalData.itemCount}
        onConfirmAll={async () => {
          const urls = playlistModalData.pendingUrls;
          setPlaylistModalData((prev) => ({ ...prev, isOpen: false }));
          await submitUrls(urls, true);
        }}
        onConfirmSingle={async () => {
          const urls = playlistModalData.pendingUrls;
          setPlaylistModalData((prev) => ({ ...prev, isOpen: false }));
          await submitUrls(urls, false);
        }}
        onCancel={() => {
          setPlaylistModalData((prev) => ({ ...prev, isOpen: false }));
        }}
      />
    </>
  );
};

