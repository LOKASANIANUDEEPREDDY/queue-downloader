import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const ROOT_DIR = process.cwd();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '127.0.0.1',
  downloadDir: path.resolve(ROOT_DIR, process.env.DOWNLOAD_DIR || './downloads'),
  dbPath: path.resolve(ROOT_DIR, process.env.DB_PATH || './data/queue.db'),
  retentionDays: parseInt(process.env.RETENTION_DAYS || '7', 10),
  isDev: process.env.NODE_ENV !== 'production',
};

// Ensure directories exist
if (!fs.existsSync(config.downloadDir)) {
  fs.mkdirSync(config.downloadDir, { recursive: true });
}

const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

