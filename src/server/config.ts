import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const ROOT_DIR = process.cwd();
const isVercel = Boolean(process.env.VERCEL);

const defaultDownloadDir = isVercel ? '/tmp/downloads' : './downloads';
const defaultDbPath = isVercel ? '/tmp/queue.db' : './data/queue.db';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || (isVercel ? '0.0.0.0' : '127.0.0.1'),
  downloadDir: path.resolve(ROOT_DIR, process.env.DOWNLOAD_DIR || defaultDownloadDir),
  dbPath: path.resolve(ROOT_DIR, process.env.DB_PATH || defaultDbPath),
  retentionDays: parseInt(process.env.RETENTION_DAYS || '7', 10),
  isDev: process.env.NODE_ENV !== 'production',
  isVercel,
};

// Ensure directories exist safely
try {
  if (!fs.existsSync(config.downloadDir)) {
    fs.mkdirSync(config.downloadDir, { recursive: true });
  }
} catch {
  // Read-only filesystem fallback
}

try {
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
} catch {
  // Read-only filesystem fallback
}
