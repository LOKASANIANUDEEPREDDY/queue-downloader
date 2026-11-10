import { app } from './app.js';
import { config } from './config.js';
import { checkSystemTools } from './system.js';

// Start server
const server = app.listen(config.port, config.host, async () => {
  console.log(`\n==================================================`);
  console.log(`⚡ Queue Downloader Server running on http://${config.host}:${config.port}`);
  console.log(`📁 Download directory: ${config.downloadDir}`);
  console.log(`🗄️ Database: ${config.dbPath}`);
  console.log(`⏱️ Retention: ${config.retentionDays > 0 ? `${config.retentionDays} days` : 'Disabled'}`);
  console.log(`==================================================\n`);

  // Run startup tools check
  try {
    const status = await checkSystemTools(true);
    if (!status.ytdlp.installed) {
      console.warn(`⚠️  WARNING: yt-dlp was not found in PATH!`);
      console.warn(`   Please install it: brew install yt-dlp (macOS) or python3 -m pip install -U yt-dlp`);
    } else {
      console.log(`✅ yt-dlp detected: version ${status.ytdlp.version}`);
    }

    if (!status.ffmpeg.installed) {
      console.warn(`⚠️  WARNING: ffmpeg was not found in PATH!`);
      console.warn(`   Audio extraction & stream merging will not work without ffmpeg.`);
      console.warn(`   Install it: brew install ffmpeg`);
    } else {
      console.log(`✅ ffmpeg detected: ${status.ffmpeg.version}`);
    }
  } catch (err) {
    console.error('Failed to run initial system check:', err);
  }
});

// Graceful shutdown
function shutdown() {
  console.log('\nShutting down server gracefully...');
  server.close(() => {
    console.log('Server closed. Goodbye!');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
