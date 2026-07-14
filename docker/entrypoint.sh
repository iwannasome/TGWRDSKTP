#!/usr/bin/env bash
set -euo pipefail

rm -f /tmp/.X99-lock

Xvfb :99 -screen 0 1360x820x24 -nolisten tcp &
sleep 1

fluxbox >/tmp/fluxbox.log 2>&1 &

novnc_password="${TGWR_NOVNC_PASSWORD:-$(node -e "process.stdout.write(require('node:crypto').randomBytes(12).toString('base64url'))")}"
password_file=/tmp/tgwr-vnc.pass
x11vnc -storepasswd "$novnc_password" "$password_file" >/dev/null
chmod 600 "$password_file"
x11vnc -display :99 -rfbport 5900 -localhost -forever -shared -rfbauth "$password_file" >/tmp/x11vnc.log 2>&1 &

websockify --web=/usr/share/novnc/ 6080 localhost:5900 >/tmp/novnc.log 2>&1 &

echo "TGWR is starting..."
echo "Open: http://localhost:6080/vnc.html?autoconnect=1"
echo "One-time noVNC password: $novnc_password"

exec npm run dev
