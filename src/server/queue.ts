import { dbRepository } from './db.js';
import {
  QueueItem,
  QueueState,
  ItemStatus,
  ProgressInfo,
  DownloadFormat,
  VideoQuality,
  AddUrlsResponse,
} from '../shared/types.js';
import { validateYouTubeUrl } from './validator.js';
import {
  executeDownload,
  cancelActiveProcess,
  fetchVideoMetadata,
  fetchPlaylistEntries,
} from './downloader.js';

type StateListener = (state: QueueState) => void;
type ProgressListener = (id: string, status: ItemStatus, progress: ProgressInfo, error?: string | null) => void;
type ItemUpdateListener = (item: QueueItem) => void;

export class QueueManager {
  private activeItemId: string | null = null;
  private isPaused: boolean = false;
  private isProcessing: boolean = false;
  private stateListeners: Set<StateListener> = new Set();
  private progressListeners: Set<ProgressListener> = new Set();
  private itemUpdateListeners: Set<ItemUpdateListener> = new Set();
  private lastProgressSaveTime: Map<string, number> = new Map();

  constructor() {
    // Restore paused state if saved
    const savedPause = dbRepository.getMeta('isPaused');
    this.isPaused = savedPause === 'true';

    // Check if there are any queued items to start processing
    setTimeout(() => {
      this.processNext();
    }, 100);
  }

  public subscribeState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  public subscribeProgress(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  public subscribeItemUpdate(listener: ItemUpdateListener): () => void {
    this.itemUpdateListeners.add(listener);
    return () => this.itemUpdateListeners.delete(listener);
  }

  private broadcastState(): void {
    const state = this.getState();
    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch (err) {
        console.error('Error in state listener:', err);
      }
    }
  }

  private broadcastItemUpdate(item: QueueItem): void {
    for (const listener of this.itemUpdateListeners) {
      try {
        listener(item);
      } catch (err) {
        console.error('Error in item update listener:', err);
      }
    }
    // Also notify state
    this.broadcastState();
  }

  private broadcastProgress(id: string, status: ItemStatus, progress: ProgressInfo, error?: string | null): void {
    for (const listener of this.progressListeners) {
      try {
        listener(id, status, progress, error);
      } catch (err) {
        console.error('Error in progress listener:', err);
      }
    }
  }

  public getState(): QueueState {
    const items = dbRepository.getAllItems();
    return {
      items,
      isPaused: this.isPaused,
      activeItemId: this.activeItemId,
    };
  }

  public getItems(): QueueItem[] {
    return dbRepository.getAllItems();
  }

  public getItem(id: string): QueueItem | null {
    return dbRepository.getItemById(id);
  }

