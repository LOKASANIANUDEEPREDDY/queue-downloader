import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Point test DB to a temporary SQLite db
const testDbPath = path.resolve(process.cwd(), './data/test_queue.db');
process.env.DB_PATH = testDbPath;

// Mock downloader functions
vi.mock('../src/server/downloader.js', () => {
  return {
    fetchVideoMetadata: vi.fn().mockResolvedValue({
      id: 'mock_vid',
      title: 'Mock Video Title',
      channel: 'Mock Channel',
      duration: 120,
      thumbnail: 'https://example.com/thumb.jpg',
    }),
    fetchPlaylistEntries: vi.fn().mockResolvedValue({
      title: 'Mock Playlist',
      entries: [
        { id: 'vid1', url: 'https://www.youtube.com/watch?v=vid11111111', title: 'Video 1' },
        { id: 'vid2', url: 'https://www.youtube.com/watch?v=vid22222222', title: 'Video 2' },
      ],
    }),
    cancelActiveProcess: vi.fn().mockReturnValue(true),
    executeDownload: vi.fn(),
  };
});

// Import modules after mock
const { dbRepository, getDatabase } = await import('../src/server/db.js');
const { QueueManager } = await import('../src/server/queue.js');
const { executeDownload, cancelActiveProcess } = await import('../src/server/downloader.js');

