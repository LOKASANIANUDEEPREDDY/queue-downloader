import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { QueueItem, ItemStatus, DownloadFormat, VideoQuality } from '../shared/types.js';

let dbInstance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(config.dbPath);
    initDatabase(dbInstance);
  }
  return dbInstance;
}

function initDatabase(db: DatabaseSync): void {
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS queue_items (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      videoId TEXT NOT NULL,
      format TEXT NOT NULL,
      quality TEXT NOT NULL,
      title TEXT,
      channel TEXT,
      duration INTEGER,
      thumbnail TEXT,
      status TEXT NOT NULL,
      percent REAL NOT NULL DEFAULT 0,
      speed TEXT NOT NULL DEFAULT '',
      eta TEXT NOT NULL DEFAULT '',
      downloadedBytes INTEGER DEFAULT 0,
      totalBytes INTEGER DEFAULT 0,
      filePath TEXT,
      fileSize INTEGER,
      error TEXT,
      retryCount INTEGER NOT NULL DEFAULT 0,
      addedAt INTEGER NOT NULL,
      startedAt INTEGER,
      completedAt INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_queue_status ON queue_items(status);
    CREATE INDEX IF NOT EXISTS idx_queue_addedAt ON queue_items(addedAt);
    CREATE INDEX IF NOT EXISTS idx_queue_videoId ON queue_items(videoId);

    CREATE TABLE IF NOT EXISTS queue_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Recover state on startup:
  // Any item that was mid-download goes back to Queued
  const activeStatuses: ItemStatus[] = ['Fetching info', 'Downloading', 'Converting'];
  const placeholders = activeStatuses.map(() => '?').join(',');
  const resetStmt = db.prepare(`
    UPDATE queue_items
    SET status = 'Queued',
        percent = 0,
        speed = '',
        eta = '',
        downloadedBytes = 0,
        totalBytes = 0,
        startedAt = NULL
    WHERE status IN (${placeholders})
  `);
  resetStmt.run(...activeStatuses);
}

// Map SQLite row to QueueItem
interface DbRow {
  id: string;
  url: string;
  videoId: string;
  format: string;
  quality: string;
  title: string | null;
  channel: string | null;
  duration: number | null;
  thumbnail: string | null;
  status: string;
  percent: number;
  speed: string;
  eta: string;
  downloadedBytes: number | null;
  totalBytes: number | null;
  filePath: string | null;
  fileSize: number | null;
  error: string | null;
  retryCount: number;
  addedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

function rowToItem(row: DbRow): QueueItem {
  return {
    id: row.id,
    url: row.url,
    videoId: row.videoId,
    format: row.format as DownloadFormat,
    quality: row.quality as VideoQuality,
    title: row.title,
    channel: row.channel,
    duration: row.duration,
    thumbnail: row.thumbnail,
    status: row.status as ItemStatus,
    progress: {
      percent: row.percent || 0,
      speed: row.speed || '',
      eta: row.eta || '',
      downloadedBytes: row.downloadedBytes ?? undefined,
      totalBytes: row.totalBytes ?? undefined,
    },
    filePath: row.filePath,
    fileSize: row.fileSize,
    error: row.error,
    retryCount: row.retryCount,
    addedAt: row.addedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

export const dbRepository = {
  getAllItems(): QueueItem[] {
    const db = getDatabase();
    const rows = db.prepare(`SELECT * FROM queue_items ORDER BY addedAt ASC`).all() as unknown as DbRow[];
    return rows.map(rowToItem);
  },

  getItemById(id: string): QueueItem | null {
    const db = getDatabase();
    const row = db.prepare(`SELECT * FROM queue_items WHERE id = ?`).get(id) as unknown as DbRow | undefined;
    return row ? rowToItem(row) : null;
  },

  findActiveOrDoneByVideoId(videoId: string): QueueItem | null {
    const db = getDatabase();
    // Exclude cancelled and failed so user can re-add them if they choose
    const row = db.prepare(`
      SELECT * FROM queue_items
      WHERE videoId = ? AND status IN ('Queued', 'Fetching info', 'Downloading', 'Converting', 'Done')
      ORDER BY addedAt DESC
      LIMIT 1
    `).get(videoId) as unknown as DbRow | undefined;
    return row ? rowToItem(row) : null;
  },

  insertItem(item: QueueItem): void {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO queue_items (
        id, url, videoId, format, quality, title, channel, duration,
        thumbnail, status, percent, speed, eta, downloadedBytes, totalBytes,
        filePath, fileSize, error, retryCount, addedAt, startedAt, completedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.id,
      item.url,
      item.videoId,
      item.format,
      item.quality,
      item.title,
      item.channel,
      item.duration,
      item.thumbnail,
      item.status,
      item.progress.percent,
      item.progress.speed,
      item.progress.eta,
      item.progress.downloadedBytes ?? 0,
      item.progress.totalBytes ?? 0,
      item.filePath,
      item.fileSize,
      item.error,
      item.retryCount,
      item.addedAt,
      item.startedAt,
      item.completedAt
    );
  },

  updateItem(item: QueueItem): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE queue_items
      SET status = ?,
          title = ?,
          channel = ?,
          duration = ?,
          thumbnail = ?,
          percent = ?,
          speed = ?,
          eta = ?,
          downloadedBytes = ?,
          totalBytes = ?,
          filePath = ?,
          fileSize = ?,
          error = ?,
          retryCount = ?,
          startedAt = ?,
          completedAt = ?
      WHERE id = ?
    `).run(
      item.status,
      item.title,
      item.channel,
      item.duration,
      item.thumbnail,
      item.progress.percent,
      item.progress.speed,
      item.progress.eta,
      item.progress.downloadedBytes ?? 0,
      item.progress.totalBytes ?? 0,
      item.filePath,
      item.fileSize,
      item.error,
      item.retryCount,
      item.startedAt,
      item.completedAt,
      item.id
    );
  },

  updateItemProgress(id: string, progress: { percent: number; speed: string; eta: string; downloadedBytes?: number; totalBytes?: number }): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE queue_items
      SET percent = ?,
          speed = ?,
          eta = ?,
          downloadedBytes = ?,
          totalBytes = ?
      WHERE id = ?
    `).run(
      progress.percent,
      progress.speed,
      progress.eta,
      progress.downloadedBytes ?? 0,
      progress.totalBytes ?? 0,
      id
    );
  },

  deleteItem(id: string): void {
    const db = getDatabase();
    db.prepare(`DELETE FROM queue_items WHERE id = ?`).run(id);
  },

  clearCompleted(): void {
    const db = getDatabase();
    db.prepare(`DELETE FROM queue_items WHERE status = 'Done'`).run();
  },

  getNextQueuedItem(): QueueItem | null {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM queue_items
      WHERE status = 'Queued'
      ORDER BY addedAt ASC
      LIMIT 1
    `).get() as unknown as DbRow | undefined;
    return row ? rowToItem(row) : null;
  },

  getMeta(key: string): string | null {
    const db = getDatabase();
    const row = db.prepare(`SELECT value FROM queue_meta WHERE key = ?`).get(key) as unknown as { value: string } | undefined;
    return row ? row.value : null;
  },

  setMeta(key: string, value: string): void {
    const db = getDatabase();
    db.prepare(`INSERT OR REPLACE INTO queue_meta (key, value) VALUES (?, ?)`).run(key, value);
  },
};

