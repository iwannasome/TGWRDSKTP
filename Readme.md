# TGWR by IWS

> Приватный Telegram Wrapped, который работает на компьютере пользователя и не отправляет переписки в сеть.

TGWR импортирует официальный экспорт Telegram Desktop, собирает персональную историю за выбранный год или за всё время, объясняет выводы цифрами и экспортирует результат в PNG/PDF.

Текущая версия: **0.2.0**.

## Что умеет TGWR

- полностью локально импортирует JSON и HTML из Telegram Desktop;
- анализирует личные диалоги, не смешивая их с группами и каналами;
- предлагает последний достаточно наполненный год и позволяет выбрать другой;
- динамически собирает историю максимум из 14 содержательных слайдов;
- показывает до четырёх сильных conversation insights без пустых «победителей»;
- ограничивает повтор одного человека в featured-истории;
- оставляет все 14 аналитических сигналов в разделе «Люди»;
- экспортирует весь Wrapped в PNG/PDF и отдельный insight в вертикальную PNG-карточку;
- перед экспортом показывает точный Share Preview;
- умеет скрыть имена, фрагменты сообщений и точные даты;
- объясняет, какие чаты были пропущены при импорте и почему;
- различает пересборку отчёта и полное удаление локальной базы.

## Быстрый пользовательский путь

1. В Telegram Desktop открой `Настройки → Продвинутые настройки → Экспорт данных из Telegram`.
2. Выбери личные чаты и машиночитаемый JSON. HTML тоже поддерживается, но JSON надёжнее передаёт ID и направление сообщений.
3. Запусти установленный TGWR и выбери папку экспорта.
4. Проверь сводку импорта и выбери год.
5. Открой Wrapped, Explore или экспорт.

В установленной версии **не нужно отдельно устанавливать Node.js или Python**. Python worker заранее собирается в нативный бинарник под Windows, macOS или Linux и поставляется внутри приложения.

## Приватность и локальные данные

- исходный Telegram Export читается локально;
- нормализованные сообщения хранятся в `tgwr.db` внутри стандартного каталога `userData` Electron;
- готовый отчёт хранится рядом в `report.json`;
- приложение не содержит телеметрии, загрузки переписок или удалённой аналитики;
- renderer не получает прямой доступ к Node.js, произвольным путям базы или произвольным worker-командам;
- запись PNG/PDF разрешена только в папку, выбранную пользователем в текущем сеансе.

Действия с данными разделены намеренно:

- **«Пересобрать отчёт»** удаляет только `report.json`, сохраняя импортированную базу;
- **«Стереть все данные»** сначала останавливает модуль анализа, затем удаляет `tgwr.db`, его служебные `-wal`/`-shm`-файлы, `report.json`, кэш отчётов и незавершённый временный импорт. После очистки модуль запускается заново для нового импорта.

## Продуктовые ограничения версии 0.2

- интерфейс и правила времени ориентированы на русскоязычную версию;
- календарные метрики считаются по московскому времени UTC+3;
- два служебных Telegram ID владельца проекта намеренно исключены из people-аналитики;
- группы и каналы не участвуют в персональных рейтингах;
- поведенческие insights являются объяснимыми эвристиками, а не психологическими диагнозами;
- installer без подписи ОС может показывать предупреждение до подключения сертификатов релиза.

## Запуск из исходников

Для разработки нужны:

- Node.js `20.19+` (рекомендуется Node 22);
- npm `10+`;
- Python `3.9+`.

```bash
git clone https://github.com/iwannasome/TGWRDSKTP.git
cd TGWRDSKTP
npm ci
npm run dev
```

Dev-режим запускает `worker/tgwr_worker.py` через системный Python. PyInstaller для обычной разработки не требуется.

## Проверка и сборка

Полный `verify` дополнительно собирает нативный worker, поэтому сначала подготовь Python-окружение.

macOS/Linux:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r worker/requirements-build.txt
npm run verify
```

Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r worker\requirements-build.txt
npm run verify
```

Основные команды:

```bash
npm run typecheck       # TypeScript
npm run test:worker     # анонимизированные import fixtures
npm run test:synthetic  # полный synthetic report и browser smoke при наличии Chrome
npm run worker:build    # PyInstaller binary текущей ОС/архитектуры
npm run worker:smoke    # JSONL ping замороженному worker
npm run pack            # распакованное Electron-приложение
npm run verify          # весь локальный release gate
```

Установщики:

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

PyInstaller не выполняет кросс-компиляцию. Windows worker собирается на Windows, macOS worker — отдельно на Intel и ARM64, Linux worker — на Linux. Именно так устроена GitHub Actions matrix.

Подробный релизный процесс описан в [docs/RELEASING.md](docs/RELEASING.md).

## Docker/noVNC

Docker остаётся способом разработки и удалённой проверки интерфейса:

```bash
docker compose up --build
```

После запуска открой:

```text
http://localhost:6080/vnc.html?autoconnect=1&resize=scale
```

- `out/docker-data` доступен контейнеру как `/data`;
- `out/docker-output` доступен как `/output`.

## Архитектура

- Electron main process — окно, безопасный IPC, data lifecycle и запуск worker;
- React + TypeScript — setup, Wrapped, Details, People и Share Preview;
- Python + SQLite — импорт, нормализация, метрики и `report.json`;
- JSONL по stdin/stdout — локальный протокол Electron ↔ worker;
- PyInstaller — нативный worker для конечного пользователя;
- electron-builder — NSIS, DMG, AppImage, DEB и RPM;
- GitHub Actions — fixtures, browser smoke и нативная package/release matrix.

## Автор

TGWR / Telegram Wrapped создан **iwannasome**.

Авторский канал: [IWANNASOME](https://t.me/shizikjke).
