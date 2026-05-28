#!/usr/bin/env bash
set -euo pipefail

rm -f /tmp/.X99-lock

Xvfb :99 -screen 0 1360x820x24 -nolisten tcp &
sleep 1

fluxbox >/tmp/fluxbox.log 2>&1 &

x11vnc -display :99 -rfbport 5900 -forever -shared -nopw >/tmp/x11vnc.log 2>&1 &

websockify --web=/usr/share/novnc/ 6080 localhost:5900 >/tmp/novnc.log 2>&1 &

echo "TGWR is starting..."
echo "Open: http://localhost:6080/vnc.html?autoconnect=1"

exec npm run dev
