import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { SystemStatus } from '../shared/types.js';

let cachedStatus: SystemStatus | null = null;

function runCommandAsync(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    try {
      const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });

      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('error', (err) => {
        resolve({ stdout, stderr: err.message, code: -1 });
      });

      proc.on('close', (code) => {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: code ?? 0 });
      });
    } catch (err: any) {
      resolve({ stdout: '', stderr: err?.message || 'Failed to spawn process', code: -1 });
    }
  });
}

export async function checkSystemTools(forceRefresh = false): Promise<SystemStatus> {
  if (cachedStatus && !forceRefresh) {
    return cachedStatus;
  }

  // Check yt-dlp
  const ytdlpResult = await runCommandAsync('yt-dlp', ['--version']);
  const ytdlpInstalled = ytdlpResult.code === 0 && Boolean(ytdlpResult.stdout);

  // Check ffmpeg
  const ffmpegResult = await runCommandAsync('ffmpeg', ['-version']);
  const ffmpegInstalled = ffmpegResult.code === 0 && ffmpegResult.stdout.includes('ffmpeg version');
  const ffmpegVersion = ffmpegInstalled ? ffmpegResult.stdout.split('\n')[0] : undefined;

  cachedStatus = {
    ytdlp: {
      installed: ytdlpInstalled,
      version: ytdlpInstalled ? ytdlpResult.stdout : undefined,
      error: !ytdlpInstalled ? (ytdlpResult.stderr || 'yt-dlp not found in PATH') : undefined,
    },
    ffmpeg: {
      installed: ffmpegInstalled,
      version: ffmpegVersion,
      error: !ffmpegInstalled ? (ffmpegResult.stderr || 'ffmpeg not found in PATH') : undefined,
    },
    storage: {
      downloadDir: config.downloadDir,
      retentionDays: config.retentionDays,
    },
  };

  return cachedStatus;
}

export async function updateYtDlp(): Promise<{ success: boolean; message: string; version?: string }> {
  // First test if yt-dlp is installed
  const check = await checkSystemTools(true);
  if (!check.ytdlp.installed) {
    return {
      success: false,
      message: 'yt-dlp is not installed. Please install it using: brew install yt-dlp (macOS) or python3 -m pip install -U yt-dlp',
    };
  }

  // Run yt-dlp -U safely
  const result = await runCommandAsync('yt-dlp', ['-U']);
  const combined = `${result.stdout}\n${result.stderr}`.trim();

  // If brew-managed yt-dlp, yt-dlp -U may output: "yt-dlp was installed via a package manager, please use that to update it"
  if (combined.includes('installed via a package manager') || combined.includes('homebrew')) {
    // Try running brew upgrade yt-dlp
    const brewResult = await runCommandAsync('brew', ['upgrade', 'yt-dlp']);
    const brewCombined = `${brewResult.stdout}\n${brewResult.stderr}`.trim();
    const newStatus = await checkSystemTools(true);
    return {
      success: brewResult.code === 0,
      message: brewResult.code === 0 ? `yt-dlp updated via Homebrew: ${brewCombined || 'Already up to date'}` : `Homebrew update note: ${brewCombined}`,
      version: newStatus.ytdlp.version,
    };
  }

  // Refresh status
  const newStatus = await checkSystemTools(true);
  return {
    success: result.code === 0,
    message: combined || 'yt-dlp update completed.',
    version: newStatus.ytdlp.version,
  };
}

export function cleanRetentionFiles(): { deletedCount: number; freedBytes: number } {
  if (config.retentionDays <= 0) {
    return { deletedCount: 0, freedBytes: 0 };
  }

  let deletedCount = 0;
  let freedBytes = 0;
  const now = Date.now();
  const maxAgeMs = config.retentionDays * 24 * 60 * 60 * 1000;

  try {
    const files = fs.readdirSync(config.downloadDir);
    for (const file of files) {
      // Don't delete dotfiles or temp part files currently being written
      if (file.startsWith('.') || file.endsWith('.part') || file.endsWith('.ytdl')) {
        continue;
      }

      const filePath = path.join(config.downloadDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile() && now - stats.mtimeMs > maxAgeMs) {
          freedBytes += stats.size;
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch {
        // file might have been removed or locked, ignore
      }
    }
  } catch (err) {
    console.error('Error during file retention cleanup:', err);
  }

  if (deletedCount > 0) {
    console.log(`[Retention Cleanup] Pruned ${deletedCount} file(s) older than ${config.retentionDays} day(s) (~${(freedBytes / (1024 * 1024)).toFixed(2)} MB freed).`);
  }

  return { deletedCount, freedBytes };
}

// Start periodic cleanup (hourly)
setInterval(cleanRetentionFiles, 60 * 60 * 1000).unref();
// Run once on startup
cleanRetentionFiles();

