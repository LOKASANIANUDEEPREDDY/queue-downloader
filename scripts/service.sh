#!/bin/bash
set -e

PLIST_NAME="com.queuedownloader.app"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
PROJECT_DIR="/Users/anudeep/ytr"
NODE_PATH="$(which node || echo '/opt/homebrew/bin/node')"
LOG_DIR="${PROJECT_DIR}/logs"

mkdir -p "$LOG_DIR"
mkdir -p "$HOME/Library/LaunchAgents"

generate_plist() {
  cat <<EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_PATH}</string>
        <string>${PROJECT_DIR}/dist-server/server/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${PROJECT_DIR}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>PORT</key>
        <string>3000</string>
        <key>HOST</key>
        <string>127.0.0.1</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/service.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/service.err.log</string>
</dict>
</plist>
EOF
}

case "$1" in
  start|deploy)
    echo "📦 Building latest production bundle..."
    cd "$PROJECT_DIR"
    npm run build

    echo "⚙️  Generating LaunchAgent plist..."
    generate_plist

    echo "🛑 Unloading any previous instance..."
    launchctl unload "$PLIST_PATH" 2>/dev/null || true

    echo "🚀 Starting Queue Downloader background service..."
    launchctl load "$PLIST_PATH"

    sleep 1.5
    if curl -s http://127.0.0.1:3000/api/system/status >/dev/null 2>&1; then
      echo "✅ Successfully deployed! Running at http://127.0.0.1:3000"
    else
      echo "⚠️  Service started. Checking logs..."
      tail -n 10 "${LOG_DIR}/service.log" 2>/dev/null || true
    fi
    ;;

  stop)
    echo "🛑 Stopping Queue Downloader background service..."
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    echo "Stopped."
    ;;

  restart)
    $0 stop
    sleep 1
    $0 start
    ;;

  status)
    if launchctl list | grep -q "$PLIST_NAME"; then
      echo "🟢 Service is registered in launchd."
      if curl -s http://127.0.0.1:3000/api/system/status >/dev/null 2>&1; then
        echo "🟢 App is healthy and responding on http://127.0.0.1:3000"
      else
        echo "🟡 Service registered, but not responding on port 3000 yet."
      fi
    else
      echo "🔴 Service is not currently running."
    fi
    ;;

  logs)
    tail -f "${LOG_DIR}/service.log" "${LOG_DIR}/service.err.log"
    ;;

  *)
    echo "Usage: $0 {start|stop|restart|status|logs}"
    exit 1
    ;;
esac