  /**
   * Add one or multiple URLs to the queue
   */
  public async addUrls(
    urls: string[],
    format: DownloadFormat = 'mp4',
    quality: VideoQuality = 'best',
    expandPlaylists: boolean = false
  ): Promise<AddUrlsResponse> {
    const response: AddUrlsResponse = {
      added: [],
      duplicates: [],
      errors: [],
    };

    const urlsToProcess: Array<{ url: string; titleHint?: string }> = [];

    for (const rawUrl of urls) {
      const trimmed = (rawUrl || '').trim();
      if (!trimmed) continue;

      const validation = validateYouTubeUrl(trimmed);
      if (!validation.isValid) {
        response.errors.push({
          url: trimmed,
          error: validation.error || 'Invalid YouTube URL',
        });
        continue;
      }

      // Check if user requested expanding playlist OR if it is a pure playlist URL
      if (validation.isPlaylist && (expandPlaylists || !validation.videoId)) {
        const playlist = await fetchPlaylistEntries(trimmed);
        if (playlist && playlist.entries.length > 0) {
          for (const entry of playlist.entries) {
            urlsToProcess.push({ url: entry.url, titleHint: entry.title });
          }
          continue;
        } else if (!validation.videoId) {
          response.errors.push({
            url: trimmed,
            error: 'Could not fetch any playable videos from this playlist. It may be private or empty.',
          });
          continue;
        }
      }

      urlsToProcess.push({ url: validation.normalizedUrl || trimmed });
    }

    for (const entry of urlsToProcess) {
      const validation = validateYouTubeUrl(entry.url);
      if (!validation.isValid || !validation.videoId) {
        response.errors.push({
          url: entry.url,
          error: validation.error || 'Failed to extract video ID',
        });
        continue;
      }

      const videoId = validation.videoId;

      // Duplicate check: check if already in queue or downloaded
      const existing = dbRepository.findActiveOrDoneByVideoId(videoId);
      if (existing) {
        response.duplicates.push({
          url: entry.url,
          videoId,
          reason: `Already in queue with status: ${existing.status}`,
        });
        continue;
      }

      const id = `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const newItem: QueueItem = {
        id,
        url: validation.normalizedUrl || entry.url,
        videoId,
        format,
        quality,
        title: entry.titleHint || null,
        channel: null,
        duration: null,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        status: 'Queued',
        progress: {
          percent: 0,
          speed: '',
          eta: '',
        },
        filePath: null,
        fileSize: null,
        error: null,
        retryCount: 0,
        addedAt: Date.now(),
        startedAt: null,
        completedAt: null,
      };

      dbRepository.insertItem(newItem);
      response.added.push(newItem);
    }

    if (response.added.length > 0) {
      this.broadcastState();
      this.processNext();
    }

    return response;
  }

  /**
   * Cancel an item
   */
  public cancelItem(id: string): boolean {
    const item = dbRepository.getItemById(id);
    if (!item) return false;

    if (item.status === 'Done' || item.status === 'Cancelled') {
      return false;
    }

    if (this.activeItemId === id) {
      // Kill active process
      cancelActiveProcess(id);
      item.status = 'Cancelled';
      item.error = 'Download cancelled by user.';
      item.completedAt = Date.now();
      dbRepository.updateItem(item);
      this.activeItemId = null;
      this.broadcastItemUpdate(item);
      // Auto-advance
      setImmediate(() => this.processNext());
      return true;
    }

    if (item.status === 'Queued') {
      item.status = 'Cancelled';
      item.error = 'Cancelled before starting.';
      item.completedAt = Date.now();
      dbRepository.updateItem(item);
      this.broadcastItemUpdate(item);
      return true;
    }

    return false;
  }

  /**
   * Remove an item from the queue
   */
  public removeItem(id: string): boolean {
    const item = dbRepository.getItemById(id);
    if (!item) return false;

    if (this.activeItemId === id) {
      cancelActiveProcess(id);
      this.activeItemId = null;
      dbRepository.deleteItem(id);
      this.broadcastState();
      setImmediate(() => this.processNext());
      return true;
    }

    dbRepository.deleteItem(id);
    this.broadcastState();
    return true;
  }

  /**
   * Retry a failed or cancelled item
   */
  public retryItem(id: string): boolean {
    const item = dbRepository.getItemById(id);
    if (!item) return false;

    if (item.status !== 'Failed' && item.status !== 'Cancelled') {
      return false;
    }

    item.status = 'Queued';
    item.error = null;
    item.retryCount = 0;
    item.progress = { percent: 0, speed: '', eta: '' };
    item.startedAt = null;
    item.completedAt = null;
    dbRepository.updateItem(item);

    this.broadcastItemUpdate(item);
    this.processNext();
    return true;
  }

  /**
   * Pause the queue
   */
  public pauseQueue(): void {
    this.isPaused = true;
    dbRepository.setMeta('isPaused', 'true');
    this.broadcastState();
  }

  /**
   * Resume the queue
   */
  public resumeQueue(): void {
    this.isPaused = false;
    dbRepository.setMeta('isPaused', 'false');
    this.broadcastState();
    this.processNext();
  }

  /**
   * Clear all completed items
   */
  public clearCompleted(): void {
    dbRepository.clearCompleted();
    this.broadcastState();
  }

  /**
   * Internal queue processing loop
   * Guarantees strictly 1 concurrent download
   */
  public async processNext(): Promise<void> {
    if (this.isPaused || this.activeItemId !== null || this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const nextItem = dbRepository.getNextQueuedItem();
      if (!nextItem) {
        this.isProcessing = false;
        return;
      }

      this.activeItemId = nextItem.id;
      nextItem.startedAt = Date.now();
      nextItem.status = 'Fetching info';
      dbRepository.updateItem(nextItem);
      this.broadcastItemUpdate(nextItem);

      // 1. Fetch metadata if missing
      if (!nextItem.title || !nextItem.duration) {
        try {
          const meta = await fetchVideoMetadata(nextItem.url);
          if (meta) {
            nextItem.title = meta.title || nextItem.title;
            nextItem.channel = meta.channel || nextItem.channel;
            nextItem.duration = meta.duration || nextItem.duration;
            if (meta.thumbnail) {
              nextItem.thumbnail = meta.thumbnail;
            }
            dbRepository.updateItem(nextItem);
            this.broadcastItemUpdate(nextItem);
          }
        } catch (err) {
          console.warn(`[Queue] Failed to pre-fetch metadata for ${nextItem.url}:`, err);
        }
      }

      // Check if user cancelled while fetching info
      const freshItem = dbRepository.getItemById(nextItem.id);
      if (!freshItem || freshItem.status === 'Cancelled') {
        this.activeItemId = null;
        this.isProcessing = false;
        setImmediate(() => this.processNext());
        return;
      }

      // 2. Start Download
      nextItem.status = 'Downloading';
      dbRepository.updateItem(nextItem);
      this.broadcastItemUpdate(nextItem);

      const downloadResult = await executeDownload(nextItem, {
        onStatusChange: (newStatus) => {
          const curr = dbRepository.getItemById(nextItem.id);
          if (curr && curr.status !== 'Cancelled') {
            curr.status = newStatus;
            dbRepository.updateItem(curr);
            this.broadcastProgress(curr.id, newStatus, curr.progress);
          }
        },
        onProgress: (progress) => {
          // Broadcast progress immediately for smooth UI
          this.broadcastProgress(nextItem.id, 'Downloading', progress);

          // Throttle database writes to every 500ms
          const now = Date.now();
          const lastSave = this.lastProgressSaveTime.get(nextItem.id) || 0;
          if (now - lastSave > 500) {
            this.lastProgressSaveTime.set(nextItem.id, now);
            dbRepository.updateItemProgress(nextItem.id, progress);
          }
        },
      });

      // 3. Handle Download Result
      const itemAfterDownload = dbRepository.getItemById(nextItem.id);
      if (!itemAfterDownload) {
        // Item was removed while downloading
        this.activeItemId = null;
        this.isProcessing = false;
        setImmediate(() => this.processNext());
        return;
      }

      if (itemAfterDownload.status === 'Cancelled') {
        this.activeItemId = null;
        this.isProcessing = false;
        setImmediate(() => this.processNext());
        return;
      }

      if (downloadResult.success) {
        itemAfterDownload.status = 'Done';
        itemAfterDownload.filePath = downloadResult.filePath || null;
        itemAfterDownload.fileSize = downloadResult.fileSize || null;
        itemAfterDownload.completedAt = Date.now();
        itemAfterDownload.error = null;
        itemAfterDownload.progress = {
          percent: 100,
          speed: '',
          eta: '',
          downloadedBytes: downloadResult.fileSize,
          totalBytes: downloadResult.fileSize,
        };
        dbRepository.updateItem(itemAfterDownload);
        this.broadcastItemUpdate(itemAfterDownload);
        this.activeItemId = null;
        this.isProcessing = false;
        // Auto-advance to next item
        setImmediate(() => this.processNext());
        return;
      }

      // Handle Failure
      if (downloadResult.isTransient && itemAfterDownload.retryCount < 2) {
        itemAfterDownload.retryCount += 1;
        itemAfterDownload.status = 'Queued';
        itemAfterDownload.error = `Transient error (${downloadResult.error}). Retry attempt ${itemAfterDownload.retryCount}/2...`;
        dbRepository.updateItem(itemAfterDownload);
        this.broadcastItemUpdate(itemAfterDownload);
        this.activeItemId = null;
        this.isProcessing = false;

        // Exponential backoff before retrying (2s, 4s)
        const delayMs = itemAfterDownload.retryCount * 2000;
        setTimeout(() => {
          this.processNext();
        }, delayMs);
        return;
      }

      // Permanent failure (private, age-restricted, removed, geo-blocked, or retries exhausted)
      // Must NOT block the queue!
      itemAfterDownload.status = 'Failed';
      itemAfterDownload.error = downloadResult.error || 'Unknown download failure';
      itemAfterDownload.completedAt = Date.now();
      dbRepository.updateItem(itemAfterDownload);
      this.broadcastItemUpdate(itemAfterDownload);
      this.activeItemId = null;
      this.isProcessing = false;

      // Auto-advance to next queued item automatically
      setImmediate(() => this.processNext());
    } catch (err: any) {
      console.error('[Queue] Unexpected processing error:', err);
      if (this.activeItemId) {
        const item = dbRepository.getItemById(this.activeItemId);
        if (item) {
          item.status = 'Failed';
          item.error = err?.message || 'Unexpected queue processing error';
          dbRepository.updateItem(item);
          this.broadcastItemUpdate(item);
        }
        this.activeItemId = null;
      }
      this.isProcessing = false;
      // Continue next item
      setImmediate(() => this.processNext());
    }
  }
}

export const queueManager = new QueueManager();

