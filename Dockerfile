# Multi-stage Docker build for Queue Downloader
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build client + server
COPY . .
RUN npm run build

# Production runner stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DOWNLOAD_DIR=/app/downloads
ENV DB_PATH=/app/data/queue.db
ENV RETENTION_DAYS=7

# Install runtime dependencies: ffmpeg, python3, yt-dlp
RUN apk add --no-cache ffmpeg python3 py3-pip \
    && wget -q https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Copy production dependencies and built files
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

# Create data and downloads directories
RUN mkdir -p /app/downloads /app/data

VOLUME ["/app/downloads", "/app/data"]

EXPOSE 3000

CMD ["node", "dist-server/server/index.js"]

