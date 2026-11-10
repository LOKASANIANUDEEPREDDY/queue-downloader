import { spawn, execFile, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';
import { QueueItem, ProgressInfo, DownloadFormat, VideoQuality } from '../shared/types.js';

export interface MetadataResult {
  id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail: string;
}

export interface DownloadCallbacks {
  onStatusChange: (status: 'Fetching info' | 'Downloading' | 'Converting') => void;
  onProgress: (progress: ProgressInfo) => void;
  onMetadata?: (meta: MetadataResult) => void;
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  error?: string;
  isTransient?: boolean;
}

// Track active child processes by item ID for cancellation
const activeProcesses = new Map<string, ChildProcess>();

export function getCookieArgs(): string[] {
  const possiblePaths = [
    process.env.COOKIES_PATH,
    path.join(process.cwd(), 'data', 'cookies.txt'),
    path.join(process.cwd(), 'cookies.txt'),
    path.join(config.downloadDir, 'cookies.txt'),
    path.join(path.dirname(config.dbPath), 'cookies.txt'),
  ].filter(Boolean) as string[];

  for (const cookiePath of possiblePaths) {
    if (fs.existsSync(cookiePath)) {
      return ['--cookies', cookiePath];
    }
  }

  if (process.env.COOKIES_BROWSER) {
    return ['--cookies-from-browser', process.env.COOKIES_BROWSER];
  }

  return [];
}

export function cancelActiveProcess(itemId: string): boolean {
  const proc = activeProcesses.get(itemId);
  if (proc) {
    try {
      proc.kill('SIGTERM');
      setTimeout(() => {
        try {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        } catch {
          // ignore
        }
      }, 1500).unref();
      activeProcesses.delete(itemId);
      return true;
    } catch {
      activeProcesses.delete(itemId);
      return false;
    }
  }
  return false;
}

export async function fetchVideoMetadata(url: string, abortSignal?: AbortSignal): Promise<MetadataResult | null> {
  return new Promise((resolve) => {
    const args = [
      '--dump-single-json',
      '--no-warnings',
      '--no-playlist',
      '--skip-download',
      '--extractor-args', 'youtube:player_client=ios,android,tv,web',
      ...getCookieArgs(),
      url,
    ];

    let stdout = '';
    let stderr = '';

    try {
      const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          try {
            proc.kill('SIGKILL');
          } catch {}
        });
      }

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });

      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0 || !stdout) {
          resolve(null);
          return;
        }

        try {
          const json = JSON.parse(stdout);
          let thumbnail = json.thumbnail;
          if (Array.isArray(json.thumbnails) && json.thumbnails.length > 0) {
            // Pick high quality thumbnail if available
            thumbnail = json.thumbnails[json.thumbnails.length - 1].url || json.thumbnail;
          }

          resolve({
            id: json.id || '',
            title: json.title || 'Untitled Video',
            channel: json.uploader || json.channel || 'Unknown Channel',
            duration: typeof json.duration === 'number' ? Math.round(json.duration) : 0,
            thumbnail: thumbnail || '',
          });
        } catch {
          resolve(null);
        }
      });

      proc.on('error', () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

export interface PlaylistInfo {
  title: string;
  entries: Array<{
    id: string;
    url: string;
    title: string;
    duration?: number;
    uploader?: string;
  }>;
}

export async function fetchPlaylistEntries(url: string): Promise<PlaylistInfo | null> {
  return new Promise((resolve) => {
    const args = [
      '--flat-playlist',
      '--dump-single-json',
      '--no-warnings',
      '--extractor-args', 'youtube:player_client=ios,android,tv,web',
      ...getCookieArgs(),
      url,
    ];

    let stdout = '';
    try {
      const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'ignore'] });

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0 || !stdout) {
          resolve(null);
          return;
        }

        try {
          const json = JSON.parse(stdout);
          const entries = (json.entries || []).map((e: any) => ({
            id: e.id || '',
            url: e.url || (e.id ? `https://www.youtube.com/watch?v=${e.id}` : ''),
            title: e.title || 'Untitled Video',
            duration: typeof e.duration === 'number' ? Math.round(e.duration) : 0,
            uploader: e.uploader || e.channel || '',
          })).filter((e: any) => Boolean(e.id && e.url));

          resolve({
            title: json.title || 'YouTube Playlist',
            entries,
          });
        } catch {
          resolve(null);
        }
      });

      proc.on('error', () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

function parseReadableError(rawStderr: string): { message: string; isTransient: boolean } {
  const lower = rawStderr.toLowerCase();

  // Check transient network errors
  if (
    lower.includes('http error 429') ||
    lower.includes('too many requests') ||
    lower.includes('connection reset') ||
    lower.includes('socket hang up') ||
    lower.includes('timed out') ||
    lower.includes('temporary failure in name resolution') ||
    lower.includes('incompleteread') ||
    lower.includes('network is unreachable') ||
    lower.includes('http error 500') ||
    lower.includes('http error 502') ||
    lower.includes('http error 503') ||
    lower.includes('http error 504')
  ) {
    return {
      message: 'Network connection issue or rate limit. Retrying...',
      isTransient: true,
    };
  }

  // Check common YouTube errors
  if (
    lower.includes('sign in to confirm you’re not a bot') ||
    lower.includes("sign in to confirm you're not a bot") ||
    lower.includes('confirm you are not a bot') ||
    lower.includes('bot detection')
  ) {
    return {
      message: 'YouTube bot verification required (common on cloud/datacenter IPs). Use your local Mac app (http://127.0.0.1:3000) or place cookies.txt in the data folder.',
      isTransient: false,
    };
  }

  if (lower.includes('sign in to confirm your age') || lower.includes('age-restricted')) {
    return {
      message: 'Video is age-restricted and requires signing in to view.',
      isTransient: false,
    };
  }

  if (lower.includes('private video') || lower.includes('this video is private')) {
    return {
      message: 'Video is private and cannot be downloaded.',
      isTransient: false,
    };
  }

  if (lower.includes('members-only content') || lower.includes('join this channel')) {
    return {
      message: 'Video is restricted to channel members.',
      isTransient: false,
    };
  }

  if (lower.includes('this video has been removed') || lower.includes('video unavailable')) {
    return {
      message: 'Video is unavailable or has been removed by YouTube.',
      isTransient: false,
    };
  }

  if (lower.includes('not available in your country') || lower.includes('geo-restricted')) {
    return {
      message: 'Video is geo-blocked in your region.',
      isTransient: false,
    };
  }

  if (lower.includes('premiere') || lower.includes('live event will begin')) {
    return {
      message: 'Live stream or premiere has not finished broadcasting.',
      isTransient: false,
    };
  }

  // Extract concise error line from stderr
  const lines = rawStderr.split('\n').filter((l) => l.includes('ERROR:') || l.includes('error:'));
  if (lines.length > 0) {
    const cleanLine = lines[0].replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, '').trim();
    if (cleanLine) {
      return {
        message: cleanLine.slice(0, 200),
        isTransient: false,
      };
    }
  }

  return {
    message: rawStderr.trim().slice(-200) || 'Download process terminated unexpectedly.',
    isTransient: false,
  };
}

