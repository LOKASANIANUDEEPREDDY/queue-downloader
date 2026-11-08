export type ItemStatus =
  | 'Queued'
  | 'Fetching info'
  | 'Downloading'
  | 'Converting'
  | 'Done'
  | 'Failed'
  | 'Cancelled';

export type DownloadFormat = 'mp4' | 'mp3';

export type VideoQuality = 'best' | '1080p' | '720p' | '480p' | '360p';

export interface ProgressInfo {
  percent: number; // 0 to 100
  speed: string;   // e.g. "4.2MiB/s"
  eta: string;     // e.g. "00:32"
  downloadedBytes?: number;
  totalBytes?: number;
}

export interface QueueItem {
  id: string;
  url: string;
  videoId: string;
  format: DownloadFormat;
  quality: VideoQuality;
  title: string | null;
  channel: string | null;
  duration: number | null; // in seconds
  thumbnail: string | null;
  status: ItemStatus;
  progress: ProgressInfo;
  filePath: string | null;
  fileSize: number | null;
  error: string | null;
  retryCount: number;
  addedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface QueueState {
  items: QueueItem[];
  isPaused: boolean;
  activeItemId: string | null;
}

export interface SystemStatus {
  ytdlp: {
    installed: boolean;
    version?: string;
    path?: string;
    error?: string;
  };
  ffmpeg: {
    installed: boolean;
    version?: string;
    path?: string;
    error?: string;
  };
  storage: {
    downloadDir: string;
    retentionDays: number;
  };
}

export interface AddUrlsRequest {
  urls: string[];
  format: DownloadFormat;
  quality: VideoQuality;
}

export interface AddUrlsResponse {
  added: QueueItem[];
  duplicates: { url: string; videoId?: string; reason: string }[];
  errors: { url: string; error: string }[];
}

export interface InspectUrlResponse {
  isPlaylist: boolean;
  videoId?: string;
  playlistId?: string;
  title?: string;
  itemCount?: number;
}

