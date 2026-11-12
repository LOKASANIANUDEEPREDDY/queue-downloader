import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { queueManager } from './queue.js';
import { checkSystemTools, updateYtDlp, installCloudTools } from './system.js';
import { validateYouTubeUrl } from './validator.js';
import { fetchPlaylistEntries } from './downloader.js';
import { DownloadFormat, VideoQuality } from '../shared/types.js';
import { config } from './config.js';

export const apiRouter = Router();

// System status
apiRouter.get('/system/status', async (_req: Request, res: Response) => {
  try {
    const status = await checkSystemTools(true);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to check system status' });
  }
});

// Update yt-dlp
apiRouter.post('/system/update-ytdlp', async (_req: Request, res: Response) => {
  try {
    const result = await updateYtDlp();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Failed to update yt-dlp' });
  }
});

// Auto-install / provision tools for cloud or local environments
apiRouter.post('/system/install-tools', async (_req: Request, res: Response) => {
  try {
    const result = await installCloudTools();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Failed to install tools' });
  }
});

// Save cookies.txt for bot bypass
apiRouter.post('/system/cookies', (req: Request, res: Response) => {
  const { cookies } = req.body;
  if (!cookies || typeof cookies !== 'string' || !cookies.trim()) {
    res.status(400).json({ error: 'Cookies text content is required' });
    return;
  }
  try {
    const cookieDir = path.dirname(config.dbPath);
    if (!fs.existsSync(cookieDir)) {
      fs.mkdirSync(cookieDir, { recursive: true });
    }
    const cookiePath = path.join(cookieDir, 'cookies.txt');
    fs.writeFileSync(cookiePath, cookies.trim(), 'utf-8');
    res.json({ success: true, message: 'cookies.txt saved successfully!' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to save cookies' });
  }
});

// Inspect URL (to detect playlist or check validity)
apiRouter.post('/urls/inspect', async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  const validation = validateYouTubeUrl(url);
  if (!validation.isValid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  if (validation.isPlaylist) {
    const playlist = await fetchPlaylistEntries(url);
    res.json({
      isPlaylist: true,
      videoId: validation.videoId,
      playlistId: validation.playlistId,
      title: playlist?.title || 'YouTube Playlist',
      itemCount: playlist?.entries?.length || 0,
    });
    return;
  }

  res.json({
    isPlaylist: false,
    videoId: validation.videoId,
  });
});

// Get current queue state
apiRouter.get('/queue', (_req: Request, res: Response) => {
  res.json(queueManager.getState());
});

// Add URLs to queue
apiRouter.post('/queue', async (req: Request, res: Response) => {
  const { urls, format = 'mp4', quality = 'best', expandPlaylists = false } = req.body;

  let urlList: string[] = [];
  if (Array.isArray(urls)) {
    urlList = urls;
  } else if (typeof urls === 'string') {
    urlList = urls.split('\n');
  } else {
    res.status(400).json({ error: 'URLs must be a string or an array of strings' });
    return;
  }

  const cleanUrls = urlList.map((u) => u.trim()).filter(Boolean);
  if (cleanUrls.length === 0) {
    res.status(400).json({ error: 'At least one valid URL is required' });
    return;
  }

  try {
    const result = await queueManager.addUrls(
      cleanUrls,
      format as DownloadFormat,
      quality as VideoQuality,
      Boolean(expandPlaylists)
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to add items to queue' });
  }
});

// 1-Click download entire playlist endpoint
apiRouter.post('/queue/playlist', async (req: Request, res: Response) => {
  const { url, format = 'mp4', quality = 'best' } = req.body;
  if (!url || typeof url !== 'string' || !url.trim()) {
    res.status(400).json({ error: 'Playlist URL is required' });
    return;
  }

  try {
    const result = await queueManager.addUrls(
      [url.trim()],
      (format as DownloadFormat) || 'mp4',
      (quality as VideoQuality) || 'best',
      true
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to add playlist to queue' });
  }
});

// Start downloading all queued videos one by one
apiRouter.post('/queue/download-all', (_req: Request, res: Response) => {
  try {
    const result = queueManager.downloadAll();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to start downloading all items' });
  }
});

// Cancel item
apiRouter.post('/queue/:id/cancel', (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const success = queueManager.cancelItem(id);
  res.json({ success });
});

// Retry item
apiRouter.post('/queue/:id/retry', (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const success = queueManager.retryItem(id);
  res.json({ success });
});

// Remove item
apiRouter.delete('/queue/:id', (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const success = queueManager.removeItem(id);
  res.json({ success });
});

// Pause queue
apiRouter.post('/queue/pause', (_req: Request, res: Response) => {
  queueManager.pauseQueue();
  res.json({ success: true, isPaused: true });
});

// Resume queue
apiRouter.post('/queue/resume', (_req: Request, res: Response) => {
  queueManager.resumeQueue();
  res.json({ success: true, isPaused: false });
});

// Clear completed items
apiRouter.post('/queue/clear-completed', (_req: Request, res: Response) => {
  queueManager.clearCompleted();
  res.json({ success: true });
});

// Reveal downloaded file in macOS Finder / system file explorer
apiRouter.post('/downloads/:id/reveal', (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const item = queueManager.getItem(id);

  if (!item || !item.filePath || !fs.existsSync(item.filePath)) {
    res.status(404).json({ error: 'File not found on disk' });
    return;
  }

  try {
    spawn('/usr/bin/open', ['-R', item.filePath], { detached: true });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to open file in Finder' });
  }
});

// Open downloads folder in macOS Finder
apiRouter.post('/downloads/open-folder', (_req: Request, res: Response) => {
  try {
    spawn('/usr/bin/open', [config.downloadDir], { detached: true });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to open downloads folder' });
  }
});

// Download all finished files as a single ZIP archive
apiRouter.get('/downloads/archive.zip', (_req: Request, res: Response) => {
  const completedItems = queueManager.getItems().filter(
    (item) => item.status === 'Done' && item.filePath && fs.existsSync(item.filePath)
  );

  if (completedItems.length === 0) {
    res.status(404).json({ error: 'No completed download files are available to archive.' });
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const zipFilename = `QueueDownloader_${completedItems.length}_Files_${timestamp}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${zipFilename}"`
  );

  // Use system zip with -@ (reads files from stdin) and -j (junk directory paths, flat zip)
  const zipProc = spawn('zip', ['-q', '-j', '-', '-@'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  zipProc.stdout.pipe(res);

  zipProc.on('error', (err) => {
    console.error('Failed to run zip process:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create zip archive: zip utility error' });
    }
  });

  res.on('close', () => {
    if (!zipProc.killed) {
      zipProc.kill('SIGTERM');
    }
  });

  // Feed file paths into stdin, one per line
  for (const item of completedItems) {
    zipProc.stdin.write(`${item.filePath}\n`);
  }
  zipProc.stdin.end();
});

// Alias for convenience
apiRouter.get('/downloads/zip', (_req: Request, res: Response) => {
  res.redirect('/api/downloads/archive.zip');
});

// Serve finished file for browser download
apiRouter.get('/downloads/:id/file', (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const item = queueManager.getItem(id);

  if (!item) {
    res.status(404).json({ error: 'Download item not found' });
    return;
  }

  if (item.status !== 'Done' || !item.filePath || !fs.existsSync(item.filePath)) {
    res.status(404).json({ error: 'File is not yet available or has been removed from disk.' });
    return;
  }

  const filename = path.basename(item.filePath);
  // RFC 6266: ASCII fallback for filename, UTF-8 percent-encoded for filename*
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
  const encodedFilename = encodeURIComponent(filename);

  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiFallback || 'download'}"; filename*=UTF-8''${encodedFilename}`
  );
  
  if (filename.endsWith('.mp3')) {
    res.setHeader('Content-Type', 'audio/mpeg');
  } else if (filename.endsWith('.mp4')) {
    res.setHeader('Content-Type', 'video/mp4');
  } else if (filename.endsWith('.mkv')) {
    res.setHeader('Content-Type', 'video/x-matroska');
  } else if (filename.endsWith('.webm')) {
    res.setHeader('Content-Type', 'video/webm');
  } else {
    res.setHeader('Content-Type', 'application/octet-stream');
  }

  const fileStream = fs.createReadStream(item.filePath);
  fileStream.pipe(res);
});

// Server-Sent Events (SSE) for real-time progress and queue changes
apiRouter.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Helper to send formatted SSE messages
  const sendEvent = (eventType: string, data: any) => {
    try {
      res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      // client disconnected
    }
  };

  // Send initial full state immediately
  sendEvent('QUEUE_STATE', queueManager.getState());

  // Subscribe to changes
  const unsubscribeState = queueManager.subscribeState((state) => {
    sendEvent('QUEUE_STATE', state);
  });

  const unsubscribeProgress = queueManager.subscribeProgress((id, status, progress, error) => {
    sendEvent('ITEM_PROGRESS', { id, status, progress, error });
  });

  const unsubscribeItemUpdate = queueManager.subscribeItemUpdate((item) => {
    sendEvent('ITEM_UPDATED', { item });
  });

  // Heartbeat ping every 15 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {}
  }, 15000);

  // Cleanup on close
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribeState();
    unsubscribeProgress();
    unsubscribeItemUpdate();
    res.end();
  });
});