function buildFormatArgs(format: DownloadFormat, quality: VideoQuality): string[] {
  if (format === 'mp3') {
    return [
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '0',
    ];
  }

  // MP4 video format selector targeting QuickTime/macOS native H.264 (avc1) + AAC (mp4a)
  const qualityMap: Record<VideoQuality, string> = {
    best: 'bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[vcodec^=avc]+bestaudio/best[vcodec^=avc]/bestvideo+bestaudio/best',
    '1080p': 'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=1080][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[height<=1080][vcodec^=avc]+bestaudio/bestvideo[height<=1080]+bestaudio/best',
    '720p': 'bestvideo[height<=720][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=720][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[height<=720][vcodec^=avc]+bestaudio/bestvideo[height<=720]+bestaudio/best',
    '480p': 'bestvideo[height<=480][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=480][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[height<=480][vcodec^=avc]+bestaudio/bestvideo[height<=480]+bestaudio/best',
    '360p': 'bestvideo[height<=360][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=360][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[height<=360][vcodec^=avc]+bestaudio/bestvideo[height<=360]+bestaudio/best',
  };

  const formatSelector = qualityMap[quality] || qualityMap.best;

  return [
    '-f',
    formatSelector,
    '-S',
    'vcodec:h264,res,acodec:m4a',
    '--merge-output-format',
    'mp4',
    '--postprocessor-args',
    'Merger:-c:a aac -movflags +faststart',
  ];
}

