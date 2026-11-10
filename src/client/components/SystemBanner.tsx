import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Terminal, Wrench, X } from 'lucide-react';
import { SystemStatus } from '../../shared/types.js';
import { toast } from './Toast.js';
import { safeFetchJson } from '../utils/api.js';

interface SystemBannerProps {
  isOpenModal?: boolean;
  onCloseModal?: () => void;
}

export const SystemBanner: React.FC<SystemBannerProps> = ({ isOpenModal = false, onCloseModal }) => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);

  const fetchStatus = async () => {
    try {
      setIsRefreshing(true);
      const result = await safeFetchJson<SystemStatus>('/api/system/status');
      if (result.ok && result.data) {
        setStatus(result.data);
      }
    } catch {
      // ignore
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleInstallTools = async () => {
    try {
      setIsInstalling(true);
      toast.info('Downloading and configuring yt-dlp & ffmpeg binaries in server...', 'Auto-Installer', 6000);
      const result = await safeFetchJson<{ success: boolean; message: string }>('/api/system/install-tools', {
        method: 'POST',
      });
      if (result.ok && result.data?.success) {
        toast.success(result.data.message || 'Tools provisioned successfully!', 'Ready to Download');
      } else {
        toast.warning(result.data?.message || result.error || 'Provisioning attempted', 'Installer Result');
      }
      await fetchStatus();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to auto-install tools');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleUpdateYtdlp = async () => {
    try {
      setIsUpdating(true);
      toast.info('Running yt-dlp updater...', 'System Maintenance');
      const result = await safeFetchJson('/api/system/update-ytdlp', { method: 'POST' });
      const data = result.data || {};

      if (result.ok && data.success) {
        toast.success(data.message || 'yt-dlp is up to date!', 'Update Success');
      } else {
        toast.warning(result.error || data.message || 'Update completed with warnings', 'Update Result');
      }
      await fetchStatus();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to trigger yt-dlp update', 'Update Error');
    } finally {
      setIsUpdating(false);
    }
  };

  if (!status) return null;

  const isMissingTools = !status.ytdlp.installed || !status.ffmpeg.installed;

  // Banner if tools are missing
  const MissingBanner = isMissingTools ? (
    <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200">
      <div className="flex items-start gap-3.5">
        <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base">Missing System Dependencies</h3>
          <p className="text-sm mt-1 text-slate-700 dark:text-slate-300">
            {!status.ytdlp.installed && !status.ffmpeg.installed ? (
              <>Both <strong>yt-dlp</strong> and <strong>ffmpeg</strong> are required to download and process YouTube videos.</>
            ) : !status.ytdlp.installed ? (
              <><strong>yt-dlp</strong> was not found on your system. It is required to download streams.</>
            ) : (
              <><strong>ffmpeg</strong> was not found on your system. It is required to convert MP3 audio and merge 1080p+ video streams.</>
            )}
          </p>

          <div className="mt-3 p-2.5 rounded-lg bg-slate-900 text-slate-100 font-mono text-xs flex items-center justify-between gap-3 overflow-x-auto">
            <span className="select-all">brew install yt-dlp ffmpeg</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText('brew install yt-dlp ffmpeg');
                toast.success('Command copied to clipboard!');
              }}
              className="text-xs bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded border border-slate-700 text-slate-300 shrink-0"
            >
              Copy
            </button>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-3">
            <button
              onClick={handleInstallTools}
              disabled={isInstalling || isRefreshing}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition-colors shadow-sm"
            >
              <Wrench className={`w-3.5 h-3.5 ${isInstalling ? 'animate-spin' : ''}`} />
              {isInstalling ? 'Installing Binaries...' : '⚡ Auto-Install Cloud Tools'}
            </button>

            <button
              onClick={fetchStatus}
              disabled={isRefreshing || isInstalling}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Recheck Tools
            </button>

            <span className="text-xs text-amber-800 dark:text-amber-300 font-normal">
              💡 Tip: The local app at <code>http://127.0.0.1:3000</code> uses your Mac's Homebrew tools with zero timeouts.
            </span>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  // Tools Modal
  const ToolsModal = isOpenModal ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 text-slate-900 dark:text-slate-100 relative">
        <button
          onClick={onCloseModal}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">System Environment</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Underlying tools status and updater</p>
          </div>
        </div>

        <div className="space-y-3.5 py-2">
          {/* yt-dlp row */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">yt-dlp</span>
              {status.ytdlp.installed ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" /> Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-rose-500 font-medium">
                  <AlertTriangle className="w-4 h-4" /> Not found
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
              {status.ytdlp.version ? `v${status.ytdlp.version}` : 'Please install via Homebrew or pip'}
            </div>
          </div>

          {/* ffmpeg row */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">ffmpeg</span>
              {status.ffmpeg.installed ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" /> Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-rose-500 font-medium">
                  <AlertTriangle className="w-4 h-4" /> Not found
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono truncate">
              {status.ffmpeg.version || 'brew install ffmpeg'}
            </div>
          </div>

          {/* Storage / Retention */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-xs">
            <div className="text-slate-500 dark:text-slate-400 mb-1">Storage & Retention</div>
            <div className="font-medium">Retention: {status.storage.retentionDays > 0 ? `${status.storage.retentionDays} days` : 'Disabled'}</div>
            <div className="text-slate-400 truncate mt-0.5">{status.storage.downloadDir}</div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2 justify-end">
          <button
            onClick={handleInstallTools}
            disabled={isInstalling || isUpdating}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all disabled:opacity-50"
          >
            <Wrench className={`w-3.5 h-3.5 ${isInstalling ? 'animate-spin' : ''}`} />
            {isInstalling ? 'Installing...' : '⚡ Auto-Install Tools'}
          </button>
          <button
            onClick={handleUpdateYtdlp}
            disabled={isUpdating || isInstalling}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
            {isUpdating ? 'Updating...' : 'Update yt-dlp'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {MissingBanner}
      {ToolsModal}
    </>
  );
};