describe('QueueManager State Machine', () => {
  let queue: InstanceType<typeof QueueManager>;

  beforeEach(() => {
    // Clear test database table
    try {
      const db = getDatabase();
      db.exec('DELETE FROM queue_items');
      db.exec('DELETE FROM queue_meta');
    } catch {}

    vi.clearAllMocks();
    queue = new QueueManager();
    queue.pauseQueue(); // Start paused so we control the step-by-step ticks in tests
  });

  it('enqueues items in the exact order they are added', async () => {
    const urls = [
      'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      'https://www.youtube.com/watch?v=bbbbbbbbbbb',
      'https://www.youtube.com/watch?v=ccccccccccc',
    ];

    const result = await queue.addUrls(urls, 'mp4', '1080p');
    expect(result.added.length).toBe(3);
    expect(result.added[0].videoId).toBe('aaaaaaaaaaa');
    expect(result.added[1].videoId).toBe('bbbbbbbbbbb');
    expect(result.added[2].videoId).toBe('ccccccccccc');

    const items = queue.getItems();
    expect(items.map((i) => i.videoId)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']);
  });

  it('detects and skips duplicate videos already in queue', async () => {
    await queue.addUrls(['https://www.youtube.com/watch?v=dup11111111'], 'mp4', '720p');

    // Attempt to add same URL again
    const dupRes = await queue.addUrls(['https://www.youtube.com/watch?v=dup11111111'], 'mp4', '720p');
    expect(dupRes.added.length).toBe(0);
    expect(dupRes.duplicates.length).toBe(1);
    expect(dupRes.duplicates[0].videoId).toBe('dup11111111');
  });

  it('auto-advances to the next item when a download succeeds', async () => {
    // Mock successful download
    vi.mocked(executeDownload).mockImplementation(async (item, callbacks) => {
      callbacks.onStatusChange('Downloading');
      callbacks.onProgress({ percent: 50, speed: '5MiB/s', eta: '00:02' });
      callbacks.onStatusChange('Converting');
      return {
        success: true,
        filePath: `/downloads/test_${item.videoId}.mp4`,
        fileSize: 1048576,
      };
    });

    await queue.addUrls([
      'https://www.youtube.com/watch?v=succ1111111',
      'https://www.youtube.com/watch?v=succ2222222',
    ]);

    // Resume queue to start processing
    queue.resumeQueue();

    // Wait for the async process to run
    await new Promise((resolve) => setTimeout(resolve, 400));

    const items = queue.getItems();
    const item1 = items.find((i) => i.videoId === 'succ1111111');
    const item2 = items.find((i) => i.videoId === 'succ2222222');

    expect(item1?.status).toBe('Done');
    expect(item1?.filePath).toBe('/downloads/test_succ1111111.mp4');
    expect(item2?.status).toBe('Done');
    expect(item2?.filePath).toBe('/downloads/test_succ2222222.mp4');
  });

  it('auto-advances to the next item when a download fails (does NOT block the queue)', async () => {
    let callCount = 0;
    vi.mocked(executeDownload).mockImplementation(async (item) => {
      callCount++;
      if (item.videoId === 'fail1111111') {
        return {
          success: false,
          error: 'Video is private and cannot be downloaded.',
          isTransient: false,
        };
      }
      return {
        success: true,
        filePath: `/downloads/${item.videoId}.mp4`,
        fileSize: 2048,
      };
    });

    await queue.addUrls([
      'https://www.youtube.com/watch?v=fail1111111',
      'https://www.youtube.com/watch?v=next1111111',
    ]);

    queue.resumeQueue();

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 400));

    const items = queue.getItems();
    const failedItem = items.find((i) => i.videoId === 'fail1111111');
    const nextItem = items.find((i) => i.videoId === 'next1111111');

    // Failed item shows readable error
    expect(failedItem?.status).toBe('Failed');
    expect(failedItem?.error).toContain('private');

    // Next item was not blocked and succeeded
    expect(nextItem?.status).toBe('Done');
  });

  it('pauses and resumes queue properly', async () => {
    vi.mocked(executeDownload).mockImplementation(async (item) => {
      return {
        success: true,
        filePath: `/downloads/${item.videoId}.mp4`,
      };
    });

    await queue.addUrls([
      'https://www.youtube.com/watch?v=pause111111',
      'https://www.youtube.com/watch?v=pause222222',
    ]);

    // It was paused initially
    expect(queue.getState().isPaused).toBe(true);

    // Items should still be Queued
    const initialItems = queue.getItems();
    expect(initialItems.every((i) => i.status === 'Queued')).toBe(true);

    // Resume queue
    queue.resumeQueue();
    expect(queue.getState().isPaused).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 300));

    const doneItems = queue.getItems();
    expect(doneItems.every((i) => i.status === 'Done')).toBe(true);
  });

  it('cancels an item currently running and advances to next queued item', async () => {
    let cancelTriggered = false;

    vi.mocked(executeDownload).mockImplementation((item) => {
      return new Promise((resolve) => {
        if (item.videoId === 'cancel11111') {
          // Simulate hanging download until cancelled
          const checkTimer = setInterval(() => {
            if (cancelTriggered) {
              clearInterval(checkTimer);
              resolve({
                success: false,
                error: 'Download cancelled by user.',
              });
            }
          }, 50);
        } else {
          resolve({
            success: true,
            filePath: `/downloads/${item.videoId}.mp4`,
          });
        }
      });
    });

    const addRes = await queue.addUrls([
      'https://www.youtube.com/watch?v=cancel11111',
      'https://www.youtube.com/watch?v=after111111',
    ]);

    const itemToCancel = addRes.added[0];
    queue.resumeQueue();

    // Let it start downloading item 1
    await new Promise((resolve) => setTimeout(resolve, 150));

    cancelTriggered = true;
    const cancelled = queue.cancelItem(itemToCancel.id);
    expect(cancelled).toBe(true);
    expect(vi.mocked(cancelActiveProcess)).toHaveBeenCalledWith(itemToCancel.id);

    // Wait for next item to finish
    await new Promise((resolve) => setTimeout(resolve, 300));

    const items = queue.getItems();
    const item1 = items.find((i) => i.videoId === 'cancel11111');
    const item2 = items.find((i) => i.videoId === 'after111111');

    expect(item1?.status).toBe('Cancelled');
    expect(item2?.status).toBe('Done');
  });

  it('allows retrying a failed or cancelled item', async () => {
    vi.mocked(executeDownload).mockResolvedValueOnce({
      success: false,
      error: 'Simulated failure',
      isTransient: false,
    }).mockResolvedValueOnce({
      success: true,
      filePath: '/downloads/retry.mp4',
    });

    const addRes = await queue.addUrls(['https://www.youtube.com/watch?v=retry111111']);
    const itemId = addRes.added[0].id;

    queue.resumeQueue();
    await new Promise((resolve) => setTimeout(resolve, 200));

    let item = queue.getItem(itemId);
    expect(item?.status).toBe('Failed');

    // Retry item
    const retried = queue.retryItem(itemId);
    expect(retried).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 200));

    item = queue.getItem(itemId);
    expect(item?.status).toBe('Done');
  });
});

