import { describe, it, expect } from 'vitest';
import { validateYouTubeUrl } from '../src/server/validator.js';

describe('validateYouTubeUrl', () => {
  it('accepts standard youtube.com watch URLs', () => {
    const res = validateYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('dQw4w9WgXcQ');
    expect(res.isPlaylist).toBe(false);
  });

  it('accepts youtube.com watch URLs without www', () => {
    const res = validateYouTubeUrl('https://youtube.com/watch?v=dQw4w9WgXcQ');
    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('dQw4w9WgXcQ');
  });

  it('accepts mobile m.youtube.com URLs', () => {
    const res = validateYouTubeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('dQw4w9WgXcQ');
  });

  it('accepts youtu.be short URLs', () => {
    const res = validateYouTubeUrl('https://youtu.be/dQw4w9WgXcQ');
    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('dQw4w9WgXcQ');
    expect(res.isPlaylist).toBe(false);
  });

  it('accepts music.youtube.com URLs', () => {
    const res = validateYouTubeUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('dQw4w9WgXcQ');
  });

  it('accepts YouTube shorts URLs', () => {
    const res = validateYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ');
    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('dQw4w9WgXcQ');
  });

  it('accepts YouTube embed URLs', () => {
    const res = validateYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('dQw4w9WgXcQ');
  });

  it('identifies playlist URLs', () => {
    const res = validateYouTubeUrl('https://www.youtube.com/playlist?list=PL1234567890ABCDEF');
    expect(res.isValid).toBe(true);
    expect(res.isPlaylist).toBe(true);
    expect(res.playlistId).toBe('PL1234567890ABCDEF');
  });

  it('identifies watch URLs that also contain a playlist parameter', () => {
    const res = validateYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890ABCDEF');
    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('dQw4w9WgXcQ');
    expect(res.isPlaylist).toBe(true);
    expect(res.playlistId).toBe('PL1234567890ABCDEF');
  });

  it('rejects other video streaming hosts (e.g. Vimeo, Dailymotion, TikTok)', () => {
    const vimeo = validateYouTubeUrl('https://vimeo.com/12345678');
    expect(vimeo.isValid).toBe(false);
    expect(vimeo.error).toContain('Only youtube.com, youtu.be, and music.youtube.com');

    const tiktok = validateYouTubeUrl('https://www.tiktok.com/@user/video/12345');
    expect(tiktok.isValid).toBe(false);
  });

  it('rejects spoofed subdomains and host attacks', () => {
    const spoof1 = validateYouTubeUrl('https://youtube.com.attacker.com/watch?v=dQw4w9WgXcQ');
    expect(spoof1.isValid).toBe(false);

    const spoof2 = validateYouTubeUrl('https://attacker.com/?youtube.com/watch?v=dQw4w9WgXcQ');
    expect(spoof2.isValid).toBe(false);
  });

  it('rejects invalid protocols like javascript: or ftp:', () => {
    const js = validateYouTubeUrl('javascript:alert(1)');
    expect(js.isValid).toBe(false);

    const ftp = validateYouTubeUrl('ftp://youtube.com/watch?v=dQw4w9WgXcQ');
    expect(ftp.isValid).toBe(false);
  });

  it('rejects malformed or empty URLs', () => {
    expect(validateYouTubeUrl('').isValid).toBe(false);
    expect(validateYouTubeUrl('not a url').isValid).toBe(false);
  });
});

