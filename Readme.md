


# 📊 TGWR by IWS

> **Telegram Wrapped для обычных людей. Полностью локально. Без серверов.**

**TGWR by IWS** — это десктопное приложение, которое анализирует официальный экспорт Telegram Desktop и собирает персональный Wrapped за год или за всё время. Внутри есть story deck, подробный Explore по людям, 14 понятных conversation insights и экспорт отдельных инсайтов в PNG-карточки с аккуратным IWS-водяным знаком.

Вся магия происходит **строго локально** на твоем компьютере с помощью Python-воркера. Ни один байт твоей личной переписки не уходит в интернет.

---

## ✨ Фичи
* **Абсолютная приватность:** импорт, анализ и экспорт работают локально на компьютере.
* **14 conversation insights:** главный человек, стабильный диалог, камбэк, сближение, затухание, ночной собеседник, взаимность, медиа-связь и другие выводы с confidence label.
* **Проверяемые доказательства:** Explore показывает победителя, кандидатов, пороги качества и evidence-цифры, а не просто красивый текст.
* **Год и всё время:** `year` и `all_time` считаются отдельно, без деградации режима “за всё время”.
* **Story deck:** слайды для шаринга с обновленным people-first нарративом и `TGWR by IWS` брендингом.
* **Кастомизация:** 3 встроенные цветовые темы (Neon, Cyber, Midnight).
* **Удобный экспорт:** Wrapped можно сохранить в `PNG` постранично или `PDF`; отдельный insight можно экспортировать как 9:16 PNG-карточку.

---

## 📦 Шаг 1. Подготовка (Что нужно установить)

Для запуска проекта в режиме разработчика тебе понадобятся:
1. [Node.js](https://nodejs.org/) (версия 20.19 или выше; Node 22 LTS тоже подходит).
2. [Python](https://www.python.org/downloads/) (версия 3.9 или выше).
3. Пакетный менеджер `npm` (идет вместе с Node.js) или `yarn`/`pnpm`.

---

## 🗂 Шаг 2. Как получить данные из Telegram

TGWR работает с официальным бэкапом Telegram Desktop.

1. Открой **Telegram Desktop** на компьютере.
2. Перейди в `Настройки` → `Продвинутые настройки` → `Экспорт данных из Telegram`.
3. Отметь **Личные чаты**. Текущая версия TGWR строит персональную статистику по личным диалогам; групповые чаты импортом пропускаются.
4. **ВАЖНО:** В самом низу выбери формат **Машиночитаемый JSON**.
5. Нажми «Экспортировать» и дождись завершения.

---

## 🚀 Шаг 3. Запуск проекта

Так как под капотом работает связка `Electron (Node.js) + React` и `Python`, запуск немного отличается в зависимости от твоей операционной системы. 

### 🐳 Docker (Windows / macOS / Linux)

Этот способ удобен для проверки проекта на любом компьютере, где установлен Docker: приложение запускается внутри контейнера, а окно Electron открывается через браузер с помощью noVNC.

1. Склонируй репозиторий и перейди в папку проекта:
```bash
git clone <ссылка_на_репозиторий>
cd tgwr
```

2. Запусти через Docker Compose:
```bash
docker compose up --build
```

Если Docker пишет, что команды `docker compose` нет, используй старый вариант:
```bash
docker-compose up --build
```

3. Открой в браузере:
```text
http://localhost:6080/vnc.html?autoconnect=1&resize=scale
```

Папка `out/docker-data` на компьютере видна внутри приложения как `/data` — туда удобно положить экспорт Telegram. Папка `out/docker-output` видна как `/output` — туда можно сохранять PNG/PDF. Папка `out/` уже игнорируется git.

Если нужно запустить без Compose, собери образ вручную:
```bash
docker build -t tgwr-docker:local .
```

Windows CMD:
```bash
docker run --rm -p 6080:6080 -v "%cd%/out/docker-data:/data" -v "%cd%/out/docker-output:/output" tgwr-docker:local
```

Windows PowerShell:
```powershell
docker run --rm -p 6080:6080 -v "${PWD}/out/docker-data:/data" -v "${PWD}/out/docker-output:/output" tgwr-docker:local
```

macOS/Linux:
```bash
docker run --rm -p 6080:6080 -v "$PWD/out/docker-data:/data" -v "$PWD/out/docker-output:/output" tgwr-docker:local
```

### 🪟 Windows
1. Склонируй репозиторий и перейди в папку проекта:
```bash
git clone <ссылка_на_репозиторий>
cd tgwr

```

2. Установи зависимости Node.js:
```bash
npm install

```


3. Убедись, что Python добавлен в переменные среды (PATH). Проверить можно командой:
```bash
python --version

```


4. Запусти приложение в режиме разработчика:
```bash
npm run dev

```



### 🍎 macOS

1. Открой терминал, склонируй репозиторий и перейди в него:
```bash
git clone <ссылка_на_репозиторий>
cd tgwr

```


2. Установи зависимости:
```bash
npm install

```


3. В macOS Python 3 обычно вызывается командой `python3`. Наш Electron-скрипт умеет это распознавать, но на всякий случай убедись, что он установлен:
```bash
python3 --version

```


4. Запусти приложение:
```bash
npm run dev

```



### 🐧 Linux

1. Склонируй проект:
```bash
git clone <ссылка_на_репозиторий>
cd tgwr

```


2. Установи Node.js зависимости:
```bash
npm install

```


3. Убедись, что у тебя установлен `python3` (например, через `sudo apt install python3` для Ubuntu/Debian).
4. Запусти проект:
```bash
npm run dev

```



*(При запуске `npm run dev` Electron сам поднимет Python-воркер в фоновом режиме. Тебе нужно будет только указать путь к папке `DataExport...` в интерфейсе программы).*

---

## 📦 Сборка релизов

```bash
npm run verify
npm run dist:win
npm run dist:mac
npm run dist:linux
```

Текущие targets:
* Windows: `NSIS .exe`
* macOS: `.dmg`
* Linux: `.AppImage`, `.deb`, `.rpm`

Для сборки `.deb`/`.rpm` на Fedora/RHEL-подобных системах может понадобиться совместимость `libcrypt.so.1` для `fpm`:

```bash
sudo dnf install libxcrypt-compat
```

Кросс-сборка зависит от ОС и окружения electron-builder. Для релизного пайплайна лучше собирать Windows на Windows, macOS на macOS, Linux на Linux.

---

## 🛠 Технологический стек

* **Frontend UI:** React, TypeScript, TailwindCSS, Framer Motion, HTML-to-Image.
* **Backend / Host:** Electron, Vite.
* **Data Processing (Worker):** Python 3, SQLite3, IPC JSONL Protocol.

---
<br/>
<br/>

<div align="center">

```text
 /$$$$$$        /$$      /$$        /$$$$$$ 
|_  $$_/       | $$  /$ | $$       /$$__  $$
   | $$        | $$ /$$$| $$      | $$  \__/
   | $$        | $$/$$ $$ $$      |  $$$$$$ 
   | $$        | $$$$_  $$$$       \____  $$
   | $$        | $$$/ \  $$$       /$$  \ $$
  /$$$$$$      | $$/   \  $$      |  $$$$$$/
 |______/      |__/     \__/       \______/ 
                                               
```                                            
                                               



```text
   TGWR_by_IWS_v0.1.0 
```    
                           
      ✧ ᴍᴀᴅᴇ ʙʏ IWANNASOME ꜰᴇᴀᴛ. dvunya ꜰᴇᴀᴛ TeMyCh ✧
      
</div>
