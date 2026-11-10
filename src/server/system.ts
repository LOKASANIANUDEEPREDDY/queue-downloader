import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { config } from './config.js';
import { SystemStatus } from '../shared/types.js';

let cachedStatus: SystemStatus | null = null;

// Ensure temporary bin directory for cloud/serverless environments
const binDir = path.resolve(process.env.TEMP || '/tmp', 'bin');
try {
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }
} catch {}

// Ensure PATH contains all standard binary directories + /tmp/bin
if (!process.env.PATH?.includes(binDir)) {
  process.env.PATH = `${binDir}:${process.env.PATH || ''}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin`;
}

function downloadBinary(url: string, destPath: string, maxRedirects = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error('Too many redirects while downloading binary'));
      return;
    }

    const client = url.startsWith('https:') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'QueueDownloader-SystemInstaller' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadBinary(res.headers.location, destPath, maxRedirects - 1));
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download binary: HTTP ${res.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve());
      });
      file.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

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

/**
 * Checks for bundled or static ffmpeg and links it into binDir if missing
 */
async function tryEnsureBundledFfmpeg(): Promise<boolean> {
  try {
    const ffmpegPkg = await import('@ffmpeg-installer/ffmpeg');
    const installerPath = ffmpegPkg?.default?.path;
    if (installerPath && fs.existsSync(installerPath)) {
      const target = path.join(binDir, 'ffmpeg');
      if (!fs.existsSync(target)) {
        try {
          fs.symlinkSync(installerPath, target);
        } catch {
          fs.copyFileSync(installerPath, target);
        }
        try {
          fs.chmodSync(target, 0o755);
        } catch {}
      }
      return true;
    }
  } catch {}
  return false;
}

export async function checkSystemTools(forceRefresh = false): Promise<SystemStatus> {
  if (cachedStatus && !forceRefresh) {
    return cachedStatus;
  }

  // Attempt to link bundled ffmpeg if system ffmpeg is not in PATH
  await tryEnsureBundledFfmpeg();

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

/**
 * Automatically provisions yt-dlp and ffmpeg binaries for cloud/serverless environments
 */
export async function installCloudTools(): Promise<{ success: boolean; message: string }> {
  const messages: string[] = [];

  // 1. Install or update yt-dlp standalone executable
  const ytdlpPath = path.join(binDir, 'yt-dlp');
  try {
    let url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
    if (process.platform === 'linux') {
      if (process.arch === 'arm64') {
        url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64';
      } else {
        url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
      }
    }
    
    await downloadBinary(url, ytdlpPath);
    fs.chmodSync(ytdlpPath, 0o755);
    messages.push(`yt-dlp binary (${process.platform}-${process.arch}) installed.`);
  } catch (err: any) {
    messages.push(`yt-dlp auto-install note: ${err?.message || 'Download failed'}`);
  }

  // 2. Ensure ffmpeg
  const ffmpegLinked = await tryEnsureBundledFfmpeg();
  if (ffmpegLinked) {
    messages.push('ffmpeg configured successfully.');
  } else {
    messages.push('ffmpeg check: please ensure ffmpeg is available in system PATH.');
  }

  // Refresh status
  const status = await checkSystemTools(true);
  const success = status.ytdlp.installed;

  return {
    success,
    message: messages.join(' ') || (success ? 'Tools are ready.' : 'Failed to provision tools.'),
  };
}

export async function updateYtDlp(): Promise<{ success: boolean; message: string; version?: string }> {
  // First test if yt-dlp is installed
  const check = await checkSystemTools(true);
  if (!check.ytdlp.installed) {
    // If not installed, run auto-install
    const installResult = await installCloudTools();
    const newStatus = await checkSystemTools(true);
    return {
      success: installResult.success,
      message: installResult.message,
      version: newStatus.ytdlp.version,
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

