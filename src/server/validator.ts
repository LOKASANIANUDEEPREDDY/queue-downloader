export interface ValidationResult {
  isValid: boolean;
  normalizedUrl?: string;
  videoId?: string;
  playlistId?: string;
  isPlaylist: boolean;
  error?: string;
}

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export function validateYouTubeUrl(inputUrl: string): ValidationResult {
  if (!inputUrl || typeof inputUrl !== 'string') {
    return {
      isValid: false,
      isPlaylist: false,
      error: 'URL is required and must be a non-empty string.',
    };
  }

  const trimmed = inputUrl.trim();
  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      isPlaylist: false,
      error: 'Malformed URL provided.',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      isValid: false,
      isPlaylist: false,
      error: 'Invalid protocol. Only HTTP and HTTPS URLs are accepted.',
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(hostname)) {
    return {
      isValid: false,
      isPlaylist: false,
      error: `Invalid host '${hostname}'. Only youtube.com, youtu.be, and music.youtube.com are accepted.`,
    };
  }

  let videoId: string | undefined;
  let playlistId: string | undefined;

  // Check playlist parameter
  const listParam = parsed.searchParams.get('list');
  if (listParam && listParam.trim().length > 0) {
    playlistId = listParam.trim();
  }

  // Extract Video ID
  if (hostname === 'youtu.be' || hostname === 'www.youtu.be') {
    // Format: https://youtu.be/VIDEO_ID
    const pathPart = parsed.pathname.replace(/^\/+/, '').split('/')[0];
    if (pathPart && VIDEO_ID_REGEX.test(pathPart)) {
      videoId = pathPart;
    }
  } else {
    // youtube.com or music.youtube.com
    if (parsed.pathname === '/watch') {
      const v = parsed.searchParams.get('v');
      if (v && VIDEO_ID_REGEX.test(v)) {
        videoId = v;
      }
    } else if (parsed.pathname.startsWith('/shorts/')) {
      const parts = parsed.pathname.split('/');
      const id = parts[2];
      if (id && VIDEO_ID_REGEX.test(id)) {
        videoId = id;
      }
    } else if (parsed.pathname.startsWith('/embed/')) {
      const parts = parsed.pathname.split('/');
      const id = parts[2];
      if (id && VIDEO_ID_REGEX.test(id)) {
        videoId = id;
      }
    } else if (parsed.pathname.startsWith('/live/')) {
      const parts = parsed.pathname.split('/');
      const id = parts[2];
      if (id && VIDEO_ID_REGEX.test(id)) {
        videoId = id;
      }
    }
  }

  const isPlaylist = Boolean(playlistId && (parsed.pathname === '/playlist' || !videoId || playlistId.startsWith('PL')));

  if (!videoId && !playlistId) {
    return {
      isValid: false,
      isPlaylist: false,
      error: 'Could not extract a valid YouTube video ID or playlist ID from the URL.',
    };
  }

  // Normalized clean URL for video
  let normalizedUrl = trimmed;
  if (videoId) {
    normalizedUrl = `https://www.youtube.com/watch?v=${videoId}`;
  } else if (playlistId) {
    normalizedUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
  }

  return {
    isValid: true,
    normalizedUrl,
    videoId,
    playlistId,
    isPlaylist: Boolean(playlistId),
  };
}

