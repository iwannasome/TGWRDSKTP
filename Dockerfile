FROM node:26-bookworm-slim@sha256:2d49d876e96237d76de412761cf05dbfe5aee325cc4406a4d41d5824c5bb8beb

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    dbus-x11 \
    fluxbox \
    fonts-noto \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    novnc \
    procps \
    python-is-python3 \
    python3 \
    python3-venv \
    tini \
    websockify \
    x11vnc \
    xauth \
    xdg-utils \
    xvfb \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN python3 -m venv /app/.venv \
  && /app/.venv/bin/python -m pip install --no-cache-dir -r worker/requirements-runtime.txt \
  && chmod +x docker/entrypoint.sh \
  && mkdir -p /data /output /home/node/.cache /home/node/.config /tmp/.X11-unix \
  && chown -R node:node /app /data /output /home/node/.cache /home/node/.config \
  && chmod 1777 /tmp/.X11-unix \
  && chown root:root /app/node_modules/electron/dist/chrome-sandbox \
  && chmod 4755 /app/node_modules/electron/dist/chrome-sandbox

USER node

ENV DISPLAY=:99 \
  HOME=/home/node \
  LIBGL_ALWAYS_SOFTWARE=1 \
  NO_AT_BRIDGE=1

EXPOSE 6080

ENTRYPOINT ["tini", "--", "docker/entrypoint.sh"]