/**
 * Validates that an MP4 file has QuickTime-compatible streams (H.264 video + AAC audio).
 * If YouTube only offered AV1 (av01) or VP9 (vp09), or Opus audio, this transcodes
 * the file using ffmpeg to standard H.264 (yuv420p) + AAC with faststart so QuickTime
 * plays it natively without any warning dialog.
 */
async function ensureQuickTimeCompatibility(
  filePath: string,
  callbacks?: DownloadCallbacks
): Promise<string> {
  if (!filePath.endsWith('.mp4') || !fs.existsSync(filePath)) {
    return filePath;
  }

  return new Promise((resolve) => {
    execFile(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', filePath],
      (err, stdout) => {
        if (err || !stdout) {
          resolve(filePath);
          return;
        }

        try {
          const data = JSON.parse(stdout);
          const streams: Array<{ codec_type: string; codec_name: string }> = data.streams || [];
          const videoStream = streams.find((s) => s.codec_type === 'video');
          const audioStream = streams.find((s) => s.codec_type === 'audio');

          const isH264 = videoStream?.codec_name === 'h264';
          const isAacOrMp3 = audioStream?.codec_name === 'aac' || audioStream?.codec_name === 'mp3';

          // Already natively supported by QuickTime
          if (isH264 && isAacOrMp3) {
            resolve(filePath);
            return;
          }

          // Transcoding needed for QuickTime Player compatibility
          callbacks?.onStatusChange('Converting');

          const tempOutput = `${filePath}.qt_fix.mp4`;
          const ffmpegArgs = [
            '-y',
            '-i', filePath,
            '-c:v', isH264 ? 'copy' : 'libx264',
            ...(isH264 ? [] : ['-pix_fmt', 'yuv420p', '-preset', 'fast', '-crf', '22']),
            '-c:a', isAacOrMp3 ? 'copy' : 'aac',
            ...(isAacOrMp3 ? [] : ['-b:a', '192k']),
            '-movflags', '+faststart',
            tempOutput,
          ];

          execFile('ffmpeg', ffmpegArgs, (ffmpegErr) => {
            if (ffmpegErr || !fs.existsSync(tempOutput)) {
              try {
                if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
              } catch {}
              resolve(filePath);
              return;
            }

            try {
              fs.renameSync(tempOutput, filePath);
            } catch {
              try {
                fs.copyFileSync(tempOutput, filePath);
                fs.unlinkSync(tempOutput);
              } catch {}
            }

            resolve(filePath);
          });
        } catch {
          resolve(filePath);
        }
      }
    );
  });
}

