# Запуск TGWR by IWS через Docker

Docker-режим нужен для проверки приложения в контейнере. Electron открывается через noVNC в браузере, а пользовательские данные монтируются в локальные папки `out/`.

## 1. Клонировать репозиторий

```bash
git clone https://github.com/iwannasome/TGWRDSKTP.git
cd TGWRDSKTP
```

## 2. Запустить через Docker Compose

```bash
docker compose up --build
```

Если установлен старый Compose:

```bash
docker-compose up --build
```

## 3. Открыть приложение

```text
http://127.0.0.1:6080/vnc.html?autoconnect=1&resize=scale
```

## 4. Папки внутри приложения

Локальная папка `out/docker-data` доступна внутри контейнера как:

```text
/data
```

Локальная папка `out/docker-output` доступна внутри контейнера как:

```text
/output
```

Положи экспорт Telegram Desktop в `out/docker-data`, а PNG/PDF/insight-карточки сохраняй в `/output`.

## Ручной запуск без Compose

```bash
docker build -t tgwr-docker:local .
docker run --rm \
  -p 6080:6080 \
  -v "$PWD/out/docker-data:/data" \
  -v "$PWD/out/docker-output:/output" \
  tgwr-docker:local
```

Windows PowerShell:

```powershell
docker run --rm `
  -p 6080:6080 `
  -v "${PWD}/out/docker-data:/data" `
  -v "${PWD}/out/docker-output:/output" `
  tgwr-docker:local
```

## Остановить

Для Compose:

```bash
docker compose down
```

Для ручного контейнера с именем:

```bash
docker stop tgwr
```