export function executeDownload(
  item: QueueItem,
  callbacks: DownloadCallbacks
): Promise<DownloadResult> {
  return new Promise((resolve) => {
    callbacks.onStatusChange('Fetching info');

    // Output template with sanitized title and video ID
    const outputTemplate = path.join(config.downloadDir, '%(title).120B [%(id)s].%(ext)s');

    // Build argument array - NEVER shell string
    const args: string[] = [
      '--no-warnings',
      '--no-playlist',
      '--newline',
      '--progress-delta', '0.5',
      '--progress-template', 'download:PROGRESS:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s',
      '--print', 'after_move:filepath',
      '--extractor-args', 'youtube:player_client=ios,android,tv,web',
      ...getCookieArgs(),
      ...buildFormatArgs(item.format, item.quality),
      '-o', outputTemplate,
      item.url,
    ];

    let finalFilePath = '';
    let rawStderr = '';
    let hasStartedDownload = false;
    let isConverting = false;

    let proc: ChildProcess;
    try {
      proc = spawn('yt-dlp', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err: any) {
      resolve({
        success: false,
        error: `Failed to spawn yt-dlp: ${err?.message || 'unknown error'}`,
        isTransient: false,
      });
      return;
    }

    activeProcesses.set(item.id, proc);

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const lines = text.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Check if progress line
        if (trimmed.startsWith('PROGRESS:')) {
          if (!hasStartedDownload) {
            hasStartedDownload = true;
            callbacks.onStatusChange('Downloading');
          }

          const parts = trimmed.substring('PROGRESS:'.length).split('|');
          if (parts.length >= 3) {
            const rawPercent = parts[0]?.replace('%', '').trim();
            const speed = parts[1]?.trim() || '';
            const eta = parts[2]?.trim() || '';
            const downBytes = parts[3] ? parseInt(parts[3], 10) : undefined;
            const totalBytes = parts[4] ? parseInt(parts[4], 10) : undefined;
            const percentNum = parseFloat(rawPercent);

            callbacks.onProgress({
              percent: isNaN(percentNum) ? 0 : Math.min(100, Math.max(0, percentNum)),
              speed,
              eta,
              downloadedBytes: isNaN(downBytes as number) ? undefined : downBytes,
              totalBytes: isNaN(totalBytes as number) ? undefined : totalBytes,
            });
          }
          continue;
        }

        // Check fallback standard yt-dlp download progress: [download]  45.2% of  12.34MiB at   2.50MiB/s ETA 00:03
        if (trimmed.startsWith('[download]') && trimmed.includes('%')) {
          if (!hasStartedDownload) {
            hasStartedDownload = true;
            callbacks.onStatusChange('Downloading');
          }

          const match = trimmed.match(/([0-9\.]+)%\s+of\s+([~0-9\.]+[A-Za-z]+)?\s+at\s+([0-9\.]+[A-Za-z]+\/s|Unknown)?\s+ETA\s+([0-9:]+|Unknown)?/);
          if (match) {
            const percent = parseFloat(match[1]);
            callbacks.onProgress({
              percent: isNaN(percent) ? 0 : percent,
              speed: match[3] || '',
              eta: match[4] || '',
            });
          }
          continue;
        }

        // Check for conversion / postprocessing hooks
        if (
          trimmed.startsWith('[ExtractAudio]') ||
          trimmed.startsWith('[Merger]') ||
          trimmed.startsWith('[Fixup') ||
          trimmed.startsWith('[VideoConvertor]')
        ) {
          if (!isConverting) {
            isConverting = true;
            callbacks.onStatusChange('Converting');
          }
          continue;
        }

        // Check if line is the final file path from --print after_move:filepath
        if (trimmed.startsWith('/') && fs.existsSync(trimmed)) {
          finalFilePath = trimmed;
        }
      }
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      rawStderr += chunk.toString();
    });

    proc.on('close', async (code, signal) => {
      activeProcesses.delete(item.id);

      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        resolve({
          success: false,
          error: 'Download cancelled by user.',
          isTransient: false,
        });
        return;
      }

      if (code !== 0) {
        const { message, isTransient } = parseReadableError(rawStderr);
        resolve({
          success: false,
          error: message,
          isTransient,
        });
        return;
      }

      // If final file path was not captured via print, locate it in downloads folder
      if (!finalFilePath || !fs.existsSync(finalFilePath)) {
        try {
          const files = fs.readdirSync(config.downloadDir);
          const found = files.find((f) => f.includes(`[${item.videoId}]`));
          if (found) {
            finalFilePath = path.join(config.downloadDir, found);
          }
        } catch {}
      }

      // Ensure 100% QuickTime compatibility (transcode AV1/VP9 to H.264 if needed)
      if (finalFilePath && fs.existsSync(finalFilePath) && item.format === 'mp4') {
        try {
          finalFilePath = await ensureQuickTimeCompatibility(finalFilePath, callbacks);
        } catch {}
      }

      let fileSize = 0;
      if (finalFilePath && fs.existsSync(finalFilePath)) {
        try {
          fileSize = fs.statSync(finalFilePath).size;
        } catch {}
      }

      resolve({
        success: true,
        filePath: finalFilePath || undefined,
        fileSize: fileSize || undefined,
      });
    });

    proc.on('error', (err) => {
      activeProcesses.delete(item.id);
      resolve({
        success: false,
        error: `Process error: ${err.message}`,
        isTransient: false,
      });
    });
  });
}

